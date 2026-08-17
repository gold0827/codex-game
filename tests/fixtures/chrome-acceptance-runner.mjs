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
  if (!port) throw new Error("Could not allocate a Chrome acceptance port.");
  return port;
}

async function waitForValue(read, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const value = await read();
      if (value) return value;
    } catch {
      // The local server, browser, or page may still be starting.
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

function evaluationError(evaluation, label) {
  if (!evaluation.exceptionDetails) return null;
  const description = evaluation.exceptionDetails.exception?.description ??
    evaluation.exceptionDetails.text;
  return new Error(`${label} threw: ${description}`);
}

export async function runChromeAcceptance(run) {
  const chromePath = chromeCandidates.find((candidate) => existsSync(candidate));
  if (!chromePath) throw new Error("Chrome executable not found. Set CHROME_PATH.");

  const [serverPort, debugPort] = await Promise.all([availablePort(), availablePort()]);
  const profileRoot = await mkdtemp(join(tmpdir(), "codex-game-chrome-"));
  const baseUrl = `http://127.0.0.1:${serverPort}/codex-game/`;
  const vite = spawn(
    process.execPath,
    [
      "node_modules/vite/bin/vite.js",
      "--host",
      "127.0.0.1",
      "--port",
      String(serverPort),
      "--strictPort",
    ],
    { cwd: projectRoot, stdio: "ignore", windowsHide: true },
  );
  let chrome = null;
  let cdp = null;

  try {
    await waitForValue(async () => {
      const response = await fetch(baseUrl);
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
    const browserErrors = [];
    cdp.on("Runtime.exceptionThrown", ({ exceptionDetails }) => {
      browserErrors.push(
        exceptionDetails.exception?.description ?? exceptionDetails.text,
      );
    });
    cdp.on("Runtime.consoleAPICalled", ({ type, args }) => {
      if (type !== "error") return;
      browserErrors.push(args.map((argument) =>
        argument.value ?? argument.description ?? argument.type
      ).join(" "));
    });
    cdp.on("Log.entryAdded", ({ entry }) => {
      if (entry.level === "error") browserErrors.push(entry.text);
    });
    await cdp.call("Page.enable");
    await cdp.call("Runtime.enable");
    await cdp.call("Log.enable");
    await cdp.call("Emulation.setDeviceMetricsOverride", {
      width: 1_440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await cdp.call("Emulation.setFocusEmulationEnabled", { enabled: true });

    const evaluate = async (expression, label = "Chrome evaluation") => {
      const evaluation = await cdp.call("Runtime.evaluate", {
        expression,
        awaitPromise: true,
        returnByValue: true,
      });
      const error = evaluationError(evaluation, label);
      if (error) throw error;
      return evaluation.result.value;
    };
    const navigate = async ({ path, readyExpression, readyLabel }) => {
      await cdp.call("Page.navigate", { url: new URL(path, baseUrl).href });
      await cdp.call("Page.bringToFront");
      await waitForValue(
        () => evaluate(readyExpression, `${readyLabel} readiness check`),
        10_000,
        readyLabel,
      );
    };
    const importFixture = async (modulePath, label) => {
      await evaluate(`import(${JSON.stringify(modulePath)})`, label);
    };

    const result = await run({ evaluate, importFixture, navigate });
    return { browserErrors, result };
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
}
