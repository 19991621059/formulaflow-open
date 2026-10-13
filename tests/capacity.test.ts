import { test } from "node:test";
import assert from "node:assert/strict";
import { createCapacity } from "../lib/server/capacity";
import { withAbort } from "../lib/server/abort";

test("capacity is reserved before async work and every release is idempotent", () => {
  const reserve = createCapacity(3);
  const first = reserve(),
    second = reserve(),
    third = reserve();
  assert.throws(
    reserve,
    (error) => (error as { code: string }).code === "SERVER_BUSY",
  );
  first();
  first();
  const replacement = reserve();
  assert.throws(
    reserve,
    (error) => (error as { code: string }).code === "SERVER_BUSY",
  );
  second();
  third();
  replacement();
  const next = [reserve(), reserve(), reserve()];
  next.forEach((release) => release());
});
test("cancellation stops awaiting unfinished address work without waiting for it to finish", async () => {
  const abort = new AbortController();
  const pending = withAbort(new Promise<never>(() => {}), abort.signal);
  const reason = new Error("cancelled by caller");
  abort.abort(reason);
  await assert.rejects(pending, (error) => error === reason);
  await assert.rejects(
    withAbort(Promise.reject(new Error("late lookup failure")), abort.signal),
    (error) => error === reason,
  );
});
