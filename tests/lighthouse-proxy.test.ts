import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer as createHttpServer, get } from "node:http";
import { connect, createServer, type Socket } from "node:net";
import test, { type TestContext } from "node:test";
import { createLighthouseProxy } from "../lib/lighthouse-proxy";

async function tcpFixture(t: TestContext, onSocket: (socket: Socket) => void) {
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on("error", () => socket.destroy());
    socket.once("close", () => sockets.delete(socket));
    onSocket(socket);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return address.port;
}

async function clientFor(t: TestContext, port: number) {
  const socket = connect({ host: "127.0.0.1", port });
  socket.on("error", () => {});
  t.after(() => socket.destroy());
  await once(socket, "connect");
  return socket;
}

function readUntil(socket: Socket, marker: string) {
  return new Promise<string>((resolve, reject) => {
    let received = "";
    const timer = setTimeout(() => { cleanup(); reject(new Error(`Missing ${marker}`)); }, 3000);
    const cleanup = () => { clearTimeout(timer); socket.off("data", onData); socket.off("error", onError); socket.off("end", onEnd); };
    const onData = (chunk: Buffer) => { received += chunk.toString(); if (received.includes(marker)) { cleanup(); resolve(received); } };
    const onError = (error: Error) => { cleanup(); reject(error); };
    const onEnd = () => { cleanup(); reject(new Error("Connection ended early")); };
    socket.on("data", onData).on("error", onError).on("end", onEnd);
  });
}

async function openTunnel(t: TestContext, proxyPort: number, targetPort: number) {
  const client = await clientFor(t, proxyPort);
  const response = readUntil(client, "200 Connection Established\r\n\r\n");
  client.write(`CONNECT public.example:${targetPort} HTTP/1.1\r\nHost: public.example:${targetPort}\r\n\r\n`);
  await response;
  return client;
}

test("CONNECT forwards buffered head bytes and data in both directions", { timeout: 5000 }, async (t) => {
  const port = await tcpFixture(t, (socket) => socket.pipe(socket));
  const proxy = await createLighthouseProxy({ resolveHostname: async () => ["127.0.0.1"] });
  t.after(() => proxy.close());
  const client = await clientFor(t, proxy.port);
  const response = readUntil(client, "early-data");
  client.write(`CONNECT public.example:${port} HTTP/1.1\r\nHost: public.example:${port}\r\n\r\nearly-data`);
  assert.match(await response, /200 Connection Established/);
  const echo = readUntil(client, "next-data");
  client.write("next-data");
  assert.match(await echo, /next-data/);
});

test("ECONNABORTED on a piped browser socket closes the tunnel without crashing the proxy", { timeout: 5000 }, async (t) => {
  let remote: Socket | undefined;
  const port = await tcpFixture(t, (socket) => { remote = socket; socket.pipe(socket); });
  const proxy = await createLighthouseProxy({ resolveHostname: async () => ["127.0.0.1"] });
  t.after(() => proxy.close());
  let browserSocket: Socket | undefined;
  proxy.server.once("connection", (socket) => { browserSocket = socket; });
  const client = await openTunnel(t, proxy.port, port);
  assert.ok(browserSocket && remote);
  const remoteClosed = once(remote, "close");
  const clientClosed = once(client, "close");
  const error = Object.assign(new Error("write ECONNABORTED"), { code: "ECONNABORTED", syscall: "write" });
  assert.doesNotThrow(() => browserSocket!.emit("error", error));
  await Promise.all([remoteClosed, clientClosed]);
  assert.equal(browserSocket.destroyed, true);
  // A new request must still work after the failed tunnel.
  const nextClient = await openTunnel(t, proxy.port, port);
  const echo = readUntil(nextClient, "still-running");
  nextClient.write("still-running");
  assert.match(await echo, /still-running/);
});

test("upstream disconnect closes the browser side of the CONNECT tunnel", { timeout: 5000 }, async (t) => {
  let remote: Socket | undefined;
  const port = await tcpFixture(t, (socket) => { remote = socket; });
  const proxy = await createLighthouseProxy({ resolveHostname: async () => ["127.0.0.1"] });
  t.after(() => proxy.close());
  const client = await openTunnel(t, proxy.port, port);
  const closed = once(client, "close");
  remote!.destroy();
  await closed;
});

test("proxy close destroys open tunnels promptly and is idempotent", { timeout: 5000 }, async (t) => {
  const port = await tcpFixture(t, () => {});
  const proxy = await createLighthouseProxy({ resolveHostname: async () => ["127.0.0.1"] });
  t.after(() => proxy.close());
  const client = await openTunnel(t, proxy.port, port);
  const closed = once(client, "close");
  await Promise.all([proxy.close(), proxy.close(), closed]);
  assert.equal(proxy.server.listening, false);
});

test("closing while DNS is pending cannot create a late upstream connection", { timeout: 5000 }, async (t) => {
  let accepted = 0;
  const port = await tcpFixture(t, () => { accepted++; });
  let finishLookup!: () => void;
  const lookup = new Promise<void>((resolve) => { finishLookup = resolve; });
  const proxy = await createLighthouseProxy({ resolveHostname: async () => { await lookup; return ["127.0.0.1"]; } });
  t.after(() => proxy.close());
  const client = await clientFor(t, proxy.port);
  client.resume();
  const connected = once(proxy.server, "connect");
  client.write(`CONNECT public.example:${port} HTTP/1.1\r\nHost: public.example\r\n\r\n`);
  await connected;
  await proxy.close();
  finishLookup();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(accepted, 0);
});

test("idle tunnels time out instead of holding a scan open", { timeout: 5000 }, async (t) => {
  const port = await tcpFixture(t, () => {});
  const proxy = await createLighthouseProxy({ resolveHostname: async () => ["127.0.0.1"], idleTimeoutMs: 100 });
  t.after(() => proxy.close());
  const client = await openTunnel(t, proxy.port, port);
  await once(client, "close");
});

test("HTTP proxy survives truncated upstream responses and forwards subsequent responses", { timeout: 5000 }, async (t) => {
  const server = createHttpServer((request, response) => {
    response.on("error", () => {});
    if (request.url === "/broken") {
      response.writeHead(200, { "Content-Length": "1000" });
      response.write("partial");
      setTimeout(() => response.destroy(), 10);
    } else response.end("healthy");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise<void>((resolve) => { server.close(() => resolve()); server.closeAllConnections(); }));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const proxy = await createLighthouseProxy({ resolveHostname: async () => ["127.0.0.1"] });
  t.after(() => proxy.close());
  await new Promise<void>((resolve) => {
    const request = get({ host: "127.0.0.1", port: proxy.port, path: `http://public.example:${address.port}/broken` }, (response) => {
      response.on("error", () => resolve());
      response.on("aborted", () => resolve());
      response.resume();
      response.on("end", () => resolve());
    });
    request.on("error", () => resolve());
  });
  const result = await new Promise<string>((resolve, reject) => {
    get({ host: "127.0.0.1", port: proxy.port, path: `http://public.example:${address.port}/ok` }, (response) => {
      let body = "";
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => resolve(body));
      response.on("error", reject);
    }).on("error", reject);
  });
  assert.equal(result, "healthy");
});

test("production resolver still blocks private proxy destinations", { timeout: 5000 }, async (t) => {
  const proxy = await createLighthouseProxy();
  t.after(() => proxy.close());
  const status = await new Promise<number | undefined>((resolve, reject) => {
    get({ host: "127.0.0.1", port: proxy.port, path: "http://127.0.0.1:80/" }, (response) => {
      response.resume();
      response.on("end", () => resolve(response.statusCode));
    }).on("error", reject);
  });
  assert.equal(status, 403);
  const client = await clientFor(t, proxy.port);
  client.resume();
  const closed = once(client, "close");
  client.write("CONNECT 169.254.169.254:80 HTTP/1.1\r\nHost: 169.254.169.254\r\n\r\n");
  await closed;
});
