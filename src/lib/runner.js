import { PYODIDE_URLS, TIMEOUTS } from "../config.js";
import { post } from "./api.js";

/**
 * One place to run code:
 *  - JavaScript and Python run instantly in the browser (sandboxed Web Workers)
 *  - every other language runs on the free Wandbox compiler via the backend
 * Always resolves to { ok, output, error, line, timedOut, where }.
 */

const joinLines = (lines, stream) =>
  lines
    .filter((l) => l.stream === stream)
    .map((l) => l.text)
    .join("\n");

// ---------- JavaScript ----------
function runJavaScript(code) {
  return new Promise((resolve) => {
    const worker = new Worker(new URL("../workers/js.worker.js", import.meta.url), { type: "module" });
    const lines = [];
    const finish = (extra) => {
      clearTimeout(timer);
      worker.terminate();
      resolve({ output: joinLines(lines, "out"), stderr: joinLines(lines, "err"), where: "browser", ...extra });
    };
    const timer = setTimeout(
      () =>
        finish({
          ok: false,
          timedOut: true,
          error: `The program was stopped after ${TIMEOUTS.js / 1000} seconds. It may contain an infinite loop.`,
        }),
      TIMEOUTS.js,
    );
    worker.onmessage = ({ data }) => {
      if (data.type === "line") lines.push(data);
      else if (data.type === "done") {
        if (data.result !== undefined && !lines.some((l) => l.stream === "out")) lines.push({ stream: "out", text: `→ ${data.result}` });
        finish({ ok: true, error: "" });
      } else if (data.type === "error") finish({ ok: false, error: data.message, line: data.line });
    };
    worker.onerror = (e) => {
      e.preventDefault?.();
      finish({ ok: false, error: e.message || "JavaScript error" });
    };
    worker.postMessage({ type: "run", code });
  });
}

// ---------- Python ----------
let pyWorker = null;
let pyState = "idle"; // idle | loading | ready | failed

function startPython() {
  if (pyWorker) return pyWorker;
  pyWorker = new Worker(new URL("../workers/py.worker.js", import.meta.url), { type: "classic" });
  pyState = "loading";
  pyWorker.addEventListener("message", ({ data }) => {
    if (data.type === "ready") pyState = "ready";
    if (data.type === "load-error") pyState = "failed";
  });
  pyWorker.postMessage({ type: "init", urls: PYODIDE_URLS });
  return pyWorker;
}

/** Start downloading Python in the background as soon as the app opens. */
export function preloadPython() {
  startPython();
}

export const pythonStatus = () => pyState;

/** Turns Pyodide's long traceback into the part a human needs. */
export function cleanPythonError(raw) {
  const text = String(raw || "");
  const lines = text.split("\n");
  const lineMatch = [...text.matchAll(/File "<exec>", line (\d+)/g)].pop();
  const last = lines.map((l) => l.trim()).filter(Boolean).pop() || text;
  const kept = [];
  let skipping = false;
  for (const l of lines) {
    if (/^\s*File "\/lib\/python/.test(l)) {
      skipping = true;
      continue;
    }
    if (/^\s*File "/.test(l)) skipping = false;
    if (!skipping) kept.push(l);
  }
  let message = last;
  if (/EOFError/.test(last)) {
    message = "This program asks for keyboard input, which isn't supported here. Say fix it and I'll use example values instead.";
  }
  return { message, detail: kept.join("\n").trim(), line: lineMatch ? Number(lineMatch[1]) : null };
}

function runPython(code) {
  return new Promise((resolve) => {
    const worker = startPython();
    const lines = [];
    let timer = setTimeout(() => stop("Python took too long to start. Check your internet connection and try again."), 90000);

    function cleanup() {
      clearTimeout(timer);
      worker.removeEventListener("message", onMessage);
    }
    function stop(error) {
      cleanup();
      worker.terminate();
      pyWorker = null;
      pyState = "idle";
      startPython(); // warm a fresh interpreter for next time
      resolve({ ok: false, timedOut: true, error, output: joinLines(lines, "out"), stderr: joinLines(lines, "err"), where: "browser" });
    }
    function onMessage({ data }) {
      if (data.type === "line") lines.push(data);
      else if (data.type === "started") {
        clearTimeout(timer);
        timer = setTimeout(
          () => stop(`The program was stopped after ${TIMEOUTS.python / 1000} seconds. It may contain an infinite loop.`),
          TIMEOUTS.python,
        );
      } else if (data.type === "done") {
        cleanup();
        if (data.result !== undefined && !lines.some((l) => l.stream === "out")) lines.push({ stream: "out", text: `→ ${data.result}` });
        resolve({ ok: true, error: "", output: joinLines(lines, "out"), stderr: joinLines(lines, "err"), where: "browser" });
      } else if (data.type === "error") {
        cleanup();
        const { message, detail, line } = cleanPythonError(data.message);
        resolve({ ok: false, error: message, detail, line, output: joinLines(lines, "out"), where: "browser" });
      } else if (data.type === "load-error") {
        cleanup();
        resolve({ ok: false, loadFailed: true, error: "Python couldn't load in this browser.", where: "browser" });
      }
    }
    worker.addEventListener("message", onMessage);
    worker.postMessage({ type: "run", code });
  });
}

// ---------- Everything else ----------
async function runRemote(code, language) {
  try {
    const r = await post("/api/run", { code, language }, { timeoutMs: TIMEOUTS.remoteRun });
    const line = String(r.error || "").match(/prog\.\w+:(\d+)/)?.[1];
    return { ...r, line: line ? Number(line) : null, where: "cloud" };
  } catch (err) {
    return { ok: false, unavailable: true, error: err.message, where: "cloud" };
  }
}

export async function runCode(code, language) {
  if (language === "javascript") return runJavaScript(code);
  if (language === "python") {
    const r = await runPython(code);
    return r.loadFailed ? runRemote(code, "python") : r;
  }
  if (!language) {
    return { ok: false, unsupported: true, error: "I couldn't tell which language this is, so I can't run it." };
  }
  return runRemote(code, language);
}
