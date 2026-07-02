import { useEffect, useRef } from "react";

export function useSpeechAPI(onCapturedVoice, setStatusBar, setIsListening) {
  const recognitionRef = useRef(null);

  useEffect(() => {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SR) {
      var rec = new SR();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = "en-IN";

      rec.onresult = function (event) {
        var final = "";
        for (var i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) final += event.results[i][0].transcript;
        }
        if (final) {
          onCapturedVoice(final);
        }
      };

      rec.onerror = function (e) {
        setStatusBar("Voice error: " + e.error);
        setIsListening(false);
      };
      rec.onend = function () {
        setIsListening(false);
      };
      recognitionRef.current = rec;
    }
  }, [onCapturedVoice, setStatusBar, setIsListening]);

  const startVoiceCapture = () => {
    if (recognitionRef.current) {
      setIsListening(true);
      recognitionRef.current.start();
    }
  };

  const stopVoiceCapture = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  };

  return { startVoiceCapture, stopVoiceCapture };
}
