import type { Mode } from "../types";
import { AppError } from "./errors";
import { limitedBody } from "./guard";

export async function contentInput(request: Request) {
  let input: {
    content?: unknown;
    mode?: unknown;
    format?: unknown;
    filename?: unknown;
  };
  try {
    input = JSON.parse((await limitedBody(request, 800000)).toString("utf8"));
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("JSON_INVALID", "内容格式无效。", "请重新提交。");
  }
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    typeof input.content !== "string" ||
    (input.mode !== "document" && input.mode !== "formula")
  )
    throw new AppError(
      "CONTENT_INVALID",
      "请提供有效的内容和识别模式。",
      "选择模式并填写内容。",
    );
  return {
    content: input.content,
    mode: input.mode as Mode,
    format: input.format,
    filename: input.filename,
  };
}
