import { useRef } from "react";

export function useAudioEngine() {
  const audioCtxRef = useRef(null);

  const initAudio = () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (
        window.AudioContext || window.webkitAudioContext
      )();
    }
    if (audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume();
    }
  };

  const playTone = (freq, pan, duration, type = "sine") => {
    initAudio();
    var osc = audioCtxRef.current.createOscillator();
    var gain = audioCtxRef.current.createGain();
    var panner = audioCtxRef.current.createStereoPanner();
    panner.pan.value = pan;
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.4, audioCtxRef.current.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      0.001,
      audioCtxRef.current.currentTime + duration,
    );
    osc.connect(gain);
    gain.connect(panner);
    panner.connect(audioCtxRef.current.destination);
    osc.start();
    osc.stop(audioCtxRef.current.currentTime + duration);
  };

  const playSuccess = () => {
    playTone(523, 1.0, 0.25);
    setTimeout(function () {
      playTone(659, 1.0, 0.25);
    }, 130);
    setTimeout(function () {
      playTone(784, 1.0, 0.35);
    }, 260);
    flash("dot-ok");
  };

  const playError = () => {
    playTone(400, -1.0, 0.3, "sawtooth");
    setTimeout(function () {
      playTone(280, -1.0, 0.4, "sawtooth");
    }, 200);
    flash("dot-err");
  };

  const flash = (id) => {
    var el = document.getElementById(id);
    if (!el) return;
    el.style.boxShadow =
      id === "dot-ok" ? "0 0 10px #00ff88" : "0 0 10px #ff4444";
    setTimeout(function () {
      el.style.boxShadow = "none";
    }, 1200);
  };

  const speak = (text) => {
    window.speechSynthesis.cancel();
    var u = new SpeechSynthesisUtterance(text);
    u.volume = 1.0;
    u.rate = 0.85;
    u.pitch = 1.0;
    window.speechSynthesis.speak(u);
  };

  return { initAudio, playSuccess, playError, speak };
}
