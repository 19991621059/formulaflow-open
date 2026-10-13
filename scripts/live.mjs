import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import JSZip from "jszip";

const root = new URL("../", import.meta.url);
const base = process.env.LIVE_APP_URL || "http://127.0.0.1:3476";
const auth = process.env.APP_ACCESS_TOKEN
  ? { authorization: `Bearer ${process.env.APP_ACCESS_TOKEN}` }
  : {};
const report = {
  date: new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date()),
  kind: "real vision model through application HTTP routes",
  cases: [],
};
await mkdir(new URL("outputs/live/", root), { recursive: true });
for (const mode of ["document", "formula"]) {
  const form = new FormData();
  form.set(
    "image",
    new File(
      [await readFile(new URL(`public/examples/${mode}.png`, root))],
      `${mode}.png`,
      { type: "image/png" },
    ),
  );
  form.set("mode", mode);
  const response = await fetch(base + "/api/process", {
    method: "POST",
    headers: auth,
    body: form,
    signal: AbortSignal.timeout(180000),
  });
  assert.equal(response.status, 200, "App rejected the live request");
  const events = (await response.text()).trim().split("\n").map(JSON.parse),
    result = events.at(-1);
  if (result.type !== "result")
    throw new Error(
      `Live ${mode} failed: ${result.code}: ${result.message} ${result.hint}`,
    );
  if (mode === "document") {
    assert.match(result.content, /微积分课堂笔记/);
    assert.match(result.content, /定积分/);
    assert.match(result.content, /\\int/);
  } else {
    assert.match(result.content, /\\int/);
    assert.match(result.content, /\\sqrt/);
    assert.match(result.content, /\\pi/);
  }
  const corrected =
    mode === "document"
      ? result.content.replace("微积分课堂笔记", "人工核对后的课堂笔记")
      : result.content + "\\quad \\text{已核对}";
  const requestJson = (path, format) =>
    fetch(base + path, {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({
        content: corrected,
        mode,
        format,
        filename: `live-${mode}`,
      }),
    });
  const preview = await requestJson("/api/preview");
  assert.equal(preview.status, 200);
  const checked = await preview.json();
  assert.match(checked.html, /<svg/);
  assert.equal(
    checked.issues.filter((issue) => issue.level === "error").length,
    0,
  );
  const exported = await requestJson("/api/export", "docx");
  assert.equal(exported.status, 200);
  const word = Buffer.from(await exported.arrayBuffer());
  const zip = await JSZip.loadAsync(word),
    xml = await zip.file("word/document.xml").async("string");
  assert.match(xml, /<m:oMath/);
  assert.doesNotMatch(xml, /<w:drawing|<w:altChunk/);
  if (mode === "document") {
    assert.match(xml, /人工核对后的课堂笔记/);
    assert.match(xml, /<w:tbl>/);
  } else assert.match(xml, /已核对/);
  const source = await requestJson(
    "/api/export",
    mode === "document" ? "md" : "tex",
  );
  assert.equal(source.status, 200);
  const sourceText = await source.text();
  assert.ok(sourceText.includes(corrected));
  await writeFile(new URL(`outputs/live/${mode}.docx`, root), word);
  await writeFile(new URL(`outputs/live/${mode}.md`, root), result.content);
  report.cases.push({
    mode,
    model: result.model,
    elapsedMs: result.elapsedMs,
    formulaCount: checked.formulaCount,
    nativeOfficeMath: (xml.match(/<m:oMath[ >]/g) || []).length,
    table: xml.includes("<w:tbl>"),
    correctedContentExported: true,
    warnings: checked.issues,
  });
  console.log(
    `Real ${mode}: upload, vision recognition, correction, preview and editable Word/source export passed (${Math.round(result.elapsedMs / 1000)}s).`,
  );
}
await writeFile(
  new URL("outputs/live/report.json", root),
  JSON.stringify(report, null, 2) + "\n",
);
