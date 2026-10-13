import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import sharp from "sharp";
import { prepareImage, recognize } from "../lib/server/model";
import type { ModelConfig } from "../lib/server/config";

test("image preparation rejects disguised files and strips metadata", async () => {
  await assert.rejects(
    () =>
      prepareImage(
        new File(["not an image"], "input.png", { type: "image/png" }),
      ),
    /无法解码/,
  );
  const jpeg = await sharp({
    create: { width: 20, height: 20, channels: 3, background: "white" },
  })
    .jpeg()
    .withMetadata({ exif: { IFD0: { Artist: "test-private-marker" } } })
    .toBuffer();
  const image = await prepareImage(
    new File([new Uint8Array(jpeg)], "photo.jpg", { type: "image/jpeg" }),
  );
  const metadata = await sharp(
    Buffer.from(image.split(",")[1], "base64"),
  ).metadata();
  assert.equal(metadata.exif, undefined);
  await assert.rejects(
    () =>
      prepareImage(
        new File([new Uint8Array(jpeg)], "fake.png", { type: "image/png" }),
      ),
    /无法解码/,
  );
});
test("model adapter maps failures safely and parses compatible content", async () => {
  let delay = 0;
  let status = 200,
    payload: unknown = {
      choices: [
        {
          finish_reason: "stop",
          message: { content: "```latex\n\\frac{1}{2}\n```" },
        },
      ],
    };
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    assert.match(
      body.messages[1].content[1].image_url.url,
      /^data:image\/png;base64,/,
    );
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    response.writeHead(status, { "content-type": "application/json" });
    response.end(JSON.stringify(payload));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const config: ModelConfig = {
    endpoint: new URL(`http://127.0.0.1:${address.port}/v1/chat/completions`),
    apiKey: "test-placeholder",
    model: "test-vision",
    timeoutMs: 5000,
    allowPrivate: true,
    thinking: false,
  };
  const call = () =>
    recognize(
      config,
      "data:image/png;base64,example",
      "formula",
      "",
      new AbortController().signal,
    );
  try {
    assert.equal((await call()).content, "\\frac{1}{2}");
    for (const invalid of [null, [], "upstream-body-marker"]) {
      payload = invalid;
      await assert.rejects(
        call,
        (error) =>
          (error as { code: string }).code === "MODEL_INVALID_RESPONSE",
      );
    }
    payload = { choices: [{ message: { content: "$$ $$" } }] };
    await assert.rejects(
      call,
      (error) => (error as { code: string }).code === "MODEL_EMPTY",
    );
    status = 401;
    payload = { error: { message: "private-provider-body-marker" } };
    await assert.rejects(call, (error) => {
      assert.equal((error as { code: string }).code, "MODEL_AUTH");
      assert.doesNotMatch(String(error), /private-provider/);
      return true;
    });
    status = 429;
    payload = { error: { code: "1113" } };
    await assert.rejects(
      call,
      (error) => (error as { code: string }).code === "MODEL_QUOTA",
    );
    status = 200;
    payload = {
      choices: [{ finish_reason: "length", message: { content: "partial" } }],
    };
    await assert.rejects(
      call,
      (error) => (error as { code: string }).code === "MODEL_TRUNCATED",
    );
    delay = 200;
    const cancelled = new AbortController(),
      timer = setTimeout(() => cancelled.abort(), 30);
    await assert.rejects(
      () =>
        recognize(
          config,
          "data:image/png;base64,example",
          "formula",
          "",
          cancelled.signal,
        ),
      (error) => (error as { code: string }).code === "CANCELLED",
    );
    clearTimeout(timer);
    await assert.rejects(
      () =>
        recognize(
          { ...config, timeoutMs: 30 },
          "data:image/png;base64,example",
          "formula",
          "",
          new AbortController().signal,
        ),
      (error) => (error as { code: string }).code === "MODEL_TIMEOUT",
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
