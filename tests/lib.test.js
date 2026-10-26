import { test } from "node:test";
import assert from "node:assert/strict";
import { matchCommand, parseLineCommand } from "../src/lib/voiceCommands.js";
import { speakableLine, summarizeOutput, indentLevel } from "../src/lib/codeSpeech.js";
import { detectLanguage, fileNameFor } from "../src/lib/language.js";
import { cleanPythonError } from "../src/lib/runner.js";

test("voice commands are recognised, coding requests are not", () => {
  assert.equal(matchCommand("Run"), "run");
  assert.equal(matchCommand("fix it please"), "fix");
  assert.equal(matchCommand("Explain the error."), "explain");
  assert.equal(matchCommand("read output"), "readOutput");
  assert.equal(matchCommand("undo"), "undo");
  assert.equal(matchCommand("write a program to run a loop ten times"), null);
  assert.equal(matchCommand("make it print the first ten numbers"), null);
});

test("code is spoken with symbols and indentation", () => {
  assert.equal(speakableLine("    print(x)"), "indent 1, print open paren x close paren");
  assert.equal(speakableLine("if (a === b) {"), "if open paren a triple equals b close paren open brace");
  assert.equal(speakableLine(""), "blank line");
  assert.equal(indentLevel("\t\tx"), 2);
});

test("long output is summarised for speech", () => {
  const text = Array.from({ length: 10 }, (_, i) => String(i + 1)).join("\n");
  assert.match(summarizeOutput(text), /^1\. 2\. 3\. 4\. 5\. 6\. And 4 more lines/);
});

test("language detection and file names", () => {
  assert.equal(detectLanguage("console.log(1)"), "javascript");
  assert.equal(detectLanguage("print('hi')"), "python");
  assert.equal(fileNameFor("public class Main { }", "java"), "Main.java");
  assert.equal(fileNameFor("print(1)", "python"), "blindcoder.py");
});

test("python tracebacks are cleaned up", () => {
  const tb = `Traceback (most recent call last):
  File "/lib/python312.zip/_pyodide/_base.py", line 523, in eval_code
    .run(globals, locals)
  File "<exec>", line 3, in <module>
NameError: name 'y' is not defined`;
  const r = cleanPythonError(tb);
  assert.equal(r.line, 3);
  assert.equal(r.message, "NameError: name 'y' is not defined");
  assert.ok(!r.detail.includes("/lib/python"));
  assert.match(cleanPythonError("EOFError: EOF when reading a line").message, /keyboard input/);
});

test("line navigation commands", () => {
  assert.equal(matchCommand("next line"), "nextLine");
  assert.equal(matchCommand("previous line"), "prevLine");
  assert.equal(matchCommand("go to line 12"), "gotoLine");
  assert.equal(parseLineCommand("go to line 12"), 12);
  assert.equal(parseLineCommand("line five"), 5);
  assert.equal(parseLineCommand("Line 3."), 3);
  assert.equal(parseLineCommand("write a line of code"), null);
  assert.equal(matchCommand("print each line of a file"), null);
});
