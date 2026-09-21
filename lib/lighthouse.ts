import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { promisify } from "node:util";
import { createLighthouseProxy } from "./lighthouse-proxy";
import { assertPublicUrl } from "./url-safety";

export type LighthouseResult = {
  categories?: Record<string, { score: number | null }>;
  audits?: Record<string, { score: number | null; numericValue?: number; displayValue?: string }>;
};

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);

export async function runLighthouse(url: string): Promise<LighthouseResult> {
  await assertPublicUrl(url);
  const proxy = await createLighthouseProxy();
  let chrome: Awaited<ReturnType<typeof import("chrome-launcher").launch>> | undefined;
  try {
    const { launch } = await import("chrome-launcher");
    // Own Chrome in the worker, so killing a timed-out CLI cannot leave its browser behind.
    chrome = await launch({
      handleSIGINT: false,
      chromeFlags: ["--headless", "--disable-dev-shm-usage", ...(process.env.CHROME_NO_SANDBOX === "1" ? ["--no-sandbox"] : []), `--proxy-server=http://127.0.0.1:${proxy.port}`, "--proxy-bypass-list=<-loopback>"],
    });
    const { stdout } = await execFileAsync(process.execPath, [
      require.resolve("lighthouse/cli/index.js"), url,
      `--port=${chrome.port}`, "--output=json", "--output-path=stdout",
      "--only-categories=performance,seo,best-practices", "--quiet",
    ], { maxBuffer: 25 * 1024 * 1024, timeout: 120_000, killSignal: "SIGKILL", windowsHide: true });
    return JSON.parse(stdout) as LighthouseResult;
  } finally {
    try { await chrome?.kill(); }
    finally { await proxy.close(); }
  }
}
