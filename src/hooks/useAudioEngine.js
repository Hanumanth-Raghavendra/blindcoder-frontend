import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const RATE_KEY = "blindcoder.speechRate";
const VOICE_KEY = "blindcoder.builtInVoice";

const load = (key, fallback) => {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
};
const save = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode etc. — settings just won't persist */
  }
};

/**
 * Speech output + earcons (short tones that tell you what happened without words).
 * When the built-in voice is off, messages are sent to an ARIA live region
 * instead, so the user's own screen reader speaks them — never both at once.
 */
export function useAudioEngine() {
  const ctxRef = useRef(null);
  const tickRef = useRef(null);
  const [rate, setRate] = useState(() => load(RATE_KEY, 0.95));
  const [builtInVoice, setBuiltInVoice] = useState(() => load(VOICE_KEY, true));
  const [announcement, setAnnouncement] = useState([]);
  const msgId = useRef(0);
  const rateRef = useRef(rate);
  const voiceRef = useRef(builtInVoice);
  const lastSpokenRef = useRef("");

  useEffect(() => {
    rateRef.current = rate;
    save(RATE_KEY, rate);
  }, [rate]);
  useEffect(() => {
    voiceRef.current = builtInVoice;
    save(VOICE_KEY, builtInVoice);
  }, [builtInVoice]);

  const initAudio = useCallback(() => {
    try {
      if (!ctxRef.current) ctxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      if (ctxRef.current.state === "suspended") ctxRef.current.resume();
    } catch {
      /* no Web Audio — tones are optional */
    }
  }, []);

  const tone = useCallback(
    (freq, { pan = 0, duration = 0.2, type = "sine", volume = 0.3, delay = 0 } = {}) => {
      initAudio();
      const ctx = ctxRef.current;
      if (!ctx) return;
      const t = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(volume, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
      osc.connect(gain);
      if (panner) {
        panner.pan.value = pan;
        gain.connect(panner);
        panner.connect(ctx.destination);
      } else gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + duration);
    },
    [initAudio],
  );

  // Vibration where supported (Android). iPhones ignore it; tones still play.
  const buzz = (pattern) => {
    try {
      navigator.vibrate?.(pattern);
    } catch {
      /* ignore */
    }
  };

  const earcons = useMemo(
    () => ({
      success() {
        buzz(60);
        tone(523, { pan: 1, duration: 0.25 });
        tone(659, { pan: 1, duration: 0.25, delay: 0.13 });
        tone(784, { pan: 1, duration: 0.35, delay: 0.26 });
      },
      error() {
        buzz([90, 70, 90]);
        tone(400, { pan: -1, duration: 0.3, type: "sawtooth", volume: 0.2 });
        tone(280, { pan: -1, duration: 0.4, type: "sawtooth", volume: 0.2, delay: 0.2 });
      },
      listenStart() {
        buzz(25);
        tone(660, { duration: 0.08, volume: 0.25 });
        tone(880, { duration: 0.1, volume: 0.25, delay: 0.08 });
      },
      listenStop() {
        tone(880, { duration: 0.08, volume: 0.2 });
        tone(660, { duration: 0.1, volume: 0.2, delay: 0.08 });
      },
      tick() {
        tone(1200, { duration: 0.04, volume: 0.06 });
      },
    }),
    [tone],
  );

  /** Soft periodic tick while waiting on the AI, so silence never means "is it broken?". */
  const startThinking = useCallback(() => {
    clearInterval(tickRef.current);
    tickRef.current = setInterval(() => earcons.tick(), 1400);
  }, [earcons]);
  const stopThinking = useCallback(() => clearInterval(tickRef.current), []);

  const stopSpeaking = useCallback(() => {
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* ignore */
    }
  }, []);

  /**
   * speak("text")            – interrupts whatever is being said
   * speak("text", {queue})   – waits its turn
   * speak(["a","b"])         – each item is its own utterance (more reliable for long code)
   */
  const speak = useCallback(
    (text, { queue = false } = {}) => {
      const parts = (Array.isArray(text) ? text : [text]).map((t) => String(t || "").trim()).filter(Boolean);
      if (!parts.length) return;
      lastSpokenRef.current = parts.join(" ");

      if (!voiceRef.current || !window.speechSynthesis) {
        // Each message is a new node in the live region, so the screen reader
        // announces it — even if it's identical to the previous one.
        const msg = { id: ++msgId.current, text: parts.join(" ") };
        setAnnouncement((prev) => (queue ? [...prev, msg].slice(-5) : [msg]));
        return;
      }
      if (!queue) stopSpeaking();
      for (const part of parts) {
        const u = new SpeechSynthesisUtterance(part);
        u.rate = rateRef.current;
        u.pitch = 1;
        u.volume = 1;
        window.speechSynthesis.speak(u);
      }
    },
    [stopSpeaking],
  );

  const isSpeaking = useCallback(() => Boolean(window.speechSynthesis?.speaking), []);
  const repeatLast = useCallback(() => speak(lastSpokenRef.current || "Nothing to repeat yet."), [speak]);

  const changeRate = useCallback((delta) => {
    setRate((r) => Math.round(Math.min(2, Math.max(0.5, r + delta)) * 100) / 100);
  }, []);

  useEffect(() => () => clearInterval(tickRef.current), []);

  return {
    initAudio,
    earcons,
    speak,
    stopSpeaking,
    isSpeaking,
    repeatLast,
    startThinking,
    stopThinking,
    rate,
    changeRate,
    builtInVoice,
    setBuiltInVoice,
    announcement,
  };
}
