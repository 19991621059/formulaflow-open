import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import type { Root, Element, RootContent } from "hast";
import {
  MAX_DOCUMENT_LENGTH,
  MAX_FORMULA_LENGTH,
  type RecognitionMode,
} from "./recognition-content";

export const documentSchema: typeof defaultSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [["className", "language-math", "math-inline", "math-display"]],
  },
};
const inlineParser = unified()
  .use(remarkParse)
  .use(remarkMath)
  .use(remarkRehype);

/** OCR HTML tables may contain math in nested text, which remark does not parse. */
export function rehypeTableMath() {
  return (tree: Root) => {
    function walk(parent: Root | Element, inCell = false) {
      parent.children = parent.children.flatMap((node): RootContent[] => {
        if (node.type === "element") {
          if (!["code", "pre", "script", "style"].includes(node.tagName))
            walk(node, inCell || ["td", "th"].includes(node.tagName));
        } else if (inCell && node.type === "text" && node.value.includes("$")) {
          const parsed = inlineParser.runSync(
            inlineParser.parse(node.value),
          ) as Root;
          // Preserve literal text/whitespace unless a math node was actually found.
          if (findMath(parsed).length)
            return parsed.children.flatMap((child) =>
              child.type === "element" && child.tagName === "p"
                ? child.children
                : [child],
            );
        }
        return [node];
      }) as typeof parent.children;
    }
    walk(tree);
  };
}

export function nodeText(node: Root | RootContent): string {
  return node.type === "text"
    ? node.value
    : "children" in node
      ? node.children.map(nodeText).join("")
      : "";
}
export function mathNode(
  node: Root | RootContent,
): { latex: string; display: boolean } | null {
  if (node.type !== "element" || node.tagName !== "code") return null;
  const classes = node.properties.className;
  if (
    !Array.isArray(classes) ||
    !classes.some((name) => name === "math-inline" || name === "math-display")
  )
    return null;
  return {
    latex: nodeText(node).trim(),
    display: classes.includes("math-display"),
  };
}
export function findMath(
  tree: Root | RootContent,
): { latex: string; display: boolean }[] {
  const math = mathNode(tree);
  return math
    ? [math]
    : "children" in tree
      ? tree.children.flatMap(findMath)
      : [];
}
const parser = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMath)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeRaw)
  .use(rehypeTableMath)
  .use(rehypeSanitize, documentSchema);

export function exportMarkdown(
  content: string,
  mode: RecognitionMode,
  display = true,
): string {
  return mode === "document"
    ? content
    : display
      ? `$$\n${content.trim()}\n$$\n`
      : `$${content.trim()}$\n`;
}
export function exportTree(
  content: string,
  mode: RecognitionMode,
  display = true,
): Root {
  if (
    !content.trim() ||
    content.length >
      (mode === "document" ? MAX_DOCUMENT_LENGTH : MAX_FORMULA_LENGTH)
  )
    throw new Error("EXPORT_INVALID_CONTENT");
  // Formula source must not pass through Markdown parsing: literal $ and HTML-like
  // text inside TeX would otherwise be reinterpreted or dropped before export.
  if (mode === "formula") {
    const math: Element = {
      type: "element",
      tagName: "code",
      properties: {
        className: ["language-math", display ? "math-display" : "math-inline"],
      },
      children: [{ type: "text", value: content }],
    };
    return {
      type: "root",
      children: [
        {
          type: "element",
          tagName: display ? "pre" : "p",
          properties: {},
          children: [math],
        },
      ],
    };
  }
  const tree = parser.runSync(
    parser.parse(exportMarkdown(content, mode, display)),
  ) as Root;
  const formulas = findMath(tree);
  if (
    formulas.length > 200 ||
    formulas.some(
      (item) => !item.latex || item.latex.length > MAX_FORMULA_LENGTH,
    )
  )
    throw new Error("EXPORT_INVALID_CONTENT");
  return tree;
}
