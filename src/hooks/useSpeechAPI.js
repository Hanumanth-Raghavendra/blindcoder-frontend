import { useCallback, useEffect, useRef, useState } from "react";
import { SPEECH_LANG } from "../config.js";

/**
 * Push-to-talk speech recognition. Listens for as long as the key/finger is
 * held (continuous mode), shows interim words live, and delivers the final
 * transcript on release.
 */
export function useSpeechAPI({ onTranscript, onInterim, onEmpty, onError }) {
  const recRef = useRef(null);
  const finalRef = useRef("");
  const interimRef = useRef("");
  const cancelledRef = useRef(false);
  const handlers = useRef({ onTranscript, onInterim, onEmpty, onError });
  handlers.current = { onTranscript, onInterim, onEmpty, onError };
  const [isListening, setIsListening] = useState(false);
  const supported = typeof window !== "undefined" && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = SPEECH_LANG;
    rec.maxAlternatives = 1;

    rec.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) finalRef.current += r[0].transcript + " ";
        else interim += r[0].transcript;
      }
      interimRef.current = interim;
      handlers.current.onInterim?.((finalRef.current + interim).trim());
    };

    rec.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      handlers.current.onError?.(e.error);
    };

    rec.onend = () => {
      setIsListening(false);
      const text = (finalRef.current + interimRef.current).trim();
      finalRef.current = "";
      interimRef.current = "";
      if (!cancelledRef.current) {
        if (text) handlers.current.onTranscript?.(text);
        else handlers.current.onEmpty?.();
      }
      cancelledRef.current = false;
    };

    recRef.current = rec;
    return () => {
      rec.onend = null;
      try {
        rec.abort();
      } catch {
        /* ignore */
      }
    };
  }, []);

  const start = useCallback(() => {
    const rec = recRef.current;
    if (!rec) {
      handlers.current.onError?.("unsupported");
      return false;
    }
    finalRef.current = "";
    interimRef.current = "";
    cancelledRef.current = false;
    try {
      rec.start();
      setIsListening(true);
      return true;
    } catch {
      return false; // already listening
    }
  }, []);

  /** Stop and deliver what was heard. */
  const stop = useCallback(() => {
    try {
      recRef.current?.stop();
    } catch {
      /* ignore */
    }
  }, []);

  /** Stop and throw away what was heard. */
  const cancel = useCallback(() => {
    cancelledRef.current = true;
    try {
      recRef.current?.abort();
    } catch {
      /* ignore */
    }
    setIsListening(false);
  }, []);

  return { supported, isListening, start, stop, cancel };
}
