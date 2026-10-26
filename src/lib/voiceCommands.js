/**
 * Short spoken phrases that control the IDE instead of generating code.
 * Anything that doesn't match is sent to the AI as a coding request.
 */
const COMMANDS = {
  run: ["run", "run it", "run code", "run the code", "run program", "run the program", "execute", "go"],
  read: ["read", "read it", "read code", "read the code", "read my code"],
  readOutput: ["read output", "read the output", "what is the output", "what's the output", "output"],
  save: ["save", "save it", "save code", "save the code", "save file", "download"],
  clear: ["clear", "clear all", "clear everything", "clear code", "reset", "start over", "new program"],
  undo: ["undo", "undo that", "go back", "revert"],
  fix: ["fix", "fix it", "fix this", "fix the code", "fix the error", "fix the bug", "fix my code", "debug", "debug it"],
  explain: [
    "explain",
    "explain it",
    "explain this",
    "explain code",
    "explain the code",
    "explain error",
    "explain the error",
    "what does this do",
    "what does it do",
    "what went wrong",
    "why",
  ],
  repeat: ["repeat", "repeat that", "say again", "say that again", "again", "pardon", "what"],
  stop: ["stop", "stop talking", "quiet", "be quiet", "silence", "shut up", "pause"],
  faster: ["faster", "speak faster", "talk faster", "speed up"],
  slower: ["slower", "speak slower", "talk slower", "slow down"],
  voiceOff: ["voice off", "mute", "use my screen reader", "screen reader mode"],
  voiceOn: ["voice on", "unmute", "use built in voice"],
  help: ["help", "commands", "what can i say", "what can you do", "instructions"],
};

const LOOKUP = new Map();
for (const [action, phrases] of Object.entries(COMMANDS)) for (const p of phrases) LOOKUP.set(p, action);

export function normalizeUtterance(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^\w\s']/g, " ")
    .replace(/\b(please|now|okay|ok|hey|blind ?coder)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Returns an action name, or null if the utterance is a coding request. */
export function matchCommand(text) {
  const n = normalizeUtterance(text);
  if (!n || n.split(" ").length > 5) return null;
  return LOOKUP.get(n) || null;
}

export const HELP_TEXT =
  "Hold Space and speak. Ask for any program, like: write a program to reverse a string in Java. " +
  "To change your code, just say what to change, like: make it print the first ten numbers. " +
  "Spoken commands: run, read, read output, explain, fix it, undo, save, clear, repeat, faster, slower, and stop. " +
  "Keys: Enter runs. Double tap Enter saves. Double tap Space reads the code. Up and down arrows read one line at a time. " +
  "Escape stops speech, press it again to clear. Plus and minus change speech speed. M switches to your own screen reader.";

export const TOUCH_HELP_TEXT =
  "Top pane: hold to speak, double tap to read the code. Bottom pane: tap to run, double tap to save, hold to clear. " +
  "You can also speak commands: run, read, explain, fix it, undo, save, clear, repeat, faster, slower, and stop.";
