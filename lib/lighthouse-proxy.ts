import { createServer, request as httpRequest, type ClientRequest, type IncomingMessage, type ServerResponse } from "node:http";
import { connect, type Socket } from "node:net";
import type { Duplex } from "node:stream";
import { resolvePublicHostname } from "./url-safety";

type ProxyOptions = {
  resolveHostname?: typeof resolvePublicHostname;
  idleTimeoutMs?: number;
};

export async function createLighthouseProxy(options: ProxyOptions = {}) {
  const resolveHostname = options.resolveHostname ?? resolvePublicHostname;
  const idleTimeoutMs = options.idleTimeoutMs ?? 30_000;
  const sockets = new Set<Socket>();
  let closing = false;

  function track(socket: Socket) {
    sockets.add(socket);
    // Attach before DNS lookup, CONNECT setup, or pipe() can yield/write.
    socket.on("error", () => socket.destroy());
    socket.once("close", () => sockets.delete(socket));
    socket.setTimeout(idleTimeoutMs, () => socket.destroy());
    if (closing) socket.destroy();
  }

  function sendError(response: ServerResponse, status: number) {
    if (response.destroyed || response.writableEnded) return;
    if (response.headersSent) response.destroy();
    else response.writeHead(status).end(status === 403 ? "Blocked destination" : "Upstream unavailable");
  }

  async function proxyHttpRequest(request: IncomingMessage, response: ServerResponse) {
    let upstream: ClientRequest | undefined;
    let upstreamResponse: IncomingMessage | undefined;
    const stop = () => { upstreamResponse?.destroy(); upstream?.destroy(); };
    request.on("error", () => { stop(); response.destroy(); });
    request.once("aborted", stop);
    response.on("error", stop);
    response.once("close", stop);
    try {
      const target = new URL(request.url || "", `http://${request.headers.host || ""}`);
      if (target.protocol !== "http:" || target.username || target.password) throw new Error("Unsupported proxy URL");
      const address = (await resolveHostname(target.hostname))[0];
      if (!address) throw new Error("No public address");
      if (closing || request.aborted || response.destroyed) return;
      upstream = httpRequest({
        hostname: address, port: Number(target.port || 80), method: request.method,
        path: `${target.pathname}${target.search}`,
        headers: { ...request.headers, connection: "close", host: target.host }, agent: false,
      }, (incoming) => {
        upstreamResponse = incoming;
        incoming.on("error", () => { stop(); response.destroy(); });
        incoming.once("aborted", () => { stop(); response.destroy(); });
        if (closing || response.destroyed || response.writableEnded) { stop(); return; }
        response.writeHead(incoming.statusCode || 502, incoming.headers);
        incoming.pipe(response);
      });
      upstream.on("socket", track);
      upstream.on("error", () => { stop(); sendError(response, 502); });
      upstream.setTimeout(idleTimeoutMs, () => upstream?.destroy(new Error("Proxy request timed out")));
      request.pipe(upstream);
    } catch {
      stop();
      sendError(response, 403);
    }
  }

  async function proxyHttpsRequest(request: IncomingMessage, client: Duplex, head: Buffer) {
    let upstream: Socket | undefined;
    const stop = () => {
      if (upstream) { client.unpipe(upstream); upstream.unpipe(client); upstream.destroy(); }
      client.destroy();
    };
    // Keep the error listeners for the lifetime of each stream, including late writes.
    client.on("error", stop);
    client.once("close", stop);
    request.on("error", stop);
    try {
      const target = new URL(`https://${request.url}`);
      if (target.username || target.password || target.pathname !== "/" || target.search || target.hash) throw new Error("Invalid CONNECT authority");
      const address = (await resolveHostname(target.hostname))[0];
      if (!address) throw new Error("No public address");
      if (closing || client.destroyed) return;
      upstream = connect({ host: address, port: Number(target.port || 443) });
      track(upstream);
      upstream.on("error", stop);
      upstream.once("close", stop);
      upstream.once("connect", () => {
        if (closing || client.destroyed || !upstream || upstream.destroyed) { stop(); return; }
        client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        if (head.length) upstream.write(head);
        client.pipe(upstream);
        upstream.pipe(client);
      });
    } catch { stop(); }
  }

  const server = createServer((request, response) => { void proxyHttpRequest(request, response); });
  server.on("connection", track);
  server.on("connect", (request, client, head) => { void proxyHttpsRequest(request, client, head); });
  server.on("clientError", (_error, socket) => socket.destroy());
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => { server.removeListener("error", reject); resolve(); });
  });
  // Unexpected server errors also close owned sockets instead of becoming uncaught events.
  server.on("error", () => { closing = true; for (const socket of sockets) socket.destroy(); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Lighthouse proxy did not expose a TCP port.");

  let closed: Promise<void> | undefined;
  return {
    port: address.port,
    server,
    close() {
      if (closed) return closed;
      closing = true;
      closed = new Promise<void>((resolve, reject) => {
        // server.close() alone does not close CONNECT tunnels.
        server.close((error) => error ? reject(error) : resolve());
        for (const socket of sockets) socket.destroy();
      });
      return closed;
    },
  };
}
