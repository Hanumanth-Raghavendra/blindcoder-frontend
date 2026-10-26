import { BACKEND_URL } from "../config.js";

export class ApiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.status = status;
  }
}

/** Wake the free-tier server early so the first real request is fast. */
export function warmUp() {
  fetch(`${BACKEND_URL}/api/health`, { method: "GET", cache: "no-store" }).catch(() => {});
}

async function once(path, body, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${BACKEND_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (!res.ok) {
      // No JSON body usually means the hosting proxy (server still waking up).
      const retryable = !data && res.status >= 500;
      throw Object.assign(new ApiError(data?.error || `Server error ${res.status}.`, res.status), { retryable });
    }
    return data;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err.name === "AbortError") throw new ApiError("The server took too long to respond. Please try again.", 0);
    throw Object.assign(new ApiError("Can't reach the server. Check your internet connection.", 0), { retryable: true });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * POST JSON to the backend. Retries once on network-level failures, which is
 * what a sleeping Render free instance looks like while it boots.
 * `onSlow` fires once if the request is taking a while, so we can say so out loud.
 */
export async function post(path, body, { timeoutMs = 60000, onSlow, slowAfterMs = 7000 } = {}) {
  const slowTimer = onSlow ? setTimeout(onSlow, slowAfterMs) : null;
  const deadline = Date.now() + timeoutMs;
  try {
    try {
      return await once(path, body, timeoutMs);
    } catch (err) {
      const left = deadline - Date.now();
      if (!err.retryable || left < 3000) throw err;
      await new Promise((r) => setTimeout(r, 1500));
      return await once(path, body, left - 1500);
    }
  } finally {
    if (slowTimer) clearTimeout(slowTimer);
  }
}
