/* Runs user JavaScript off the main thread, so an infinite loop can be killed
 * without freezing the page. Output is streamed back line by line. */

const fmt = (v) => {
  if (typeof v === "string") return v;
  if (v instanceof Error) return `${v.name}: ${v.message}`;
  try {
    const s = JSON.stringify(v);
    return s === undefined ? String(v) : s;
  } catch {
    return String(v);
  }
};

const emit = (stream) => (...args) => self.postMessage({ type: "line", stream, text: args.map(fmt).join(" ") });

const fakeConsole = {
  log: emit("out"),
  info: emit("out"),
  debug: emit("out"),
  table: emit("out"),
  dir: emit("out"),
  warn: emit("err"),
  error: emit("err"),
};

function errorLine(err) {
  const m = String(err?.stack || "").match(/<anonymous>:(\d+):\d+/);
  return m ? Number(m[1]) : null;
}

const fail = (err, offset = 0) => {
  const line = errorLine(err);
  self.postMessage({
    type: "error",
    message: `${err?.name || "Error"}: ${err?.message ?? err}`,
    line: line ? Math.max(1, line - offset) : null,
  });
};

// Track timers so programs using setTimeout finish naturally.
let pending = 0;
let finished = false;
let lastResult;
const realSetTimeout = self.setTimeout.bind(self);
const realSetInterval = self.setInterval.bind(self);
const realClearTimeout = self.clearTimeout.bind(self);
const live = new Set();

function maybeDone() {
  if (!finished && pending === 0) {
    finished = true;
    self.postMessage({ type: "done", result: lastResult === undefined ? undefined : fmt(lastResult) });
  }
}

self.setTimeout = (fn, ms, ...args) => {
  pending++;
  const id = realSetTimeout(() => {
    live.delete(id);
    pending--;
    try {
      typeof fn === "function" && fn(...args);
    } catch (e) {
      fail(e);
      finished = true;
      return;
    }
    maybeDone();
  }, ms);
  live.add(id);
  return id;
};
self.clearTimeout = (id) => {
  if (live.delete(id)) pending--;
  realClearTimeout(id);
  realSetTimeout(maybeDone, 0);
};
// Intervals keep a program alive; the main thread's timeout will stop it.
self.setInterval = (fn, ms, ...args) => {
  pending++;
  return realSetInterval(fn, ms, ...args);
};

self.onmessage = async ({ data }) => {
  if (data?.type !== "run") return;
  self.console = fakeConsole;
  try {
    // Indirect eval runs in global scope and gives us the last expression's value.
    lastResult = (0, eval)(data.code);
  } catch (err) {
    if (err instanceof SyntaxError && /await/.test(err.message)) {
      // Support top-level await by wrapping in an async function.
      try {
        const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
        lastResult = await new AsyncFunction("console", data.code)(fakeConsole);
      } catch (e) {
        return fail(e, 2);
      }
    } else {
      return fail(err);
    }
  }
  if (lastResult && typeof lastResult.then === "function") {
    try {
      lastResult = await lastResult;
    } catch (e) {
      return fail(e);
    }
  }
  realSetTimeout(maybeDone, 0);
};
