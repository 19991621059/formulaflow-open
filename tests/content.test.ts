import { test } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { checkContent, previewContent } from "../lib/server/content";
import { createDocx } from "../lib/server/export-docx";

test("preview renders formulas and tables without scripts, remote images or event handlers", () => {
  const content =
    '# 笔记\n\n$$\n\\int_0^1 x^2\\,dx=\\frac{1}{3}\n$$\n\n<table><tr><th>函数</th></tr><tr><td>$x^2$</td></tr></table>\n\n<img src="https://tracking.example/pixel" onerror="alert(1)"><script>alert(2)</script>';
  const result = previewContent(content, "document");
  assert.equal(result.formulaCount, 2);
  assert.match(result.html, /<svg/);
  assert.match(result.html, /<table>/);
  assert.doesNotMatch(result.html, /<script|<img|onerror|tracking\.example/);
});
test("syntax checks reject invalid equations and retain unreadable markers", () => {
  assert.equal(checkContent("\\frac{", "formula").issues[0]?.level, "error");
  assert.equal(
    checkContent("需要核对 [[UNREADABLE]]。", "document").issues[0]?.level,
    "warning",
  );
  assert.throws(() => checkContent("", "document"));
});
test("Word export contains edited text, real tables and native Office math with integral operands", async () => {
  const content =
    "# 修订后的笔记\n\n确认后的结果。\n\n$$\n\\int_0^1 x^2\\,dx=\\frac{1}{3}\n$$\n\n| 函数 | 导数 |\n| --- | --- |\n| $x^2$ | $2x$ |";
  const zip = await JSZip.loadAsync(await createDocx(content, "document"));
  const xml = await zip.file("word/document.xml")!.async("string");
  assert.match(xml, /修订后的笔记/);
  assert.match(xml, /确认后的结果/);
  assert.match(xml, /<w:tbl>/);
  assert.ok((xml.match(/<m:oMath[ >]/g) || []).length >= 3);
  assert.match(xml, /<m:nary>/);
  assert.match(xml, /<m:e>[\s\S]*?<m:sSup>/);
  assert.doesNotMatch(xml, /<w:drawing|<w:altChunk/);
});
test("native formula export preserves literal comparison symbols and XML escaping", async () => {
  const zip = await JSZip.loadAsync(
    await createDocx("a < b \\quad \\text{A\\&B}", "formula"),
  );
  const xml = await zip.file("word/document.xml")!.async("string");
  assert.match(xml, /&lt;/);
  assert.match(xml, /A&amp;B/);
});
