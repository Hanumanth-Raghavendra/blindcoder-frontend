// Point at a different backend with VITE_BACKEND_URL (e.g. in Vercel env vars
// or a local .env file: VITE_BACKEND_URL=http://localhost:5000).
const env = import.meta.env || {};

export const BACKEND_URL = (env.VITE_BACKEND_URL || "https://blindcoder-backend.onrender.com").replace(/\/+$/, "");

// Pyodide (Python in the browser). Tried in order; the second is a fallback.
export const PYODIDE_URLS = (env.VITE_PYODIDE_URLS ||
  "https://cdn.jsdelivr.net/pyodide/v0.29.5/full/,https://cdn.jsdelivr.net/pyodide/v0.27.0/full/")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export const TIMEOUTS = {
  js: 5000, // ms a JavaScript program may run in the browser
  python: 10000, // ms a Python program may run (after packages load)
  ai: 60000, // ms to wait for the AI (includes a sleeping free-tier server waking up)
  remoteRun: 45000,
};

export const SPEECH_LANG = "en-IN";
