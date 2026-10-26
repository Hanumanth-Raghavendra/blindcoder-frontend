/** Language metadata: how to say it, save it, and where it runs. */
export const LANGUAGES = {
  python: { name: "Python", spoken: "Python", ext: "py", runsIn: "browser" },
  javascript: { name: "JavaScript", spoken: "JavaScript", ext: "js", runsIn: "browser" },
  typescript: { name: "TypeScript", spoken: "TypeScript", ext: "ts", runsIn: "cloud" },
  c: { name: "C", spoken: "C", ext: "c", runsIn: "cloud" },
  cpp: { name: "C++", spoken: "C plus plus", ext: "cpp", runsIn: "cloud" },
  java: { name: "Java", spoken: "Java", ext: "java", runsIn: "cloud" },
  csharp: { name: "C#", spoken: "C sharp", ext: "cs", runsIn: "cloud" },
  go: { name: "Go", spoken: "Go", ext: "go", runsIn: "cloud" },
  rust: { name: "Rust", spoken: "Rust", ext: "rs", runsIn: "cloud" },
  ruby: { name: "Ruby", spoken: "Ruby", ext: "rb", runsIn: "cloud" },
  php: { name: "PHP", spoken: "P H P", ext: "php", runsIn: "cloud" },
  perl: { name: "Perl", spoken: "Perl", ext: "pl", runsIn: "cloud" },
  swift: { name: "Swift", spoken: "Swift", ext: "swift", runsIn: "cloud" },
  kotlin: { name: "Kotlin", spoken: "Kotlin", ext: "kt", runsIn: "cloud" },
  scala: { name: "Scala", spoken: "Scala", ext: "scala", runsIn: "cloud" },
  haskell: { name: "Haskell", spoken: "Haskell", ext: "hs", runsIn: "cloud" },
  lua: { name: "Lua", spoken: "Lua", ext: "lua", runsIn: "cloud" },
  r: { name: "R", spoken: "R", ext: "r", runsIn: "cloud" },
  bash: { name: "Bash", spoken: "Bash", ext: "sh", runsIn: "cloud" },
  sql: { name: "SQL", spoken: "S Q L", ext: "sql", runsIn: "cloud" },
  elixir: { name: "Elixir", spoken: "Elixir", ext: "exs", runsIn: "cloud" },
  erlang: { name: "Erlang", spoken: "Erlang", ext: "erl", runsIn: "cloud" },
  julia: { name: "Julia", spoken: "Julia", ext: "jl", runsIn: "cloud" },
  dart: { name: "Dart", spoken: "Dart", ext: "dart", runsIn: "cloud" },
  d: { name: "D", spoken: "D", ext: "d", runsIn: "cloud" },
  nim: { name: "Nim", spoken: "Nim", ext: "nim", runsIn: "cloud" },
  zig: { name: "Zig", spoken: "Zig", ext: "zig", runsIn: "cloud" },
  ocaml: { name: "OCaml", spoken: "O Caml", ext: "ml", runsIn: "cloud" },
  pascal: { name: "Pascal", spoken: "Pascal", ext: "pas", runsIn: "cloud" },
  groovy: { name: "Groovy", spoken: "Groovy", ext: "groovy", runsIn: "cloud" },
  lisp: { name: "Lisp", spoken: "Lisp", ext: "lisp", runsIn: "cloud" },
  fsharp: { name: "F#", spoken: "F sharp", ext: "fsx", runsIn: "cloud" },
};

export const langInfo = (id) => LANGUAGES[id] || { name: "Code", spoken: "code", ext: "txt", runsIn: "none" };

/** Fallback detection for code the user typed or pasted. */
export function detectLanguage(code = "") {
  const c = code;
  if (/^\s*#include\s*<iostream>|std::|cout\s*<</m.test(c)) return "cpp";
  if (/^\s*#include\s*[<"]/m.test(c)) return "c";
  if (/\bpublic\s+static\s+void\s+main\s*\(/.test(c) || /System\.out\.print/.test(c)) return "java";
  if (/\bstatic\s+void\s+Main\s*\(|Console\.Write/.test(c)) return "csharp";
  if (/^\s*package\s+main\b|fmt\.Print/m.test(c)) return "go";
  if (/\bfn\s+main\s*\(|println!\s*\(/.test(c)) return "rust";
  if (/<\?php/.test(c)) return "php";
  if (/^\s*(def|class)\s+\w+.*:\s*$|^\s*print\s*\(|^\s*import\s+\w+\s*$|^\s*from\s+\w+\s+import\s/m.test(c))
    return "python";
  if (/\bconsole\.log\s*\(|\b(let|const)\s+\w+\s*=|=>|function\s+\w+\s*\(/.test(c)) return "javascript";
  if (/^\s*puts\s|\bend\s*$/m.test(c)) return "ruby";
  if (/^\s*use\s+strict;|^\s*my\s+\$/m.test(c)) return "perl";
  return "";
}

/** "Prime Numbers.py" / "reverseString" / "fizz-buzz" -> "prime_numbers" / "reverse_string" / "fizz_buzz" */
export function toFileStem(raw) {
  return String(raw || "")
    .replace(/[`"'*]/g, "")
    .trim()
    .replace(/\.[a-z0-9+#]{1,6}$/i, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40)
    .replace(/_+$/, "");
}

const LANGUAGE_WORDS =
  /\b(?:in|using|with)\s+(?:python ?3?|java ?script|javascript|java|type ?script|c\s*(?:\+\+|plus plus|sharp|#)|cpp|c|golang|go|rust|ruby|php|perl|swift|kotlin|scala|haskell|lua|r|bash|shell|sql)(?:\s+language)?\b/gi;
const FILLER =
  /\b(?:please|can you|could you|i want|i need|write|create|make|generate|give me|build|show me|now|a|an|the|simple|small|program|programme|code|script|function|method|that|which|to|for|of|and|me|it|language)\b/gi;

/** Fallback name from what the user asked for: "write a program to find factorial of 5 in python" -> "find_factorial_5" */
export function stemFromPrompt(prompt) {
  const words = String(prompt || "")
    .replace(LANGUAGE_WORDS, " ")
    .replace(FILLER, " ")
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .slice(0, 4);
  return toFileStem(words.join("_"));
}

/** Last resort: a name from the code itself (first function), else "<language>_program". */
function stemFromCode(code, language) {
  const fn =
    code.match(/^\s*def\s+([A-Za-z_]\w*)/m)?.[1] ||
    code.match(/\bfunction\s+([A-Za-z_$][\w$]*)/)?.[1] ||
    code.match(/\bfn\s+(?!main\b)([A-Za-z_]\w*)/)?.[1] ||
    code.match(/\bfunc\s+(?!main\b)([A-Za-z_]\w*)/)?.[1];
  return toFileStem(fn) || `${language || "code"}_program`;
}

/**
 * The exact file name to save as. Java must match its public class name or it
 * won't compile; everything else uses the descriptive name + correct extension.
 */
export function fileNameFor(code, language, stem = "") {
  const { ext } = langInfo(language);
  if (language === "java") {
    const m = code.match(/public\s+(?:final\s+|abstract\s+)?class\s+(\w+)/);
    if (m) return `${m[1]}.java`;
  }
  return `${toFileStem(stem) || stemFromCode(code, language)}.${ext}`;
}

/** "prime_numbers.py" -> "prime numbers dot py" */
export const speakFileName = (name) => name.replace(/_/g, " ").replace(/\.(\w+)$/, " dot $1");
