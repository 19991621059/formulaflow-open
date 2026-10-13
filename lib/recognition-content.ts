import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkMath from "remark-math";

export type RecognitionMode = "formula" | "document";
export const MAX_DOCUMENT_LENGTH = 100_000;
export const MAX_FORMULA_LENGTH = 20_000;
export const MIN_RECOGNITION_CONFIDENCE = 0.5;

export function normalizeConfidence(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
    ? value
    : null;
}

/** A conservative failure gate, not a claim that accepted OCR is correct. */
export function assertRecognitionQuality(
  content: string,
  confidence: number | null,
  mode: RecognitionMode,
) {
  if (confidence !== null && confidence < MIN_RECOGNITION_CONFIDENCE)
    throw new Error("RECOGNITION_LOW_CONFIDENCE");
  const lines = content
    .split(/\n|\\\\/)
    .map((line) =>
      line
        .replace(/\\(?:text|mathrm|mathbf)\{([^{}]*)\}/g, "$1")
        .replace(/[{}&\s]/g, ""),
    )
    .filter(Boolean);
  const counts = new Map<string, number>();
  // Repeated mathematical rows (e.g. a matrix of ones) are legitimate. Limit this
  // heuristic to repeated prose/punctuation fragments, as in degenerate OCR output.
  for (const line of lines)
    if (/^[\p{P}\u3400-\u9fff]+$/u.test(line))
      counts.set(line, (counts.get(line) || 0) + 1);
  if (
    lines.length >= 12 &&
    [...counts.values()].some(
      (count) => count >= 8 && count / lines.length > 0.35,
    )
  )
    throw new Error("RECOGNITION_LOW_CONFIDENCE");
  // A page of prose can be valid TeX; it is still the wrong result for a formula request.
  if (
    mode === "formula" &&
    (content.match(/[\u3400-\u9fff]/g)?.length || 0) > 100
  )
    throw new Error("RECOGNITION_DOCUMENT_REQUIRED");
}

export function normalizeDocument(markdown: string) {
  return markdown
    .trim()
    .replace(
      /(?<!\\)\$\$([\s\S]*?)(?<!\\)\$\$/g,
      (_, formula: string) => `\n\n$$\n${formula.trim()}\n$$\n\n`,
    )
    .replace(/\n{3,}/g, "\n\n");
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

export function validateDocument(markdown: string) {
  if (!markdown.trim() || markdown.length > MAX_DOCUMENT_LENGTH)
    throw new Error("RECOGNITION_INVALID_RESULT");
  const formulas = documentFormulas(markdown);
  if (
    formulas.length > 200 ||
    formulas.some((item) => item.latex.length > MAX_FORMULA_LENGTH)
  )
    throw new Error("RECOGNITION_INVALID_RESULT");
  return formulas;
}
