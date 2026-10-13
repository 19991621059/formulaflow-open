import { test } from "node:test";
import assert from "node:assert/strict";
import { modelConfigured, settingsError } from "../lib/settings";
import type { Settings } from "../lib/types";

const defaults: Settings = {
  baseURL: "",
  apiKey: "",
  model: "",
  accessToken: "",
};
test("a partial temporary connection does not silently fall back to the saved model", () => {
  const saved = { configured: true, allowPrivate: false };
  assert.equal(modelConfigured(defaults, saved), true);
  assert.equal(
    modelConfigured({ ...defaults, apiKey: "own-placeholder" }, saved),
    false,
  );
  assert.match(
    settingsError({ ...defaults, apiKey: "own-placeholder" }, false)!,
    /地址/,
  );
  const custom = {
    ...defaults,
    baseURL: "https://model.example/v1",
    model: "vision",
    apiKey: "own-placeholder",
  };
  assert.equal(modelConfigured(custom, saved), true);
  assert.equal(modelConfigured({ ...custom, apiKey: "" }, saved), false);
});
test("temporary settings reject credential-bearing URLs and malformed headers before applying", () => {
  const custom = {
    ...defaults,
    baseURL: "https://model.example/v1",
    model: "vision",
    apiKey: "own-placeholder",
  };
  for (const baseURL of [
    "https://user:pass@model.example/v1",
    "https://model.example/v1?key=value",
    "ftp://model.example/v1",
  ])
    assert.match(settingsError({ ...custom, baseURL }, false)!, /接口地址/);
  assert.match(
    settingsError({ ...custom, apiKey: "foo\r\nbar" }, false)!,
    /换行/,
  );
  assert.equal(
    settingsError(
      { ...custom, baseURL: "http://127.0.0.1:11434/v1", apiKey: "" },
      true,
    ),
    null,
  );
});
