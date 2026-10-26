import { useMemo, useRef } from "react";

const DOUBLE_TAP_MS = 300;

/**
 * Touch gestures for a pane: tap, double tap, and press-and-hold.
 * Single taps wait briefly so a double tap never also triggers a single tap.
 */
export function useGestures({ onTap, onDoubleTap, onHoldStart, onHoldEnd, holdMs = 450 }) {
  const cb = useRef({});
  cb.current = { onTap, onDoubleTap, onHoldStart, onHoldEnd };
  const state = useRef({ holdTimer: null, tapTimer: null, lastTap: 0, holding: false, moved: false });

  return useMemo(() => {
    const isControl = (el) => el && /^(BUTTON|INPUT|SELECT|A)$/.test(el.tagName);

    const onTouchStart = (e) => {
      if (isControl(e.target)) return;
      const s = state.current;
      s.holding = false;
      s.moved = false;
      clearTimeout(s.holdTimer);
      s.holdTimer = setTimeout(() => {
        s.holding = true;
        clearTimeout(s.tapTimer);
        s.lastTap = 0;
        cb.current.onHoldStart?.();
      }, holdMs);
    };

    const onTouchEnd = (e) => {
      if (isControl(e.target)) return;
      const s = state.current;
      clearTimeout(s.holdTimer);
      if (s.holding) {
        s.holding = false;
        cb.current.onHoldEnd?.();
        return;
      }
      if (s.moved) return;
      const now = Date.now();
      if (now - s.lastTap < DOUBLE_TAP_MS) {
        clearTimeout(s.tapTimer);
        s.lastTap = 0;
        cb.current.onDoubleTap?.();
      } else {
        s.lastTap = now;
        clearTimeout(s.tapTimer);
        s.tapTimer = setTimeout(() => cb.current.onTap?.(), DOUBLE_TAP_MS);
      }
    };

    const onTouchMove = () => {
      // Scrolling isn't a gesture.
      const s = state.current;
      s.moved = true;
      if (!s.holding) clearTimeout(s.holdTimer);
    };

    return { onTouchStart, onTouchEnd, onTouchMove, onTouchCancel: onTouchEnd };
  }, [holdMs]);
}
