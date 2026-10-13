import { timingSafeEqual } from "node:crypto";
import { AppError } from "./errors";

export function assertAccess(request: Request) {
  const origin = request.headers.get("origin");
  const url = new URL(request.url);
  // Standalone Next.js can normalize request.url to localhost. Compare against
  // the actual browser-facing Host, preserving the protocol set by the proxy.
  const protocol =
    request.headers.get("x-forwarded-proto")?.split(",")[0].trim() ||
    url.protocol.slice(0, -1);
  const host = request.headers.get("host") || url.host;
  const expectedOrigin =
    process.env.APP_PUBLIC_ORIGIN || `${protocol}://${host}`;
  if (origin && origin !== expectedOrigin) {
    throw new AppError(
      "ORIGIN_REJECTED",
      "请求来源不匹配。",
      "请在助手所在的网址内操作。",
      403,
    );
  }
  const expected = process.env.APP_ACCESS_TOKEN?.trim();
  if (!expected) return;
  const supplied =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  const left = Buffer.from(expected),
    right = Buffer.from(supplied);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    throw new AppError(
      "ACCESS_REQUIRED",
      "需要访问口令。",
      "在模型设置中填写部署者提供的访问口令。",
      401,
    );
  }
}
export async function limitedBody(request: Request, maximum: number) {
  const reader = request.body?.getReader();
  if (!reader)
    throw new AppError(
      "EMPTY_BODY",
      "请求内容为空。",
      "请重新选择图片或输入内容。",
    );
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maximum) {
        await reader.cancel();
        throw new AppError(
          "BODY_TOO_LARGE",
          "请求超过大小限制。",
          "图片最大 8 MB；文档最多 100,000 个字符。",
          413,
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}
export function errorResponse(error: unknown) {
  const problem =
    error instanceof AppError
      ? error
      : new AppError(
          "INVALID_REQUEST",
          "请求内容无效。",
          "请检查填写内容后重试。",
        );
  return Response.json(
    { code: problem.code, message: problem.message, hint: problem.hint },
    { status: problem.status, headers: { "Cache-Control": "no-store" } },
  );
}
