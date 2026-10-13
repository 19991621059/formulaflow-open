import type { Element, Root, RootContent } from "hast";
import { toHtml } from "hast-util-to-html";
import { exportTree, findMath, mathNode } from "../export-content";
import { latexToMathml, renderFormula } from "../formula";
import type { Issue, Mode } from "../types";
import { AppError } from "./errors";

export function checkContent(content: string, mode: Mode) {
  const issues: Issue[] = [];
  if (content.includes("[[UNREADABLE]]"))
    issues.push({
      level: "warning",
      message: "有内容无法辨认，请对照原图补全 [[UNREADABLE]] 标记。",
    });
  if (
    mode === "document" &&
    (content.replace(/\\\$/g, "").match(/\$/g)?.length || 0) % 2
  )
    issues.push({
      level: "warning",
      message: "数学分隔符 $ 数量为奇数，请检查是否遗漏或需要转义。",
    });
  let tree: Root;
  try {
    tree = exportTree(content, mode);
  } catch {
    throw new AppError(
      "CONTENT_INVALID",
      "内容为空或超过限制。",
      "公式最多 20,000 字符，文档最多 100,000 字符、200 个公式。",
    );
  }
  const formulas = findMath(tree);
  formulas.forEach((formula, index) => {
    try {
      latexToMathml(formula.latex, formula.display);
    } catch {
      issues.push({
        level: "error",
        message: `第 ${index + 1} 个公式的 LaTeX 无法解析，请修正后导出 Word。`,
      });
    }
  });
  return { tree, issues, formulaCount: formulas.length };
}
export function previewContent(content: string, mode: Mode) {
  const checked = checkContent(content, mode);
  // Sanitize via exportTree, remove remote images and render equations locally.
  function render(node: Root | RootContent): string {
    const math = mathNode(node);
    if (math) {
      try {
        return `<span class="${math.display ? "math-block" : "math-inline"}">${renderFormula(math.latex, math.display).svg}</span>`;
      } catch {
        return `<span class="invalid-math">${toHtml({ type: "text", value: math.latex })}</span>`;
      }
    }
    if (node.type === "root") return node.children.map(render).join("");
    if (node.type !== "element") return toHtml(node);
    if (node.tagName === "img")
      return toHtml({ type: "text", value: String(node.properties.alt || "") });
    const safe: Element = {
      ...node,
      properties: { ...node.properties },
      children: [],
    };
    if (safe.tagName === "a") {
      safe.properties.target = "_blank";
      safe.properties.rel = ["noopener", "noreferrer"];
    }
    const placeholder = toHtml(safe);
    const closing = placeholder.lastIndexOf("</");
    return closing < 0
      ? placeholder
      : placeholder.slice(0, closing) +
          node.children.map(render).join("") +
          placeholder.slice(closing);
  }
  return {
    html: render(checked.tree),
    issues: checked.issues,
    formulaCount: checked.formulaCount,
  };
}
