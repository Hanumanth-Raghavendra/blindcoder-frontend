# BlindCoder — Frontend

A voice-driven IDE for blind and visually impaired developers. Speak what you want, hear what the code does, run it instantly. No sign-up, no setup.

Live: https://blindcoder.vercel.app · Backend: [blindcoder-backend](https://github.com/Hanumanth-Raghavendra/blindcoder-backend)

## How it works

1. **Hold Space** (or hold the top pane on a phone) and say what you want: *"write a program to check if a number is prime in Java"*.
2. BlindCoder reads back a one-sentence summary, then **runs the program and speaks the output**.
3. Keep talking to change it: *"make it check the first twenty numbers"*. Your current code is edited, not replaced.
4. If something breaks you hear the error, the line number and a plain-English explanation. Say **"fix it"**.

## Controls

| Keyboard | Touch | Action |
| --- | --- | --- |
| Hold `Space` | Hold top pane | Speak |
| Double tap `Space` | Double tap top pane | Read the code aloud |
| `↑` / `↓` | — | Read the previous / next line |
| `Enter` | Tap bottom pane | Run |
| Double tap `Enter` | Double tap bottom pane | Save the file (Java is saved as `Main.java` so it compiles) |
| `Esc` | — | Stop speaking; press again to clear |
| — | Hold bottom pane | Clear |
| `U` / `F` / `E` / `O` / `R` | — | Undo / fix / explain / read output / repeat |
| `+` / `-` | — | Speech faster / slower |
| `M` | — | Switch between the built-in voice and **your own screen reader** (NVDA, JAWS, VoiceOver) |
| `F1` | — | Help |

**Spoken commands:** run, read, read output, explain, fix it, undo, save, clear, repeat, faster, slower, stop, help. Anything else is treated as a coding request.

## What runs where

| Language | Runs in | Notes |
| --- | --- | --- |
| JavaScript | Your browser (Web Worker) | Instant. Infinite loops are stopped after 5 s |
| Python | Your browser (Pyodide in a Web Worker) | `numpy` etc. load on demand. Stopped after 10 s |
| C, C++, Java, C#, Go, Rust, Ruby, PHP, TypeScript, Swift, … | Free online compiler via the backend | No local setup needed |

## Accessibility

- Every action has a sound: rising tones for listening, a chord for success, a low buzz for errors, and a soft tick while the AI is thinking, so silence never leaves you wondering.
- Code is read with symbols spoken ("open paren", "double equals") and indentation announced, which matters for Python.
- Screen-reader mode routes messages through an ARIA live region instead of the built-in voice, so you never hear both at once.
- Real buttons, labels and visible focus rings. `Tab` works everywhere, and `Esc` leaves any text box.
- Respects reduced-motion settings. Speech speed and voice mode are remembered.

## Development

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # unit tests
npm run build
```

Use a local backend by creating `.env.local` with `VITE_BACKEND_URL=http://localhost:5000`.
