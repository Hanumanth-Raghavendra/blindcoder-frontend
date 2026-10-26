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
  nextLine: ["next line", "next", "line down", "down"],
  prevLine: ["previous line", "previous", "line up", "up", "go back a line"],
  firstLine: ["first line", "top", "go to top", "start of code"],
  stop: ["stop", "stop talking", "quiet", "be quiet", "silence", "shut up", "pause"],
  faster: ["faster", "speak faster", "talk faster", "speed up"],
  slower: ["slower", "speak slower", "talk slower", "slow down"],
  chooseFolder: ["choose folder", "choose save folder", "set save folder", "save folder", "change folder", "change save folder", "pick folder", "pick a folder"],
  useDownloads: ["use downloads", "save to downloads", "forget folder", "forget save folder"],
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

const NUMBER_WORDS = {
  one: 1, two: 2, to: 2, too: 2, three: 3, four: 4, for: 4, five: 5, six: 6, seven: 7, eight: 8, ate: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
};

/** "line 5", "go to line five", "read line 12" -> 5 / 5 / 12; anything else -> null. */
export function parseLineCommand(text) {
  const m = normalizeUtterance(text).match(/^(?:go to |read |jump to )?line (\w+)$/);
  if (!m) return null;
  const n = /^\d+$/.test(m[1]) ? Number(m[1]) : NUMBER_WORDS[m[1]];
  return n > 0 ? n : null;
}

/** Returns an action name, or null if the utterance is a coding request. */
export function matchCommand(text) {
  const n = normalizeUtterance(text);
  if (!n || n.split(" ").length > 5) return null;
  if (parseLineCommand(n)) return "gotoLine";
  return LOOKUP.get(n) || null;
}

export const HELP_TEXT =
  "Hold Space and speak. Ask for any program, like: write a program to reverse a string in Java. " +
  "To change your code, just say what to change, like: make it print the first ten numbers. " +
  "Spoken commands: run, read, read output, explain, fix it, undo, save, clear, repeat, next line, line 5, faster, slower, and stop. " +
  "Keys: Enter runs. Double tap Enter, or Control S, saves. Shift S picks a folder to save into without any save window. Double tap Space reads the code. Up and down arrows read one line at a time. " +
  "Escape stops speech, press it again to clear. Plus and minus change speech speed. M switches to your own screen reader.";

export const TOUCH_HELP_TEXT =
  "Top pane, the code: hold to speak, double tap to read all the code, swipe right for the next line, swipe left for the previous line. " +
  "Bottom pane, the output: tap to run, double tap to save, hold to clear, swipe right to hear the output, swipe left to undo. " +
  "Tap with two fingers anywhere to stop speech. " +
  "You can also hold to speak a command: run, read, read output, explain, fix it, undo, save, clear, repeat, next line, line 5, faster, slower, stop. " +
  "If you use VoiceOver or TalkBack, every action is also a button at the bottom of the screen, and the Voice button switches messages to your screen reader.";
