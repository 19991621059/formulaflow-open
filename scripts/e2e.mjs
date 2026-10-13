import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import JSZip from "jszip";

const root = new URL("../", import.meta.url);
const expected = await readFile(
  new URL("public/examples/document.md", root),
  "utf8",
);
let scenario = "success",
  calls = 0;
const provider = createServer(async (request, response) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const input = JSON.parse(Buffer.concat(chunks).toString());
  calls++;
  assert.match(
    input.messages[1].content[1].image_url.url,
    /^data:image\/png;base64,/,
  );
  if (scenario === "slow")
    await new Promise((resolve) => setTimeout(resolve, 400));
  if (scenario === "auth") {
    response.writeHead(401);
    response.end(
      JSON.stringify({ error: { message: "never-expose-this-body" } }),
    );
    return;
  }
  const reviewing = input.messages[0].content.includes(
    "Compare the supplied draft",
  );
  const content = reviewing
    ? expected.replace("微积分课堂笔记", "复核后的课堂笔记")
    : input.messages[0].content.includes("one raw LaTeX")
      ? "\\int_0^1 x^2\\,dx=\\frac{1}{3}"
      : expected;
  response.writeHead(200, { "content-type": "application/json" });
  response.end(
    JSON.stringify({
      choices: [{ finish_reason: "stop", message: { content } }],
    }),
  );
});
await new Promise((resolve) => provider.listen(0, "127.0.0.1", resolve));
const probe = createServer();
await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
const port = probe.address().port;
await new Promise((resolve) => probe.close(resolve));
const providerPort = provider.address().port,
  base = `http://127.0.0.1:${port}`,
  access = "e2e-access-placeholder";
const child = spawn(
  process.execPath,
  [new URL("scripts/start.mjs", root).pathname],
  {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      MODEL_API_BASE_URL: `http://127.0.0.1:${providerPort}/v1`,
      MODEL_API_KEY: "e2e-placeholder",
      MODEL_NAME: "e2e-vision",
      MODEL_ALLOW_PRIVATE_HOSTS: "true",
      APP_ACCESS_TOKEN: access,
      NEXT_TELEMETRY_DISABLED: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let serverOutput = "";
child.stdout.on("data", (data) => {
  serverOutput += data;
});
child.stderr.on("data", (data) => {
  serverOutput += data;
});
const auth = { authorization: `Bearer ${access}`, origin: base };
const requestJson = (path, body) =>
  fetch(base + path, {
    method: "POST",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
async function processImage(
  mode = "document",
  action = "recognize",
  draft = "",
) {
  const form = new FormData();
  form.set(
    "image",
    new File(
      [await readFile(new URL(`public/examples/${mode}.png`, root))],
      "public-sample.png",
      { type: "image/png" },
    ),
  );
  form.set("mode", mode);
  form.set("action", action);
  if (draft) form.set("draft", draft);
  const response = await fetch(base + "/api/process", {
    method: "POST",
    headers: auth,
    body: form,
  });
  assert.equal(response.status, 200);
  return (await response.text())
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
}
const report = {
  provider: "deterministic local test fixture; not real OCR",
  checks: [],
};
try {
  const deadline = Date.now() + 30000;
  while (true) {
    try {
      if ((await fetch(base)).ok) break;
    } catch {}
    if (Date.now() > deadline)
      throw new Error("App startup failed: " + serverOutput);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.equal((await fetch(base + "/api/config")).status, 401);
  report.checks.push("access token enforcement");
  assert.equal(
    (await fetch(base + "/api/config", { headers: auth })).status,
    200,
  );
  const events = await processImage();
  assert.deepEqual(
    events
      .filter((event) => event.type === "stage")
      .map((event) => event.stage),
    ["validate", "prepare", "recognize", "check"],
  );
  const result = events.at(-1);
  assert.equal(result.type, "result");
  assert.match(result.content, /微积分课堂笔记/);
  report.checks.push("multipart image upload and ordered live stage events");
  const edited = result.content.replace("微积分课堂笔记", "人工修正后的笔记");
  const preview = await requestJson("/api/preview", {
    content: edited,
    mode: "document",
  });
  assert.equal(preview.status, 200);
  const rendered = await preview.json();
  assert.equal(rendered.formulaCount, 5);
  assert.match(rendered.html, /<svg/);
  report.checks.push("edit and sanitized preview");
  const word = await requestJson("/api/export", {
    content: edited,
    mode: "document",
    format: "docx",
  });
  assert.equal(word.status, 200);
  const archive = await JSZip.loadAsync(await word.arrayBuffer());
  const xml = await archive.file("word/document.xml").async("string");
  assert.match(xml, /人工修正后的笔记/);
  assert.match(xml, /<m:oMath/);
  assert.match(xml, /<w:tbl>/);
  assert.doesNotMatch(xml, /<w:drawing|<w:altChunk/);
  report.checks.push("edited Word text, native math and table export");
  const markdown = await requestJson("/api/export", {
    content: edited,
    mode: "document",
    format: "md",
  });
  assert.equal(await markdown.text(), edited);
  report.checks.push("edited Markdown export");
  const formula = (await processImage("formula")).at(-1);
  assert.equal(formula.type, "result");
  for (const format of ["tex", "mathml", "json"]) {
    const output = await requestJson("/api/export", {
      content: formula.content,
      mode: "formula",
      format,
    });
    assert.equal(output.status, 200);
    assert.ok((await output.text()).length > 10);
  }
  report.checks.push("single-formula recognition and TeX, MathML, JSON export");
  const review = (await processImage("document", "review", edited)).at(-1);
  assert.match(review.content, /复核后的课堂笔记/);
  report.checks.push("model review proposal");
  scenario = "auth";
  const failure = (await processImage()).at(-1);
  assert.equal(failure.code, "MODEL_AUTH");
  assert.doesNotMatch(JSON.stringify(failure), /never-expose/);
  report.checks.push("actionable, redacted upstream authentication failure");
  scenario = "success";
  assert.equal((await processImage()).at(-1).type, "result");
  report.checks.push("retry after failure");
  const invalid = await requestJson("/api/export", {
    content: "\\frac{",
    mode: "formula",
    format: "docx",
  });
  assert.equal(invalid.status, 422);
  report.checks.push("invalid math blocks Word export");
  const before = calls;
  const badForm = new FormData();
  badForm.set(
    "image",
    new File(["not-image"], "invalid.png", { type: "image/png" }),
  );
  badForm.set("mode", "document");
  const bad = await fetch(base + "/api/process", {
    method: "POST",
    headers: auth,
    body: badForm,
  });
  assert.equal(
    (await bad.text()).trim().split("\n").map(JSON.parse).at(-1).code,
    "IMAGE_INVALID",
  );
  assert.equal(calls, before);
  report.checks.push("invalid image rejected before model call");
  const crossOrigin = await fetch(base + "/api/preview", {
    method: "POST",
    headers: {
      ...auth,
      origin: "https://unrelated.example",
      "content-type": "application/json",
    },
    body: JSON.stringify({ content: "a", mode: "formula" }),
  });
  assert.equal(crossOrigin.status, 403);
  report.checks.push("cross-origin request rejection");
  await mkdir(new URL("outputs/", root), { recursive: true });
  await writeFile(
    new URL("outputs/e2e-report.json", root),
    JSON.stringify(report, null, 2),
  );
  console.log(
    `Passed ${report.checks.length} black-box integration checks. Real OCR is verified separately with test:live.`,
  );
} finally {
  child.kill("SIGTERM");
  await new Promise((resolve) => provider.close(resolve));
}
