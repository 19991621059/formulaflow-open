import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isPrivateAddress,
  resolveAddresses,
  resolveConfig,
  serverSummary,
} from "../lib/server/config";
import { assertAccess } from "../lib/server/guard";
const fields = [
  "MODEL_API_BASE_URL",
  "MODEL_API_KEY",
  "MODEL_NAME",
  "MODEL_ALLOW_PRIVATE_HOSTS",
  "APP_ACCESS_TOKEN",
];
async function isolated(work: () => void | Promise<void>) {
  const saved = Object.fromEntries(
    fields.map((key) => [key, process.env[key]]),
  );
  fields.forEach((key) => delete process.env[key]);
  try {
    await work();
  } finally {
    fields.forEach((key) => {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    });
  }
}
test("private, loopback, mapped IPv4 and metadata addresses are rejected", () => {
  for (const address of [
    "127.0.0.1",
    "10.0.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "192.168.2.1",
    "::1",
    "::ffff:127.0.0.1",
    "::ffff:c0a8:1",
    "fc00::1",
    "fe80::1",
  ])
    assert.equal(isPrivateAddress(address), true, address);
  assert.equal(isPrivateAddress("8.8.8.8"), false);
  assert.equal(isPrivateAddress("2606:4700:4700::1111"), false);
});
test("invalid model settings are rejected rather than interpreted as defaults", async () =>
  isolated(() => {
    process.env.MODEL_API_BASE_URL = "https://configured.example/v1";
    process.env.MODEL_API_KEY = "unit-placeholder";
    process.env.MODEL_NAME = "vision-example";
    for (const input of [null, [], "invalid", 7, { baseURL: 7 }])
      assert.throws(
        () => resolveConfig(input),
        (error) => (error as { code: string }).code === "CONFIG_INVALID",
      );
    assert.throws(
      () =>
        resolveConfig({
          baseURL: "https://model.example/v1",
          apiKey: "foo\r\nbar",
          model: "vision",
        }),
      (error) => (error as { code: string }).code === "CONFIG_INVALID",
    );
  }));
test("server configuration summaries never disclose embedded URL credentials", async () =>
  isolated(() => {
    process.env.MODEL_NAME = "vision-example";
    process.env.MODEL_API_KEY = "unit-placeholder";
    for (const base of [
      "https://user:private-marker@model.example/v1",
      "https://model.example/v1?key=private-marker",
      "not-a-url",
    ]) {
      process.env.MODEL_API_BASE_URL = base;
      const summary = serverSummary();
      assert.equal(summary.configured, false);
      assert.equal(summary.baseURL, "");
      assert.doesNotMatch(JSON.stringify(summary), /private-marker/);
    }
    process.env.MODEL_API_BASE_URL = "https://model.example/v1";
    assert.equal(serverSummary().configured, true);
  }));
test("browser-selected endpoints never receive the server credential", async () =>
  isolated(() => {
    process.env.MODEL_API_BASE_URL = "https://configured.example/v1";
    process.env.MODEL_API_KEY = "unit-placeholder";
    process.env.MODEL_NAME = "vision-example";
    assert.throws(
      () =>
        resolveConfig({
          baseURL: "https://different.example/v1",
          model: "vision-example",
        }),
      /自定义接口/,
    );
    const selected = resolveConfig({
      baseURL: "https://different.example/v1",
      apiKey: "own-placeholder",
      model: "vision-example",
    });
    assert.equal(selected.apiKey, "own-placeholder");
    assert.equal(selected.endpoint.pathname, "/v1/chat/completions");
  }));
test("private endpoint connections require explicit server opt-in", async () =>
  isolated(async () => {
    const config = resolveConfig({
      baseURL: "https://127.0.0.1/v1",
      apiKey: "placeholder",
      model: "vision",
    });
    await assert.rejects(() => resolveAddresses(config), /私有/);
    process.env.MODEL_ALLOW_PRIVATE_HOSTS = "true";
    const local = resolveConfig({
      baseURL: "http://127.0.0.1:11434/v1",
      model: "vision",
    });
    assert.equal((await resolveAddresses(local))[0].address, "127.0.0.1");
    assert.equal(local.apiKey, "");
  }));
test("cross-origin requests and missing access tokens are rejected", async () =>
  isolated(() => {
    assert.throws(
      () =>
        assertAccess(
          new Request("http://localhost:3000/api/export", {
            headers: { origin: "https://unrelated.example" },
          }),
        ),
      /来源/,
    );
    process.env.APP_ACCESS_TOKEN = "test-access-placeholder";
    assert.throws(
      () => assertAccess(new Request("http://localhost:3000/api/export")),
      /访问口令/,
    );
    assert.doesNotThrow(() =>
      assertAccess(
        new Request("http://localhost:3000/api/export", {
          headers: { authorization: "Bearer test-access-placeholder" },
        }),
      ),
    );
  }));
test("standalone normalization preserves browser-facing Host and proxy protocol", async () =>
  isolated(() => {
    assert.doesNotThrow(() =>
      assertAccess(
        new Request("http://localhost:3476/api/process", {
          headers: { host: "127.0.0.1:3476", origin: "http://127.0.0.1:3476" },
        }),
      ),
    );
    assert.doesNotThrow(() =>
      assertAccess(
        new Request("http://localhost:3000/api/process", {
          headers: {
            host: "assistant.example",
            "x-forwarded-proto": "https",
            origin: "https://assistant.example",
          },
        }),
      ),
    );
    assert.throws(
      () =>
        assertAccess(
          new Request("http://localhost:3476/api/process", {
            headers: {
              host: "127.0.0.1:3476",
              origin: "https://unrelated.example",
            },
          }),
        ),
      /来源/,
    );
  }));
