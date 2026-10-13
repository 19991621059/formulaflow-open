import { resolveConfig } from "@/lib/server/config";
import { checkContent } from "@/lib/server/content";
import { AppError, publicError } from "@/lib/server/errors";
import { assertAccess, errorResponse, limitedBody } from "@/lib/server/guard";
import { prepareImage, recognize } from "@/lib/server/model";
import type { Mode, ProcessEvent } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
let active = 0;

export async function POST(request: Request) {
  try {
    assertAccess(request);
    if (active >= 3)
      throw new AppError(
        "SERVER_BUSY",
        "助手正在处理其他请求。",
        "等待当前任务结束后重试。",
        503,
      );
    const bytes = await limitedBody(request, 9 * 1024 * 1024);
    const form = await new Response(bytes, {
      headers: { "Content-Type": request.headers.get("content-type") || "" },
    }).formData();
    const file = form.get("image"),
      rawMode = form.get("mode");
    if (!(file instanceof File))
      throw new AppError(
        "IMAGE_MISSING",
        "还没有选择图片。",
        "上传、粘贴图片或使用示例。",
      );
    if (rawMode !== "document" && rawMode !== "formula")
      throw new AppError(
        "MODE_INVALID",
        "识别模式无效。",
        "选择文档或单个公式模式。",
      );
    const mode: Mode = rawMode;
    const rawSettings = form.get("settings");
    if (
      rawSettings !== null &&
      (typeof rawSettings !== "string" || rawSettings.length > 8000)
    )
      throw new AppError("CONFIG_INVALID", "配置内容过长。", "检查模型设置。");
    const config = resolveConfig(
      rawSettings ? JSON.parse(rawSettings as string) : {},
    );
    const action = form.get("action") || "recognize";
    if (action !== "recognize" && action !== "review")
      throw new AppError(
        "ACTION_INVALID",
        "处理操作无效。",
        "重新开始识别或复核。",
      );
    const rawDraft = form.get("draft");
    const draft =
      action === "review" && typeof rawDraft === "string" ? rawDraft : "";
    if (
      action === "review" &&
      (!draft.trim() || draft.length > (mode === "document" ? 100000 : 20000))
    )
      throw new AppError(
        "DRAFT_INVALID",
        "复核内容为空或过长。",
        "先识别或填写符合长度限制的稿件。",
      );
    active++;
    const start = Date.now(),
      abort = new AbortController(),
      encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let open = true;
        const emit = (event: ProcessEvent) => {
          if (!open || abort.signal.aborted) return;
          try {
            controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
          } catch {
            open = false;
            abort.abort();
          }
        };
        const stage = (
          name: "validate" | "prepare" | "recognize" | "check",
          message: string,
        ) =>
          emit({
            type: "stage",
            stage: name,
            message,
            elapsedMs: Date.now() - start,
          });
        let heartbeat: ReturnType<typeof setInterval> | undefined;
        try {
          stage("validate", "检查图片格式、大小与解码结果");
          const image = await prepareImage(file);
          stage("prepare", "已去除图片元数据，准备发送到你选择的接口");
          stage(
            "recognize",
            action === "review"
              ? "模型正在对照原图复核稿件"
              : "模型正在识别图片中的文字与公式",
          );
          heartbeat = setInterval(
            () => stage("recognize", "模型仍在处理，可继续等待或取消"),
            8000,
          );
          const result = await recognize(
            config,
            image,
            mode,
            draft,
            AbortSignal.any([request.signal, abort.signal]),
          );
          clearInterval(heartbeat);
          stage("check", "检查结果长度与公式语法");
          const checked = checkContent(result.content, mode);
          emit({
            type: "result",
            ...result,
            mode,
            issues: checked.issues,
            elapsedMs: Date.now() - start,
          });
        } catch (error) {
          const problem = publicError(error);
          emit({
            type: "error",
            code: problem.code,
            message: problem.message,
            hint: problem.hint,
            elapsedMs: Date.now() - start,
          });
        } finally {
          clearInterval(heartbeat);
          active--;
          if (open)
            try {
              controller.close();
            } catch {
              /* The client may have cancelled. */
            }
        }
      },
      cancel() {
        abort.abort();
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
