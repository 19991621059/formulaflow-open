import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkMath from "remark-math";

export type RecognitionMode = "formula" | "document";
export const MAX_DOCUMENT_LENGTH = 100_000;
export const MAX_FORMULA_LENGTH = 20_000;
export function normalizeDocument(markdown: string) {
  let content = markdown.trim();
  // Only actual Markdown math nodes are normalized. Dollar signs and blank
  // lines in code blocks or inline code belong to the source and must survive.
  const formulas = documentFormulas(content)
    .filter((item) => content.slice(item.start, item.end).startsWith("$$"))
    .sort((left, right) => right.start - left.start);
  for (const item of formulas) {
    const before = content.slice(0, item.start),
      after = content.slice(item.end);
    const prefix =
      !before || before.endsWith("\n\n")
        ? ""
        : before.endsWith("\n")
          ? "\n"
          : "\n\n";
    const suffix =
      !after || after.startsWith("\n\n")
        ? ""
        : after.startsWith("\n")
          ? "\n"
          : "\n\n";
    content = `${before}${prefix}$$\n${item.latex.trim()}\n$$${suffix}${after}`;
  }
  return content;
}

const parser = unified().use(remarkParse).use(remarkMath);
export type DocumentFormula = {
  latex: string;
  start: number;
  end: number;
  display: boolean;
};
export function documentFormulas(markdown: string): DocumentFormula[] {
  const formulas: DocumentFormula[] = [];
  function walk(node: {
    type: string;
    value?: string;
    position?: { start: { offset?: number }; end: { offset?: number } };
    children?: (typeof node)[];
  }) {
    if (
      (node.type === "math" || node.type === "inlineMath") &&
      node.value &&
      node.position?.start.offset !== undefined &&
      node.position.end.offset !== undefined
    ) {
      formulas.push({
        latex: node.value,
        start: node.position.start.offset,
        end: node.position.end.offset,
        display: node.type === "math",
      });
    }
    node.children?.forEach(walk);
  }
  walk(parser.parse(markdown));
  return formulas;
}
