import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { spawn } from "node:child_process";

const projectRoot = resolve(import.meta.dirname, "../..");
const chromeCandidates = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);
const chromePath = chromeCandidates.find((candidate) => existsSync(candidate));
if (!chromePath) throw new Error("Chrome executable not found. Set CHROME_PATH.");

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

async function availablePort() {
  const server = createServer();
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : null;
  await new Promise((resolveClose) => server.close(resolveClose));
  if (!port) throw new Error("Could not allocate a Chrome debugging port.");
  return port;
}

async function waitForValue(read, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const value = await read();
      if (value) return value;
    } catch {
      // The local server or browser may still be starting.
    }
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

async function waitForExit(child, timeoutMs = 5_000) {
  if (!child || child.exitCode !== null) return;
  await Promise.race([
    new Promise((resolveExit) => child.once("exit", resolveExit)),
    delay(timeoutMs),
  ]);
}

async function connectCdp(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  const pending = new Map();
  const listeners = new Map();
  let nextId = 1;
  await new Promise((resolveOpen, reject) => {
    socket.addEventListener("open", resolveOpen, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(String(data));
    if (!message.id) {
      listeners.get(message.method)?.forEach((listener) => listener(message.params));
      return;
    }
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });
  return {
    call(method, params = {}) {
      const id = nextId;
      nextId += 1;
      return new Promise((resolveCall, reject) => {
        pending.set(id, { resolve: resolveCall, reject });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    on(method, listener) {
      const methodListeners = listeners.get(method) ?? [];
      methodListeners.push(listener);
      listeners.set(method, methodListeners);
    },
    close() {
      socket.close();
    },
  };
}

const profileRoot = await mkdtemp(join(tmpdir(), "codex-game-chrome-"));
const debugPort = await availablePort();
const vite = spawn(
  process.execPath,
  ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "4173", "--strictPort"],
  { cwd: projectRoot, stdio: "ignore", windowsHide: true },
);
let chrome = null;
let cdp = null;

try {
  await waitForValue(async () => {
    const response = await fetch("http://127.0.0.1:4173/codex-game/");
    return response.ok;
  }, 10_000, "Vite");

  chrome = spawn(chromePath, [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows",
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profileRoot}`,
    "--window-size=1462,998",
    "about:blank",
  ], { stdio: "ignore", windowsHide: true });

  const target = await waitForValue(async () => {
    const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
    const targets = await response.json();
    return targets.find(({ type }) => type === "page");
  }, 10_000, "Chrome DevTools");
  cdp = await connectCdp(target.webSocketDebuggerUrl);
  const productionErrors = [];
  cdp.on("Runtime.exceptionThrown", ({ exceptionDetails }) => {
    productionErrors.push(
      exceptionDetails.exception?.description ?? exceptionDetails.text,
    );
  });
  cdp.on("Runtime.consoleAPICalled", ({ type, args }) => {
    if (type !== "error") return;
    productionErrors.push(args.map((argument) =>
      argument.value ?? argument.description ?? argument.type
    ).join(" "));
  });
  cdp.on("Log.entryAdded", ({ entry }) => {
    if (entry.level === "error") productionErrors.push(entry.text);
  });
  await cdp.call("Page.enable");
  await cdp.call("Runtime.enable");
  await cdp.call("Log.enable");
  await cdp.call("Emulation.setFocusEmulationEnabled", { enabled: true });
  await cdp.call("Page.navigate", { url: "http://127.0.0.1:4173/codex-game/" });
  await cdp.call("Page.bringToFront");
  await waitForValue(async () => {
    const evaluation = await cdp.call("Runtime.evaluate", {
      expression: `document.querySelector("#app [data-phase='briefing']") !== null`,
      returnByValue: true,
    });
    return evaluation.result.value;
  }, 10_000, "the production bridge briefing");

  const fixtureEvaluation = await cdp.call("Runtime.evaluate", {
    expression: `import("/codex-game/tests/fixtures/bridge-defense-chrome.ts")`,
    awaitPromise: true,
    returnByValue: true,
  });
  if (fixtureEvaluation.exceptionDetails) {
    const description = fixtureEvaluation.exceptionDetails.exception?.description ??
      fixtureEvaluation.exceptionDetails.text;
    throw new Error(`Chrome fixture threw: ${description}`);
  }
  const evaluation = await cdp.call("Runtime.evaluate", {
    expression: `(() => {
      const output = document.querySelector("#fixture-result")?.textContent;
      return {
        url: location.pathname,
        result: output ? JSON.parse(output) : null,
        phase: document.querySelector("#app [data-phase]")?.dataset.phase ?? null,
        operationClock: document.querySelector(".operation-clock")?.textContent ?? null,
      };
    })()`,
    returnByValue: true,
  });
  const gameReport = evaluation.result.value;

  await cdp.call("Page.navigate", {
    url: "http://127.0.0.1:4173/codex-game/?editor=1",
  });
  await cdp.call("Page.bringToFront");
  await waitForValue(async () => {
    const nextEvaluation = await cdp.call("Runtime.evaluate", {
      expression: `document.querySelector("#app [data-phase='briefing']") !== null`,
      returnByValue: true,
    });
    return nextEvaluation.result.value;
  }, 10_000, "the editor-enabled bridge briefing");
  const overlayEvaluation = await cdp.call("Runtime.evaluate", {
    expression: `import("/codex-game/tests/fixtures/workbench-overlays-chrome.ts")`,
    awaitPromise: true,
    returnByValue: true,
  });
  if (overlayEvaluation.exceptionDetails) {
    const description = overlayEvaluation.exceptionDetails.exception?.description ??
      overlayEvaluation.exceptionDetails.text;
    throw new Error(`Overlay fixture threw: ${description}`);
  }
  const overlayResultEvaluation = await cdp.call("Runtime.evaluate", {
    expression: `globalThis.__overlayFixtureResult ?? null`,
    returnByValue: true,
  });
  const overlayResult = overlayResultEvaluation.result.value;
  const passed = gameReport.url === "/codex-game/" &&
    gameReport.result?.passed === true &&
    overlayResult?.passed === true &&
    productionErrors.length === 0;
  process.stdout.write(`${JSON.stringify({
    passed,
    ...gameReport,
    overlayResult,
    productionErrors,
  })}\n`);
  if (!passed) process.exitCode = 1;
} finally {
  if (cdp) {
    try {
      await cdp.call("Browser.close");
    } catch {
      // Chrome may already have exited after a failed check.
    }
    cdp.close();
  }
  chrome?.kill();
  vite.kill();
  await Promise.all([waitForExit(chrome), waitForExit(vite)]);
  const resolvedProfile = resolve(profileRoot);
  const safeProfile = resolvedProfile.startsWith(`${resolve(tmpdir())}${sep}`) &&
    basename(resolvedProfile).startsWith("codex-game-chrome-");
  if (safeProfile) {
    await rm(resolvedProfile, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 200,
    });
  }
}
