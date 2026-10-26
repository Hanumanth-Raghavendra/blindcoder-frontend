import { useMemo, useRef } from "react";

const DOUBLE_TAP_MS = 300;
const MOVE_TOLERANCE = 12; // px a finger may drift and still count as a tap/hold
const SWIPE_MIN = 60; // px
const SWIPE_MAX_MS = 700;
const TWO_FINGER_TAP_MS = 450;

/**
 * Touch gestures for a pane:
 *   tap, double tap, press-and-hold, swipe left/right/up/down, two-finger tap.
 * Single taps wait briefly so a double tap never also triggers a single tap.
 * Recognised gestures cancel the browser's default (so they don't pop up the
 * keyboard); a plain single tap is left alone so you can still edit text.
 */
export function useGestures(handlers) {
  const cb = useRef({});
  cb.current = handlers;
  const holdMs = handlers.holdMs ?? 450;
  const state = useRef({});

  return useMemo(() => {
    const isControl = (el) => el && el.closest?.("button, input, select, a");

    const reset = (s) => {
      clearTimeout(s.holdTimer);
      s.holding = false;
      s.moved = false;
    };

    const onTouchStart = (e) => {
      if (isControl(e.target)) return;
      const s = state.current;
      const t = e.touches[0];

      if (e.touches.length >= 2) {
        // Second finger landed: this is a two-finger gesture, not a tap/hold.
        clearTimeout(s.holdTimer);
        clearTimeout(s.tapTimer);
        s.multi = true;
        s.multiStart = s.multiStart || Date.now();
        return;
      }

      reset(s);
      s.multi = false;
      s.multiStart = 0;
      s.startX = t.clientX;
      s.startY = t.clientY;
      s.startTime = Date.now();
      s.holdTimer = setTimeout(() => {
        s.holding = true;
        clearTimeout(s.tapTimer);
        s.lastTap = 0;
        cb.current.onHoldStart?.();
      }, holdMs);
    };

    const onTouchMove = (e) => {
      const s = state.current;
      const t = e.touches[0];
      if (!t || s.startX === undefined) return;
      if (Math.hypot(t.clientX - s.startX, t.clientY - s.startY) > MOVE_TOLERANCE) {
        s.moved = true;
        if (!s.holding) clearTimeout(s.holdTimer);
      }
    };

    const onTouchEnd = (e) => {
      if (isControl(e.target)) return;
      const s = state.current;
      clearTimeout(s.holdTimer);

      if (s.multi) {
        if (e.touches.length > 0) return; // wait until every finger is lifted
        const quick = Date.now() - s.multiStart < TWO_FINGER_TAP_MS;
        s.multi = false;
        s.multiStart = 0;
        if (quick && !s.moved && cb.current.onTwoFingerTap) {
          e.preventDefault();
          cb.current.onTwoFingerTap();
        }
        return;
      }

      if (s.holding) {
        s.holding = false;
        e.preventDefault();
        cb.current.onHoldEnd?.();
        return;
      }

      if (s.moved) {
        const t = e.changedTouches[0];
        const dx = t.clientX - s.startX;
        const dy = t.clientY - s.startY;
        const fast = Date.now() - s.startTime < SWIPE_MAX_MS;
        const horizontal = Math.abs(dx) > Math.abs(dy) * 1.5;
        const vertical = Math.abs(dy) > Math.abs(dx) * 1.5;
        let swipe = null;
        if (fast && horizontal && Math.abs(dx) > SWIPE_MIN) swipe = dx > 0 ? "onSwipeRight" : "onSwipeLeft";
        else if (fast && vertical && Math.abs(dy) > SWIPE_MIN) swipe = dy > 0 ? "onSwipeDown" : "onSwipeUp";
        if (swipe && cb.current[swipe]) {
          e.preventDefault();
          cb.current[swipe]();
        }
        return; // otherwise it was a scroll
      }

      const now = Date.now();
      if (now - (s.lastTap || 0) < DOUBLE_TAP_MS) {
        clearTimeout(s.tapTimer);
        s.lastTap = 0;
        if (cb.current.onDoubleTap) {
          e.preventDefault();
          cb.current.onDoubleTap();
        }
      } else {
        s.lastTap = now;
        clearTimeout(s.tapTimer);
        if (cb.current.onTap) s.tapTimer = setTimeout(() => cb.current.onTap?.(), DOUBLE_TAP_MS);
      }
    };

    const onTouchCancel = () => {
      const s = state.current;
      clearTimeout(s.holdTimer);
      if (s.holding) cb.current.onHoldEnd?.();
      reset(s);
      s.multi = false;
    };

    return { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel };
  }, [holdMs]);
}
