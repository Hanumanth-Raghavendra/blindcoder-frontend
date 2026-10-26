import React, { useCallback, useEffect, useRef, useState } from "react";
import IntroSplash from "./components/IntroSplash.jsx";
import { useAudioEngine } from "./hooks/useAudioEngine";
import { useSpeechAPI } from "./hooks/useSpeechAPI";
import { useGestures } from "./hooks/useGestures";
import { post, warmUp } from "./lib/api";
import { runCode, preloadPython, pythonStatus } from "./lib/runner";
import { detectLanguage, fileNameFor, langInfo, speakFileName, stemFromPrompt } from "./lib/language";
import {
  chooseSaveFolder,
  folderSaveSupported,
  forgetSaveFolder,
  getSaveFolder,
  rememberedFolderName,
  saveToFolder,
} from "./lib/saveFolder";
import { codeLines, speakableLine, summarizeOutput } from "./lib/codeSpeech";
import { matchCommand, parseLineCommand, HELP_TEXT, TOUCH_HELP_TEXT } from "./lib/voiceCommands";
import { TIMEOUTS } from "./config";

const HISTORY_KEY = "blindcoder.history";
const DOUBLE_PRESS_MS = 400;
const TAP_MS = 250; // a Space press shorter than this is a tap, not hold-to-talk

const isTouch = () => typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;

const loadHistory = () => {
  try {
    const h = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    return Array.isArray(h) ? h.slice(0, 15) : [];
  } catch {
    return [];
  }
};

const firstLine = (text, max = 220) => {
  const line = String(text || "").split("\n").map((l) => l.trim()).filter(Boolean)[0] || "";
  return line.length > max ? line.slice(0, max) + "…" : line;
};

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

export default function App() {
  const [started, setStarted] = useState(false);
  const [splashLeaving, setSplashLeaving] = useState(false);
  const [code, setCode] = useState("");
  const [language, setLanguage] = useState("");
  const [prompt, setPrompt] = useState("");
  const [output, setOutput] = useState(null); // { kind: success|error|info, text, detail }
  const [status, setStatus] = useState("Press any key to start.");
  const [meta, setMeta] = useState("");
  const [busy, setBusy] = useState(null);
  const [history, setHistory] = useState(loadHistory);
  const [lastError, setLastError] = useState(null);
  const [fileStem, setFileStem] = useState(""); // descriptive name for the saved file, e.g. "prime_numbers"
  const [saveFolderName, setSaveFolderName] = useState("");

  const audio = useAudioEngine();
  const { speak, earcons } = audio;

  // Refs mirror state so keyboard/voice handlers always see the latest values.
  const s = useRef({});
  s.current = { code, language, output, busy, lastError, history, fileStem };
  const saveTipGiven = useRef(false);
  const undoStack = useRef([]);
  const lineIndex = useRef(-1);
  const spaceDown = useRef(false);
  const lastSpace = useRef(0); // when the last quick Space *tap* ended
  const spaceDownAt = useRef(0);
  const lastEnter = useRef(0);
  const lastEscape = useRef(0);
  const promptInputRef = useRef(null);
  const pointerFocused = useRef(null); // a button that got focus from a mouse/finger, not from Tab
  const startedRef = useRef(false);

  useEffect(() => {
    warmUp();
    preloadPython();
    if (folderSaveSupported()) setSaveFolderName(rememberedFolderName());
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch {
      /* ignore */
    }
  }, [history]);

  // ---------------------------------------------------------------- helpers
  const snapshot = () => ({ code: s.current.code, language: s.current.language, fileStem: s.current.fileStem });

  const applyCode = useCallback((next, lang, stem) => {
    const cur = s.current.code;
    if (cur.trim() && cur !== next) undoStack.current = [...undoStack.current, snapshot()].slice(-25);
    const resolved = lang || detectLanguage(next) || s.current.language;
    s.current.code = next;
    s.current.language = resolved;
    s.current.fileStem = stem ?? s.current.fileStem;
    setCode(next);
    setLanguage(resolved);
    setFileStem(s.current.fileStem);
    lineIndex.current = -1;
    return resolved;
  }, []);

  const describeMeta = (data) => {
    if (!data?.providerLabel) return "";
    const secs = data.cached ? "instant" : `${(data.ms / 1000).toFixed(1)}s`;
    return `${data.providerLabel} · ${data.model} · ${secs}`;
  };

  const fail = useCallback(
    (message) => {
      earcons.error();
      setStatus(message);
      speak(message);
    },
    [earcons, speak],
  );

  // ---------------------------------------------------------------- actions
  const explain = useCallback(
    async ({ queue = false, auto = false } = {}) => {
      const { code: c, language: lang, lastError: err } = s.current;
      if (!c.trim()) return speak("There's no code to explain yet.", { queue });
      const error = err && err.code === c ? err.message : "";
      if (!auto) {
        setBusy("explaining");
        audio.startThinking();
        setStatus(error ? "Explaining the error…" : "Explaining the code…");
      }
      try {
        const data = await post("/api/explain", { code: c, error, language: lang }, { timeoutMs: TIMEOUTS.ai });
        setOutput((prev) => ({
          ...(prev || { kind: "info", text: "" }),
          explanation: data.explanation,
        }));
        setMeta(describeMeta(data));
        setStatus(error ? "Error explained. Say fix it to repair it." : "Code explained.");
        speak(error ? `${data.explanation} Say fix it, and I'll repair it.` : data.explanation, { queue });
      } catch (e) {
        if (auto) speak("Say fix it, and I'll try to repair it.", { queue });
        else fail(e.message);
      } finally {
        if (!auto) {
          audio.stopThinking();
          setBusy(null);
        }
      }
    },
    [audio, fail, speak],
  );

  const run = useCallback(
    async ({ codeOverride, langOverride, queue = false } = {}) => {
      audio.initAudio();
      if (s.current.busy && codeOverride === undefined) return speak("Still working on the last request.");
      const c = codeOverride ?? s.current.code;
      if (!c.trim()) return speak("There's no code yet. Hold Space and ask for a program.", { queue });
      const lang = langOverride || s.current.language || detectLanguage(c);
      const info = langInfo(lang);

      setBusy("running");
      setStatus(`Running ${info.name}…`);
      if (lang === "python" && pythonStatus() === "loading") speak("Loading Python, one moment.", { queue });
      const remote = lang !== "javascript" && lang !== "python";
      if (remote) audio.startThinking();

      const r = await runCode(c, lang);
      audio.stopThinking();
      setBusy(null);

      if (r.ok) {
        const out = (r.output || "").replace(/\s+$/, "");
        setLastError(null);
        setOutput({ kind: "success", text: out || "(The program ran but printed nothing.)", detail: r.stderr || r.warnings || "" });
        setStatus(`Ran successfully${r.where === "cloud" ? " on the online compiler" : ""}.`);
        earcons.success();
        speak(out ? `Output: ${summarizeOutput(out)}` : "It ran, but printed nothing.", { queue });
        return;
      }

      if (r.unsupported || r.unavailable) {
        setOutput({ kind: "info", text: r.error });
        setStatus(r.error);
        speak(r.error, { queue });
        return;
      }

      const where = r.line ? ` on line ${r.line}` : "";
      const err = { message: r.error, line: r.line, code: c };
      setLastError(err);
      s.current.lastError = err;
      setOutput({
        kind: "error",
        text: [r.output && `${r.output}\n`, `Error${where}: ${r.error}`].filter(Boolean).join("\n"),
        detail: r.detail || "",
      });
      setStatus(`Error${where}. Say "fix it" or "explain".`);
      earcons.error();
      speak(`Error${where}. ${firstLine(r.error)}`, { queue });
      if (r.timedOut) speak("Say fix it, and I'll repair it.", { queue: true });
      else explain({ queue: true, auto: true });
    },
    [audio, earcons, explain, speak],
  );

  const codeTask = useCallback(
    async (path, body, { label, historyText, nameFrom } = {}) => {
      if (s.current.busy) return speak("Still working on the last request.");
      setBusy(path === "/api/fix" ? "fixing" : "generating");
      setStatus(label);
      audio.startThinking();
      speak("Working on it.");
      if (historyText) setHistory((h) => [historyText, ...h.filter((x) => x !== historyText)].slice(0, 15));

      try {
        const data = await post(path, body, {
          timeoutMs: TIMEOUTS.ai,
          onSlow: () => speak("Still working. The server may be waking up.", { queue: true }),
        });
        audio.stopThinking();
        // Name the file after what the program does: the AI's suggestion, else the request,
        // and a fix keeps the name the file already had.
        const stem = path === "/api/fix" ? s.current.fileStem || data.filename : data.filename || stemFromPrompt(nameFrom);
        const lang = applyCode(data.code, data.language, stem || "");
        const info = langInfo(lang);
        setMeta(describeMeta(data));
        setOutput(null);
        setLastError(null);
        s.current.lastError = null;
        const lines = codeLines(data.code).length;
        speak(`${data.summary || `${info.spoken} code is ready.`} ${info.spoken}, ${plural(lines, "line")}. Running it now.`);
        setBusy(null);
        await run({ codeOverride: data.code, langOverride: lang, queue: true });
      } catch (e) {
        audio.stopThinking();
        setBusy(null);
        fail(e.message || "Something went wrong.");
      }
    },
    [applyCode, audio, fail, run, speak],
  );

  const generate = useCallback(
    (text) => {
      const p = String(text || "").trim();
      if (!p) return speak("Please say or type what you want the program to do.");
      const { code: c, language: lang } = s.current;
      return codeTask(
        "/api/generate",
        { prompt: p, code: c, language: lang },
        { label: `Writing code: “${p}”`, historyText: p, nameFrom: p },
      );
    },
    [codeTask, speak],
  );

  const fix = useCallback(() => {
    const { code: c, language: lang, lastError: err } = s.current;
    if (!c.trim()) return speak("There's no code to fix yet.");
    const error = err && err.code === c ? err.message : "";
    return codeTask("/api/fix", { code: c, error, language: lang }, { label: "Fixing the code…" });
  }, [codeTask, speak]);

  const readCode = useCallback(() => {
    const { code: c, language: lang } = s.current;
    if (!c.trim()) return speak("There's no code to read.");
    const lines = codeLines(c);
    lineIndex.current = -1;
    setStatus("Reading code aloud… Press Escape to stop.");
    speak([`${langInfo(lang).spoken} code, ${plural(lines.length, "line")}.`, ...lines.map((l, i) => `Line ${i + 1}. ${speakableLine(l)}`)]);
  }, [speak]);

  const readLine = useCallback(
    (delta, absolute) => {
      const lines = codeLines(s.current.code);
      if (!s.current.code.trim()) return speak("There's no code.");
      if (absolute !== undefined && absolute > lines.length) return speak(`There are only ${plural(lines.length, "line")}.`);
      const target = absolute !== undefined ? absolute - 1 : lineIndex.current + delta;
      const next = Math.min(lines.length - 1, Math.max(0, target));
      const edge =
        absolute === undefined && next === lineIndex.current ? (delta > 0 ? "Last line. " : "First line. ") : "";
      lineIndex.current = next;
      speak(`${edge}Line ${next + 1} of ${lines.length}. ${speakableLine(lines[next])}`);
    },
    [speak],
  );

  const readOutput = useCallback(() => {
    const o = s.current.output;
    if (!o?.text) return speak("There's no output yet. Press Enter to run the code.");
    const lines = o.text.split("\n").filter((l) => l.trim());
    speak([o.kind === "error" ? "Error output." : "Output.", ...lines, ...(o.explanation ? [o.explanation] : [])]);
  }, [speak]);

  const download = (name, content) => {
    const url = URL.createObjectURL(new Blob([content], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  /** If the browser pops up a "Save as" window, the page loses focus. Explain how to stop that, once. */
  const watchForSaveDialog = useCallback(() => {
    if (saveTipGiven.current) return;
    const onBlur = () => {
      cleanup();
      const onBack = () => {
        window.removeEventListener("focus", onBack);
        saveTipGiven.current = true;
        speak(
          folderSaveSupported()
            ? "Tip: to skip that save window, press Shift S once and pick a folder, such as a BlindCoder folder inside Downloads. After that, double Enter saves instantly. Or turn off Ask where to save each file, in your browser's download settings."
            : "Tip: to skip that save window, turn off Ask where to save each file, in your browser's download settings.",
          { queue: true },
        );
      };
      window.addEventListener("focus", onBack);
    };
    const cleanup = () => window.removeEventListener("blur", onBlur);
    window.addEventListener("blur", onBlur);
    setTimeout(cleanup, 2000);
  }, [speak]);

  const save = useCallback(async () => {
    const { code: c, fileStem: stem } = s.current;
    if (!c.trim()) return speak("Nothing to save yet.");
    const lang = s.current.language || detectLanguage(c);
    const name = fileNameFor(c, lang, stem);

    // 1) A folder picked once with Shift+S: write straight into it, no dialog.
    if (folderSaveSupported() && (await getSaveFolder())) {
      const r = await saveToFolder(name, c);
      if (r.saved) {
        setStatus(`${r.replaced ? "Updated" : "Saved"} ${r.name} in ${r.folder}.`);
        earcons.success();
        speak(`${r.replaced ? "Updated" : "Saved"} ${speakFileName(r.name)}, in your ${r.folder} folder.`);
        return;
      }
      if (r.reason !== "no-folder") {
        setSaveFolderName("");
        speak("I couldn't use your save folder, so I'm downloading the file instead. Press Shift S to choose the folder again.", {
          queue: true,
        });
      }
    }

    // 2) Normal browser download, to the Downloads folder.
    download(name, c);
    watchForSaveDialog();
    setStatus(`Saved ${name} to your downloads.`);
    speak(`Saving ${speakFileName(name)} to your downloads.`, { queue: true });
  }, [earcons, speak, watchForSaveDialog]);

  const chooseFolder = useCallback(async () => {
    if (!folderSaveSupported()) {
      return speak(
        "This browser can't save into a folder directly. To skip the save window, turn off Ask where to save each file, in your browser's download settings.",
      );
    }
    speak("Choose a folder for your code. Your browser won't allow the Downloads folder itself, so choose or create a folder inside it, such as BlindCoder.");
    try {
      const dir = await chooseSaveFolder();
      setSaveFolderName(dir.name);
      setStatus(`Saving to ${dir.name}. Double Enter saves instantly.`);
      speak(`Done. From now on, double Enter saves straight into ${dir.name}, without asking.`);
    } catch (err) {
      if (err?.name === "AbortError") speak("No folder chosen. Saves will keep going to Downloads.");
      else if (err?.name === "SecurityError") speak("Press Shift S to choose the folder.");
      else speak("That folder can't be used. Please choose a folder inside Downloads, such as BlindCoder.");
    }
  }, [speak]);

  const useDownloads = useCallback(async () => {
    await forgetSaveFolder();
    setSaveFolderName("");
    setStatus("Saving to Downloads.");
    speak("Okay. Files will be saved to your Downloads folder.");
  }, [speak]);

  const clear = useCallback(() => {
    const { code: c } = s.current;
    if (c.trim()) undoStack.current = [...undoStack.current, snapshot()].slice(-25);
    s.current.code = "";
    s.current.fileStem = "";
    setCode("");
    setLanguage("");
    setFileStem("");
    setPrompt("");
    setOutput(null);
    setLastError(null);
    setMeta("");
    lineIndex.current = -1;
    setStatus("Cleared. Hold Space to speak.");
    speak(c.trim() ? "Cleared. Say undo to bring it back." : "Cleared. Ready for your next command.");
  }, [speak]);

  const undo = useCallback(() => {
    const prev = undoStack.current.pop();
    if (!prev) return speak("Nothing to undo.");
    s.current.code = prev.code;
    s.current.fileStem = prev.fileStem || "";
    setCode(prev.code);
    setLanguage(prev.language);
    setFileStem(prev.fileStem || "");
    setLastError(null);
    lineIndex.current = -1;
    setStatus("Restored the previous code.");
    speak(`Undone. Restored ${langInfo(prev.language).spoken} code, ${plural(codeLines(prev.code).length, "line")}.`);
  }, [speak]);

  const help = useCallback(() => speak(isTouch() ? TOUCH_HELP_TEXT : HELP_TEXT), [speak]);

  const stopSpeech = useCallback(() => {
    audio.stopSpeaking();
    setStatus("Speech stopped.");
  }, [audio]);

  const setVoice = useCallback(
    (on) => {
      audio.setBuiltInVoice(on);
      setStatus(on ? "Built-in voice on." : "Built-in voice off. Your screen reader will announce messages.");
      setTimeout(() => speak(on ? "Built-in voice on." : "Built-in voice off. Your screen reader will read messages now."), 50);
    },
    [audio, speak],
  );

  const changeRate = useCallback(
    (delta) => {
      audio.changeRate(delta);
      setTimeout(() => speak(delta > 0 ? "Faster." : "Slower."), 30);
    },
    [audio, speak],
  );

  const actions = {
    run: () => run(),
    read: readCode,
    readOutput,
    save,
    clear,
    undo,
    fix,
    explain: () => explain(),
    repeat: audio.repeatLast,
    stop: stopSpeech,
    faster: () => changeRate(0.15),
    slower: () => changeRate(-0.15),
    voiceOff: () => setVoice(false),
    voiceOn: () => setVoice(true),
    nextLine: () => readLine(1),
    prevLine: () => readLine(-1),
    firstLine: () => readLine(0, 1),
    chooseFolder,
    useDownloads,
    help,
  };
  const actionsRef = useRef(actions);
  actionsRef.current = { ...actions, generate, readLine, gotoLine: (n) => readLine(0, n) };

  // ---------------------------------------------------------------- voice input
  const voice = useSpeechAPI({
    onInterim: (text) => setPrompt(text),
    onEmpty: () => {
      earcons.listenStop();
      setStatus("Didn't catch that. Hold Space and try again.");
      speak("I didn't catch that.");
    },
    onTranscript: (text) => {
      earcons.listenStop();
      const command = matchCommand(text);
      if (command) {
        setStatus(`Command: ${text}`);
        if (command === "gotoLine") actionsRef.current.gotoLine(parseLineCommand(text));
        else actionsRef.current[command]();
      } else {
        setPrompt(text);
        actionsRef.current.generate(text);
      }
    },
    onError: (error) => {
      const messages = {
        "not-allowed": "Microphone access is blocked. Allow the microphone for this site in your browser, or type your request.",
        "service-not-allowed": "Microphone access is blocked. Allow the microphone for this site in your browser, or type your request.",
        unsupported: "Voice input isn't supported in this browser. Please use Chrome, Edge or Safari, or type your request.",
        network: "Voice recognition needs an internet connection.",
        "audio-capture": "No microphone was found.",
      };
      fail(messages[error] || `Voice error: ${error}.`);
    },
  });

  const startListening = useCallback(() => {
    audio.initAudio();
    audio.stopSpeaking();
    if (voice.start()) {
      earcons.listenStart();
      setStatus("Listening… release to send.");
    }
  }, [audio, earcons, voice]);

  // ---------------------------------------------------------------- start
  const start = useCallback(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    audio.initAudio();
    setSplashLeaving(true);
    setTimeout(() => setStarted(true), 400);
    setStatus(isTouch() ? "Hold the top pane to speak." : "Hold Space to speak.");
    speak(
      isTouch()
        ? "BlindCoder ready. Hold the top pane and speak. Tap the bottom pane to run. Hold the top pane and say help, any time, to hear every gesture."
        : "BlindCoder ready. Hold Space and speak a request. Press Enter to run. Press F1, or say help, to hear all commands.",
    );
  }, [audio, speak]);

  // ---------------------------------------------------------------- keyboard
  useEffect(() => {
    const onKeyDown = (e) => {
      if (!startedRef.current) {
        if (!["Shift", "Control", "Alt", "Meta", "Tab"].includes(e.key)) {
          e.preventDefault();
          start();
        }
        return;
      }
      const el = document.activeElement;
      const a = actionsRef.current;
      const mod = (e.ctrlKey || e.metaKey) && !e.altKey;

      // These work everywhere, even while typing in the editor or prompt box.
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        return a.save();
      }
      if (mod && e.key === "Enter") {
        e.preventDefault();
        return a.run();
      }

      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      // A button you clicked keeps focus; it shouldn't swallow Enter/Space.
      // A button reached with Tab (keyboard / screen-reader users) still should.
      if (el && el === pointerFocused.current && !typing) {
        el.blur();
        pointerFocused.current = null;
      }
      const focused = document.activeElement;
      const onControl = focused && /^(BUTTON|A|SELECT|SUMMARY)$/.test(focused.tagName);

      if (typing) {
        if (e.key === "Escape") {
          e.preventDefault();
          el.blur();
          speak("Left the text box. Keyboard shortcuts are active.");
        }
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // Let Space/Enter activate a focused button normally (screen-reader users tab to buttons).
      if (onControl && (e.code === "Space" || e.key === "Enter")) return;

      switch (e.code === "Space" ? "Space" : e.key) {
        case "Space": {
          e.preventDefault();
          if (e.repeat) return;
          const now = Date.now();
          // Double tap = two quick taps. A real hold-to-talk never counts as a tap.
          if (lastSpace.current && now - lastSpace.current < DOUBLE_PRESS_MS) {
            lastSpace.current = 0;
            spaceDown.current = false;
            voice.cancel();
            a.read();
          } else {
            spaceDownAt.current = now;
            spaceDown.current = true;
            startListening();
          }
          return;
        }
        case "Enter": {
          e.preventDefault();
          if (e.repeat) return;
          const now = Date.now();
          if (now - lastEnter.current < DOUBLE_PRESS_MS) {
            lastEnter.current = 0;
            a.save();
          } else {
            lastEnter.current = now;
            a.run();
          }
          return;
        }
        case "Escape": {
          e.preventDefault();
          const now = Date.now();
          if (audio.isSpeaking() && now - lastEscape.current > DOUBLE_PRESS_MS) {
            lastEscape.current = now;
            a.stop();
          } else {
            lastEscape.current = 0;
            a.clear();
          }
          return;
        }
        case "ArrowDown":
          e.preventDefault();
          return a.readLine(1);
        case "ArrowUp":
          e.preventDefault();
          return a.readLine(-1);
        case "F1":
        case "?":
          e.preventDefault();
          return a.help();
        case "+":
        case "=":
          return a.faster();
        case "-":
        case "_":
          return a.slower();
        default:
          break;
      }
      const key = e.key.toLowerCase();
      if (e.shiftKey && key === "s") {
        e.preventDefault();
        return a.chooseFolder();
      }
      const letter = { m: () => a[audio.builtInVoice ? "voiceOff" : "voiceOn"](), r: a.repeat, f: a.fix, e: a.explain, u: a.undo, o: a.readOutput, s: a.stop }[key];
      if (letter) {
        e.preventDefault();
        letter();
      }
    };

    const onKeyUp = (e) => {
      if (e.code === "Space" && spaceDown.current) {
        spaceDown.current = false;
        const now = Date.now();
        const wasTap = now - spaceDownAt.current < TAP_MS;
        lastSpace.current = wasTap ? now : 0;
        if (wasTap) voice.cancel();
        else voice.stop();
      }
    };

    const onPointerDown = (e) => {
      pointerFocused.current = e.target.closest?.("button, a, select, summary") || null;
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [audio, speak, start, startListening, voice]);

  // ---------------------------------------------------------------- touch
  // Mirrors the keyboard: hold = Space, swipes = arrow keys / U / O, two fingers = Esc.
  const topGestures = useGestures({
    onDoubleTap: () => actionsRef.current.read(),
    onHoldStart: startListening,
    onHoldEnd: () => voice.stop(),
    onSwipeRight: () => actionsRef.current.nextLine(),
    onSwipeLeft: () => actionsRef.current.prevLine(),
    onTwoFingerTap: () => actionsRef.current.stop(),
    holdMs: 350,
  });
  const bottomGestures = useGestures({
    onTap: () => actionsRef.current.run(),
    onDoubleTap: () => actionsRef.current.save(),
    onHoldStart: () => actionsRef.current.clear(),
    onSwipeRight: () => actionsRef.current.readOutput(),
    onSwipeLeft: () => actionsRef.current.undo(),
    onTwoFingerTap: () => actionsRef.current.stop(),
    holdMs: 800,
  });

  // ---------------------------------------------------------------- render
  const info = langInfo(language);
  const lineCount = code ? codeLines(code).length : 0;
  const busyLabel = { generating: "Writing code", fixing: "Fixing", running: "Running", explaining: "Explaining" }[busy];

  return (
    <>
      {!started && <IntroSplash leaving={splashLeaving} onStart={start} />}

      {/* Screen-reader announcements (only used when the built-in voice is off). */}
      <div className="sr-only" aria-live="polite" aria-relevant="additions" role="status">
        {audio.announcement.map((m) => (
          <p key={m.id}>{m.text}</p>
        ))}
      </div>

      <div className={`app-layout ${started ? "app-visible" : "app-hidden"}`} aria-hidden={!started}>
        <header>
          <h1>&#9635; BLIND CODER</h1>
          <span className="subtitle">Voice-Driven IDE for Visually Impaired Developers</span>
          <span className="copyright">&copy; Hanumanth Raghavendra 2026</span>
          <div className="header-right" aria-hidden="true">
            <span className="kb-hint">
              Hold <kbd>Space</kbd> speak · <kbd>Space</kbd>
              <kbd>Space</kbd> read · <kbd>↑</kbd>
              <kbd>↓</kbd> lines
            </span>
            <span className="kb-hint">
              <kbd>Enter</kbd> run · <kbd>Enter</kbd>
              <kbd>Enter</kbd> save (or <kbd>Ctrl</kbd>
              <kbd>S</kbd>) · <kbd>Esc</kbd> stop/clear · <kbd>F1</kbd> help
            </span>
          </div>
        </header>

        <main className="main">
          <section className="left-panel" aria-label="Code editor" {...topGestures}>
            <div className="panel-title">
              <span>&#128221; Code Editor</span>
              {code && (
                <span className="lang-badge" title="File name used when you save">
                  {fileNameFor(code, language || detectLanguage(code), fileStem)} · {plural(lineCount, "line")}
                </span>
              )}
            </div>
            <textarea
              id="code-area"
              aria-label={`Code editor${code ? `, ${info.name}, ${plural(lineCount, "line")}` : ", empty"}`}
              value={code}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              onChange={(e) => {
                const next = e.target.value;
                s.current.code = next;
                setCode(next);
                setLanguage(detectLanguage(next) || s.current.language);
              }}
              placeholder={
                "// Your generated code will appear here...\n// Hold SPACEBAR and speak a command\n// e.g. write a program to find the factorial of 5\n// Then just say what to change: \"make it use recursion\""
              }
            />
            <form
              id="prompt-section"
              onSubmit={(e) => {
                e.preventDefault();
                // Leave the text box so Enter / double Enter / Space work right away.
                promptInputRef.current?.blur();
                generate(prompt);
              }}
            >
              <label htmlFor="prompt-input" className="sr-only">
                Describe the program you want
              </label>
              <input
                id="prompt-input"
                ref={promptInputRef}
                type="text"
                value={prompt}
                autoComplete="off"
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={voice.isListening ? "Listening…" : 'Speak or type: "write a program to find factorial of 5"'}
              />
              <button id="btn-generate" type="submit" disabled={Boolean(busy)}>
                &#129302; {code ? "Update" : "Generate"}
              </button>
            </form>
          </section>

          <section className="right-panel" aria-label="Output console" {...bottomGestures}>
            <div className="panel-title">
              <span>&#128228; Output Console</span>
              {busyLabel && (
                <span className="busy" aria-hidden="true">
                  <span className="spinner" /> {busyLabel}…
                </span>
              )}
            </div>
            <div id="output-area" role="log" aria-label="Program output" tabIndex={0}>
              {output ? (
                <>
                  <span className={`output-${output.kind}`}>
                    {output.kind === "success" ? "SUCCESS\n\n" : output.kind === "error" ? "ERROR\n\n" : ""}
                    {output.text}
                  </span>
                  {output.detail && <span className="output-detail">{"\n\n" + output.detail}</span>}
                  {output.explanation && (
                    <span className="output-explain">
                      {"\n\n💡 "}
                      {output.explanation}
                    </span>
                  )}
                </>
              ) : (
                <span className="output-info">// Output will appear here after running code...</span>
              )}
            </div>
            <div id="history-section">
              <p>&#128336; Command History</p>
              <ul id="history-list">
                {history.map((item) => (
                  <li key={item}>
                    <button
                      type="button"
                      title={item}
                      onClick={() => {
                        setPrompt(item);
                        promptInputRef.current?.focus();
                      }}
                    >
                      {item}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </main>

        <footer className="controls">
          <button
            id="btn-voice"
            type="button"
            className={voice.isListening ? "listening" : ""}
            aria-pressed={voice.isListening}
            onClick={() => (voice.isListening ? voice.stop() : startListening())}
          >
            &#127908; {voice.isListening ? "Stop & Send" : "Start Voice"}
          </button>
          <button id="btn-run" type="button" aria-keyshortcuts="Enter" onClick={() => run()} disabled={Boolean(busy)}>
            &#9654; Run
          </button>
          <button id="btn-read" type="button" onClick={readCode}>
            &#128266; Read
          </button>
          <button id="btn-explain" type="button" aria-keyshortcuts="E" onClick={() => explain()} disabled={Boolean(busy)}>
            &#128161; Explain
          </button>
          <button id="btn-fix" type="button" aria-keyshortcuts="F" onClick={fix} disabled={Boolean(busy)}>
            &#128295; Fix
          </button>
          <button id="btn-save" type="button" aria-keyshortcuts="Control+S" onClick={save}>
            &#128190; Save
          </button>
          <button id="btn-undo" type="button" aria-keyshortcuts="U" onClick={undo}>
            &#8630; Undo
          </button>
          <button id="btn-clear" type="button" onClick={clear}>
            &#128465; Clear
          </button>
          {/* Phones/tablets: every keyboard shortcut as a button, for VoiceOver/TalkBack users. */}
          <div className="touch-controls" role="group" aria-label="More controls">
            <button type="button" onClick={() => readLine(-1)} aria-label="Previous line">
              &#9664; Line
            </button>
            <button type="button" onClick={() => readLine(1)} aria-label="Next line">
              Line &#9654;
            </button>
            <button type="button" onClick={readOutput}>
              &#128203; Output
            </button>
            <button type="button" onClick={audio.repeatLast}>
              &#128257; Repeat
            </button>
            <button type="button" onClick={() => changeRate(-0.15)} aria-label="Speak slower">
              &#128034; Slower
            </button>
            <button type="button" onClick={() => changeRate(0.15)} aria-label="Speak faster">
              &#128007; Faster
            </button>
            <button type="button" onClick={stopSpeech}>
              &#9209; Stop
            </button>
            <button type="button" onClick={help}>
              &#10067; Help
            </button>
          </div>
          <div id="status-bar">
            <span>{status}</span>
            {meta && <span className="meta">{meta}</span>}
          </div>
          <div className="speech-settings">
            {folderSaveSupported() && (
              <button
                type="button"
                className="mini"
                onClick={chooseFolder}
                aria-keyshortcuts="Shift+S"
                aria-label={`Save folder: ${saveFolderName || "Downloads, asks each time if your browser is set to"}. Choose a folder to save without a dialog.`}
                title="Choose a folder once; double Enter then saves straight into it"
              >
                📁 {saveFolderName || "Downloads"}
              </button>
            )}
            <button type="button" className="mini" onClick={() => setVoice(!audio.builtInVoice)} aria-keyshortcuts="M">
              {audio.builtInVoice ? "🔊 Voice" : "🔇 Screen reader"}
            </button>
            <span className="rate" aria-label={`Speech speed ${audio.rate}`}>
              {audio.rate.toFixed(2)}×
            </span>
          </div>
        </footer>
      </div>
    </>
  );
}
