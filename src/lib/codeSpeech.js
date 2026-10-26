/**
 * Turns a line of code into something a speech synthesizer reads clearly:
 * symbols become words and indentation is announced (it matters in Python).
 */
const MULTI = [
  ["===", " triple equals "],
  ["!==", " not double equals "],
  ["==", " double equals "],
  ["!=", " not equals "],
  ["<=", " less or equal "],
  [">=", " greater or equal "],
  ["=>", " arrow "],
  ["->", " arrow "],
  ["++", " plus plus "],
  ["--", " minus minus "],
  ["+=", " plus equals "],
  ["-=", " minus equals "],
  ["*=", " times equals "],
  ["/=", " divide equals "],
  ["&&", " and "],
  ["||", " or "],
  ["<<", " left shift "],
  [">>", " right shift "],
  ["::", " double colon "],
  ["**", " power "],
  ["//", " double slash "],
];

const SINGLE = {
  "(": " open paren ",
  ")": " close paren ",
  "{": " open brace ",
  "}": " close brace ",
  "[": " open bracket ",
  "]": " close bracket ",
  "<": " less than ",
  ">": " greater than ",
  "=": " equals ",
  "+": " plus ",
  "-": " minus ",
  "*": " times ",
  "/": " slash ",
  "%": " percent ",
  ";": " semicolon ",
  ":": " colon ",
  ",": " comma ",
  ".": " dot ",
  '"': " quote ",
  "'": " quote ",
  "`": " backtick ",
  "#": " hash ",
  "!": " not ",
  "&": " ampersand ",
  "|": " pipe ",
  "^": " caret ",
  "~": " tilde ",
  "\\": " backslash ",
  "?": " question mark ",
  "@": " at ",
  $: " dollar ",
  _: " underscore ",
};

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const MULTI_RE = new RegExp(MULTI.map(([s]) => escapeRe(s)).join("|"), "g");
const MULTI_MAP = Object.fromEntries(MULTI);

export function indentLevel(line) {
  const lead = line.match(/^[\t ]*/)[0];
  const spaces = lead.replace(/\t/g, "    ").length;
  return Math.round(spaces / 4) || (spaces > 0 ? 1 : 0);
}

export function speakableLine(line) {
  if (!line.trim()) return "blank line";
  const level = indentLevel(line);
  let body = line
    .trim()
    .replace(MULTI_RE, (m) => MULTI_MAP[m])
    .replace(/[(){}[\]<>=+\-*/%;:,."'`#!&|^~\\?@$_]/g, (ch) => SINGLE[ch] || ch)
    .replace(/\s+/g, " ")
    .trim();
  return (level ? `indent ${level}, ` : "") + body;
}

export function codeLines(code) {
  return code.replace(/\s+$/, "").split("\n");
}

/** Shortens long output for speech; the full text stays on screen. */
export function summarizeOutput(text, maxLines = 6) {
  const lines = String(text || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length <= maxLines) return lines.join(". ");
  return `${lines.slice(0, maxLines).join(". ")}. And ${lines.length - maxLines} more lines. Say read output to hear everything.`;
}
