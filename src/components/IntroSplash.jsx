import React from "react";

/** First screen. Browsers only allow audio after a user gesture, so one click
 * or key press starts BlindCoder (and its voice). */
export default function IntroSplash({ leaving, onStart }) {
  return (
    <div className={`splash-overlay ${leaving ? "fade-out" : ""}`}>
      <button type="button" className="splash-content" onClick={onStart} autoFocus aria-label="Start BlindCoder. Press any key or tap anywhere.">
        <span className="pulse-ring" aria-hidden="true" />
        <span className="splash-title">&#9635; BLIND CODER</span>
        <span className="splash-subtitle">Voice-Driven IDE for Visually Impaired Developers</span>
        <span className="splash-action-hint">Press any key or tap anywhere to start</span>
        <span className="audio-wave-bars" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
          <span />
        </span>
      </button>
    </div>
  );
}
