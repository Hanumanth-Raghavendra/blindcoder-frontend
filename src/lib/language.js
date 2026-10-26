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

/** Java needs the file named after its public class to compile locally. */
export function fileNameFor(code, language) {
  const { ext } = langInfo(language);
  if (language === "java") {
    const m = code.match(/public\s+(?:final\s+)?class\s+(\w+)/);
    if (m) return `${m[1]}.java`;
  }
  return `blindcoder.${ext}`;
}
