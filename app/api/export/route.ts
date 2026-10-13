import { exportMarkdown } from "@/lib/export-content";
import { latexToMathml } from "@/lib/formula";
import { checkContent } from "@/lib/server/content";
import { createDocx } from "@/lib/server/export-docx";
import { AppError } from "@/lib/server/errors";
import { assertAccess, errorResponse } from "@/lib/server/guard";
import { contentInput } from "@/lib/server/input";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    assertAccess(request);
    const input = await contentInput(request);
    const checked = checkContent(input.content, input.mode);
    const format = input.format;
    if (
      typeof format !== "string" ||
      !["docx", "md", "tex", "mathml", "json"].includes(format) ||
      (input.mode === "document" && ["tex", "mathml"].includes(format))
    )
      throw new AppError(
        "EXPORT_FORMAT",
        "当前内容不支持这个导出格式。",
        "文档可导出 Word、Markdown 和 JSON；单个公式还可导出 LaTeX、MathML。",
      );
    if (
      (format === "docx" || format === "mathml") &&
      checked.issues.some((issue) => issue.level === "error")
    )
      throw new AppError(
        "EXPORT_SYNTAX",
        "公式语法有误，暂时无法导出。",
        "修正提示中的公式后重试，也可先保存 Markdown 或 LaTeX 源码。",
        422,
      );
    let bytes: Uint8Array, mime: string;
    if (format === "docx") {
      try {
        bytes = await createDocx(input.content, input.mode);
      } catch {
        throw new AppError(
          "EXPORT_FORMULA_UNSUPPORTED",
          "其中一个公式暂时无法转换为 Word 公式。",
          "简化该公式，或导出 Markdown / LaTeX 保留源码。",
          422,
        );
      }
      mime =
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    } else {
      const text =
        format === "md"
          ? exportMarkdown(input.content, input.mode)
          : format === "mathml"
            ? latexToMathml(input.content)
            : format === "json"
              ? JSON.stringify(
                  { version: 1, mode: input.mode, content: input.content },
                  null,
                  2,
                ) + "\n"
              : input.content + "\n";
      bytes = new TextEncoder().encode(text);
      mime =
        format === "json"
          ? "application/json"
          : format === "mathml"
            ? "application/mathml+xml"
            : "text/plain; charset=utf-8";
    }
    const filename =
      Array.from(
        (typeof input.filename === "string" ? input.filename : "formulaflow")
          .replace(/\.[^.]+$/, "")
          .replace(/[^\p{L}\p{N}_ -]/gu, "_"),
      )
        .slice(0, 80)
        .join("") || "formulaflow";
    return new Response(new Uint8Array(bytes).buffer, {
      headers: {
        "Content-Type": mime,
        "Content-Disposition": `attachment; filename="formulaflow.${format}"; filename*=UTF-8''${encodeURIComponent(filename)}.${format}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
