import React, { useState, useEffect, useRef } from "react";
import { useAudioEngine } from "./hooks/useAudioEngine";
import { useSpeechAPI } from "./hooks/useSpeechAPI";

const BACKEND_URL = "https://blindcoder-backend.onrender.com";

// ==================================================== */
// 🚀 INTRO SPLASH COMPONENT (Opening Animation & Audio)
// ==================================================== */
function IntroSplash({ onComplete }) {
  const [isFadingOut, setIsFadingOut] = useState(false);
  const { initAudio, speak } = useAudioEngine();
  const splashTriggered = useRef(false);

  useEffect(() => {
    const handleFirstInteraction = () => {
      if (splashTriggered.current) return;
      splashTriggered.current = true;
      initAudio();

      // Dynamically detect screen format boundary (Laptop vs iPad/Mobile)
      const isTouchDevice = window.innerWidth <= 1024;

      const welcomeMessage = isTouchDevice
        ? "Blind-Coder ready.... Top pane: Hold to speak.. double tap to read.. Bottom pane: Tap to run.. double tap to save.. hold to clear."
        : "Blind-Coder ready.... Hold Space to speak.. double tap space to read.. press enter to run.. double tap enter to save.. escape to clear.";

      // Reduced speech speed parameter (rate: 0.85) to make the intro audio slower and clearer
      speak(welcomeMessage, 0.85);

      // Increased duration to 10500ms to accommodate the slower speech rate before fading out
      const finishTimer = setTimeout(() => {
        setIsFadingOut(true);
        setTimeout(() => {
          onComplete();
        }, 800); // Matches CSS transition duration
      }, 10500);

      window.removeEventListener("mousedown", handleFirstInteraction);
      window.removeEventListener("keydown", handleFirstInteraction);
      return () => clearTimeout(finishTimer);
    };

    window.addEventListener("mousedown", handleFirstInteraction);
    window.addEventListener("keydown", handleFirstInteraction);

    return () => {
      window.removeEventListener("mousedown", handleFirstInteraction);
      window.removeEventListener("keydown", handleFirstInteraction);
    };
  }, [initAudio, speak, onComplete]);

  return (
    <div className={`splash-overlay ${isFadingOut ? "fade-out" : ""}`}>
      <div className="splash-content">
        <div className="pulse-ring"></div>
        <h1 className="splash-title">&#9635; BLIND CODER</h1>
        <p className="splash-subtitle">
          Voice-Driven IDE for Visually Impaired Developers
        </p>
        <p className="splash-action-hint">
          Click anywhere or press any key to initialize system audio...
        </p>
        <div className="audio-wave-bars">
          <span></span>
          <span></span>
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [isLoadingIntro, setIsLoadingIntro] = useState(true);
  const [code, setCode] = useState("");
  const [groqInput, setGroqInput] = useState("");
  const [consoleOutput, setConsoleOutput] = useState("");
  const [statusBar, setStatusBar] = useState(
    "Click anywhere to begin. Then hold Spacebar to speak.",
  );
  const [historyList, setHistoryList] = useState([]);
  const [isListening, setIsListening] = useState(false);

  const { initAudio, playSuccess, playError, speak } = useAudioEngine();
  const isSpaceHeld = useRef(false);
  const lastSpaceTime = useRef(0);
  const lastEnterTime = useRef(0);
  const pyodideReady = useRef(null);

  // Advanced Multi-Gesture Tracking State Blocks
  const lastLeftTouchTime = useRef(0);
  const lastRightTouchTime = useRef(0);
  const touchHoldTimeout = useRef(null);
  const voiceStreamActive = useRef(false);

  useEffect(() => {
    const loadPyEngine = async () => {
      if (window.loadPyodide) {
        try {
          pyodideReady.current = await window.loadPyodide();
        } catch (e) {
          console.error("Pyodide loading error:", e);
        }
      }
    };
    loadPyEngine();
  }, []);

  const processIncomingVoice = (transcript) => {
    const lower = transcript.toLowerCase();
    let langHint = "";
    if (lower.includes("python"))
      langHint = " Generate in Python only. Use print() for output.";
    else if (
      lower.includes("c program") ||
      lower.includes(" in c") ||
      lower.includes("c language")
    )
      langHint = " Generate in C language only. Use printf() for output.";
    else if (lower.includes("java") && !lower.includes("javascript"))
      langHint = " Generate in Java only. Use System.out.println() for output.";

    const completePrompt = transcript + langHint;
    setGroqInput(completePrompt);
    setStatusBar("Heard: " + transcript);
    setHistoryList((prev) => [transcript, ...prev].slice(0, 10));
    dispatchGenerationRequest(completePrompt);
  };

  const { startVoiceCapture, stopVoiceCapture } = useSpeechAPI(
    processIncomingVoice,
    setStatusBar,
    setIsListening,
  );

  // Keyboard Event Handlers
  useEffect(() => {
    const triggerKeyDown = (e) => {
      const typing =
        document.activeElement.tagName === "INPUT" ||
        document.activeElement.tagName === "TEXTAREA";

      if (e.code === "Space" && !typing) {
        e.preventDefault();
        initAudio();
        if (e.repeat) return;

        const now = Date.now();
        if (now - lastSpaceTime.current < 400) {
          lastSpaceTime.current = 0;
          triggerAudioCodeRead();
        } else {
          if (!isListening && !isSpaceHeld.current) {
            isSpaceHeld.current = true;
            startVoiceCapture();
          }
          lastSpaceTime.current = now;
        }
      }

      if (!typing) {
        if (e.code === "Enter") {
          e.preventDefault();
          if (e.repeat) return;
          const now = Date.now();
          if (now - lastEnterTime.current < 400) {
            lastEnterTime.current = 0;
            executeBlobFileExport();
          } else {
            lastEnterTime.current = now;
            handleRuntimeCompilation();
          }
        }
        if (e.code === "Escape") {
          e.preventDefault();
          wipeStateBoards();
        }
      }
    };

    const triggerKeyUp = (e) => {
      if (e.code === "Space") {
        isSpaceHeld.current = false;
        stopVoiceCapture();
      }
    };

    window.addEventListener("keydown", triggerKeyDown);
    window.addEventListener("keyup", triggerKeyUp);
    return () => {
      window.removeEventListener("keydown", triggerKeyDown);
      window.removeEventListener("keyup", triggerKeyUp);
    };
  }, [
    code,
    groqInput,
    isListening,
    initAudio,
    startVoiceCapture,
    stopVoiceCapture,
  ]);

  // CROSS-PLATFORM GESTURE MATRIX ROUTER
  const handlePanelTouchStart = (e, panelSide) => {
    const isInteractive =
      e.target.tagName === "BUTTON" || e.target.tagName === "INPUT";
    if (isInteractive) return;

    initAudio();
    const now = Date.now();

    if (panelSide === "left") {
      if (now - lastLeftTouchTime.current < 300) {
        clearTimeout(touchHoldTimeout.current);
        lastLeftTouchTime.current = 0;
        triggerAudioCodeRead();
      } else {
        lastLeftTouchTime.current = now;
        touchHoldTimeout.current = setTimeout(() => {
          voiceStreamActive.current = true;
          startVoiceCapture();
          setStatusBar("Listening to voice input streams...");
        }, 350);
      }
    } else if (panelSide === "right") {
      if (now - lastRightTouchTime.current < 300) {
        clearTimeout(touchHoldTimeout.current);
        lastRightTouchTime.current = 0;
        executeBlobFileExport();
      } else {
        lastRightTouchTime.current = now;

        touchHoldTimeout.current = setTimeout(() => {
          handleRuntimeCompilation();
        }, 280);

        touchHoldTimeout.current = setTimeout(() => {
          wipeStateBoards();
        }, 1000);
      }
    }
  };

  const handlePanelTouchEnd = (e, panelSide) => {
    clearTimeout(touchHoldTimeout.current);
    if (panelSide === "left" && voiceStreamActive.current) {
      voiceStreamActive.current = false;
      stopVoiceCapture();
    }
  };

  const dispatchGenerationRequest = async (targetPrompt) => {
    setStatusBar("Generating Code...");
    try {
      const res = await fetch(`${BACKEND_URL}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: targetPrompt }),
      });
      const data = await res.json();
      if (data.code) {
        setCode(data.code);
        const isJS =
          !data.code.includes("print(") &&
          !data.code.includes("#include") &&
          !data.code.includes("public class") &&
          !data.code.includes("def ") &&
          !data.code.includes("System.out") &&
          !data.code.includes("printf(");
        if (isJS) {
          setStatusBar("Code generated! Running now...");
          speak("Code generated. Running now.", 0.85);
          setTimeout(() => {
            handleRuntimeCompilation(data.code);
          }, 600);
        } else {
          const isPy =
            data.code.includes("print(") ||
            data.code.includes("def ") ||
            data.code.includes("import ");
          const ext = isPy
            ? "py"
            : data.code.includes("#include")
              ? "c"
              : data.code.includes("public class")
                ? "java"
                : "txt";
          if (isPy) {
            setStatusBar("Code generated! Running Python now...");
            speak("Python code generated. Running now.", 0.85);
            setTimeout(() => {
              handleRuntimeCompilation(data.code);
            }, 800);
          } else {
            setStatusBar(
              "Code generated! Press double-Enter to save as ." +
                ext +
                " file.",
            );
            speak(
              "Code generated. This is " +
                ext +
                " code. Double tap Enter to save.",
              0.85,
            );
          }
        }
      }
    } catch (err) {
      setStatusBar("Network error: " + err.message);
      speak("Network error.", 0.85);
    }
  };

  const handleRuntimeCompilation = async (overrideCode) => {
    initAudio();
    const activeCode = overrideCode || code.trim();
    if (!activeCode) {
      setStatusBar("No code to run.");
      speak("No code found.", 0.85);
      return;
    }

    setConsoleOutput("");
    const isPython =
      activeCode.includes("print(") ||
      activeCode.includes("def ") ||
      activeCode.includes("import ");
    const isNonJS =
      activeCode.includes("#include") ||
      activeCode.includes("public class") ||
      activeCode.includes("System.out");

    if (isNonJS) {
      setConsoleOutput(
        "This is C/Java code. Press Enter+Enter to save it, then run it locally.",
      );
      speak(
        "This is C or Java code. Save it and run it on your computer.",
        0.85,
      );
      setStatusBar("C/Java detected — save and run locally.");
      return;
    }

    if (isPython) {
      if (!pyodideReady.current) {
        setStatusBar("Python engine loading... please wait.");
        speak(
          "Python engine is still loading. Please try again in a moment.",
          0.85,
        );
        return;
      }
      try {
        setStatusBar("Running Python...");
        let stdoutCapture = "";
        pyodideReady.current.setStdout({
          batched: (text) => {
            stdoutCapture += text;
          },
        });
        await pyodideReady.current.runPythonAsync(activeCode);
        const outText = stdoutCapture.trim() || "(ran with no output)";
        setConsoleOutput("SUCCESS\n\n" + outText);
        playSuccess();
        speak(
          "Python ran successfully. Output: " +
            stdoutCapture.trim().split("\n").slice(0, 3).join(". "),
          0.85,
        );
        setStatusBar("Python ran successfully.");
      } catch (err) {
        setConsoleOutput("ERROR\n\n" + err.message);
        playError();
        speak("Python error. " + err.message, 0.85);
        setStatusBar("Python error.");
        dispatchDiagnosticExplanation(err.message, activeCode);
      }
      return;
    }

    let logs = [];
    const oldLog = console.log;
    console.log = (...args) =>
      logs.push(
        args
          .map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a)))
          .join(" "),
      );

    try {
      const result = eval(activeCode);
      console.log = oldLog;
      let allOutput = logs.slice();
      if (result !== undefined) allOutput.push("-> " + result);
      const outText = allOutput.join("\n") || "(code ran - no output)";
      setConsoleOutput("SUCCESS\n\n" + outText);
      playSuccess();
      speak(
        logs.length
          ? "Code ran successfully. Output: " + logs.join(". ")
          : "Code ran successfully. No output detected.",
        0.85,
      );
      setStatusBar("Code ran successfully.");
    } catch (err) {
      console.log = oldLog;
      setConsoleOutput("ERROR\n\n" + err.message);
      playError();
      speak("Error. " + err.message + ". Asking Groq to explain.", 0.85);
      setStatusBar("Error - fetching explanation...");
      dispatchDiagnosticExplanation(err.message, activeCode);
    }
  };

  const dispatchDiagnosticExplanation = async (errMsg, activeCode) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/explain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ errMsg, code: activeCode }),
      });
      const data = await res.json();
      if (data.explanation) {
        setConsoleOutput(
          (prev) => prev + `\n\nGroq explains:\n${data.explanation}`,
        );
        speak("Groq explains: " + data.explanation, 0.85);
        setStatusBar("Error explained by Groq");
      }
    } catch (e) {}
  };

  const triggerAudioCodeRead = () => {
    if (!code.trim()) return speak("No code to read.", 0.85);
    speak("Reading code. " + code, 0.85);
    setStatusBar("Reading code aloud...");
  };

  const executeBlobFileExport = () => {
    if (!code.trim()) {
      speak("Nothing to save.", 0.85);
      return;
    }
    const ext = code.includes("public class")
      ? "java"
      : code.includes("#include")
        ? "c"
        : code.includes("print(")
          ? "py"
          : "js";
    const blob = new Blob([code], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "blindcoder_output." + ext;
    a.click();
    setStatusBar("Code saved as ." + ext + " to downloads!");
    speak("Code saved as " + ext + " file to your downloads folder.", 0.85);
  };

  const wipeStateBoards = () => {
    setCode("");
    setGroqInput("");
    setConsoleOutput("// Cleared. Ready for next command.");
    setStatusBar("Cleared. Hold Space to speak.");
    speak("Cleared. Ready for your next command.", 0.85);
  };

  return (
    <>
      {isLoadingIntro && (
        <IntroSplash onComplete={() => setIsLoadingIntro(false)} />
      )}

      <div
        className={`app-layout ${isLoadingIntro ? "app-hidden" : "app-visible"}`}
      >
        <header>
          <h1>&#9635; BLIND CODER</h1>
          <span className="subtitle">
            Voice-Driven IDE for Visually Impaired Developers
          </span>
          <span
            className="copyright"
            style={{
              color: "#7a9abb",
              fontSize: "0.85rem",
              marginLeft: "15px",
            }}
          >
            &copy; Hanumanth Raghavendra 2026
          </span>
          <div className="header-right">
            <span className="kb-hint">
              Hold <kbd>Space</kbd> to speak &nbsp;|&nbsp; Double-tap{" "}
              <kbd>Space</kbd> to read
            </span>
            <span className="kb-hint">
              <kbd>Enter</kbd> Run &nbsp;|&nbsp; Double-tap <kbd>Enter</kbd>{" "}
              Save &nbsp;|&nbsp; <kbd>Esc</kbd> Clear
            </span>
          </div>
        </header>

        <div className="main">
          <div
            className="left-panel"
            onTouchStart={(e) => handlePanelTouchStart(e, "left")}
            onTouchEnd={(e) => handlePanelTouchEnd(e, "left")}
          >
            <div className="panel-title">&#128221; Code Editor</div>
            <textarea
              id="code-area"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="// Your generated code will appear here...&#10;// Hold SPACEBAR and speak a command&#10;// e.g. write a program to find factorial of 5&#10;// Press Enter to run after code appears"
            />
            <div id="prompt-section">
              <input
                id="groq-input"
                type="text"
                value={groqInput}
                onChange={(e) => setGroqInput(e.target.value)}
                placeholder='Speak or type: "write a program to find factorial of 5"'
              />
              <button
                id="btn-generate"
                onClick={() => dispatchGenerationRequest(groqInput)}
              >
                &#129302; Generate
              </button>
            </div>
          </div>

          <div
            className="right-panel"
            onTouchStart={(e) => handlePanelTouchStart(e, "right")}
            onTouchEnd={(e) => handlePanelTouchEnd(e, "right")}
          >
            <div className="panel-title">&#128228; Output Console</div>
            <div id="output-area">
              {consoleOutput ? (
                consoleOutput.startsWith("ERROR") ? (
                  <span className="output-error">{consoleOutput}</span>
                ) : consoleOutput.startsWith("SUCCESS") ? (
                  <span className="output-success">{consoleOutput}</span>
                ) : (
                  <span className="output-info">{consoleOutput}</span>
                )
              ) : (
                <span className="output-info">
                  // Output will appear here after running code...
                </span>
              )}
            </div>
            <div id="history-section">
              <p>&#128336; Command History</p>
              <ul id="history-list">
                {historyList.map((item, index) => (
                  <li
                    key={index}
                    onClick={() => setGroqInput(item)}
                    title={item}
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="controls">
          <button
            id="btn-voice"
            className={isListening ? "listening" : ""}
            onClick={() =>
              isListening ? stopVoiceCapture() : startVoiceCapture()
            }
          >
            &#127908; Start Voice
          </button>
          <button id="btn-run" onClick={() => handleRuntimeCompilation()}>
            &#9654; Run Code
          </button>
          <button id="btn-read" onClick={triggerAudioCodeRead}>
            &#128266; Read Code
          </button>
          <button id="btn-save" onClick={executeBlobFileExport}>
            &#128190; Save Code
          </button>
          <button id="btn-clear" onClick={wipeStateBoards}>
            &#128465; Clear
          </button>
          <div id="status-bar">{statusBar}</div>
          <div className="audio-indicator">
            <div
              className="dot"
              id="dot-err"
              style={{ background: "#ff4444" }}
            ></div>
            <span style={{ color: "#ff4444" }}>ERR</span>
            <div
              className="dot"
              id="dot-ok"
              style={{ background: "#00ff88" }}
            ></div>
            <span style={{ color: "#00ff88" }}>OK</span>
          </div>
        </div>
      </div>
    </>
  );
}
