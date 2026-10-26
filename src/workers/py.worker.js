/* Python via Pyodide, inside a classic Web Worker so long-running programs
 * can be stopped without freezing the page. */

let pyodide = null;
let loading = null;

async function load(urls) {
  let lastError;
  for (const url of urls) {
    try {
      importScripts(`${url}pyodide.js`);
      pyodide = await self.loadPyodide({ indexURL: url });
      return;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error("Could not load Python");
}

self.onmessage = async ({ data }) => {
  if (data.type === "init") {
    loading = loading || load(data.urls);
    try {
      await loading;
      self.postMessage({ type: "ready" });
    } catch (err) {
      self.postMessage({ type: "load-error", message: String(err?.message || err) });
    }
    return;
  }

  if (data.type !== "run") return;
  try {
    await loading;
  } catch (err) {
    self.postMessage({ type: "load-error", message: String(err?.message || err) });
    return;
  }

  pyodide.setStdout({ batched: (text) => self.postMessage({ type: "line", stream: "out", text }) });
  pyodide.setStderr({ batched: (text) => self.postMessage({ type: "line", stream: "err", text }) });
  pyodide.setStdin({ stdin: () => null }); // input() -> EOFError (handled with a friendly hint)

  // Fresh globals every run so old variables don't leak between programs.
  const globals = pyodide.globals.get("dict")();
  try {
    await pyodide.loadPackagesFromImports(data.code);
    self.postMessage({ type: "started" });
    const result = await pyodide.runPythonAsync(data.code, { globals });
    self.postMessage({ type: "done", result: result === undefined || result === null ? undefined : String(result) });
  } catch (err) {
    self.postMessage({ type: "error", message: String(err?.message || err) });
  } finally {
    globals.destroy?.();
  }
};
