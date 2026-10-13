import { BRAND_NAME } from "../brand";
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  convertToXmlComponent,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
  type IRunOptions,
  type ParagraphChild,
} from "docx";
import { mml2omml } from "mathml2omml";
import { xml2js, js2xml, type Element as XmlElement } from "xml-js";
import type { Element, RootContent } from "hast";
import { exportTree, mathNode } from "../export-content";
import { latexToMathml } from "../formula";
import type { RecognitionMode } from "../recognition-content";

const naryScripts = new Set([
  "msub",
  "msup",
  "msubsup",
  "munder",
  "mover",
  "munderover",
]);
function xmlText(node: XmlElement): string {
  return node.type === "text"
    ? String(node.text ?? "")
    : (node.elements ?? []).map(xmlText).join("");
}
function isNary(node: XmlElement) {
  const base = node.elements?.find((child) => child.type === "element");
  return (
    naryScripts.has(node.name ?? "") &&
    node.attributes?.accent !== "true" &&
    node.attributes?.accentunder !== "true" &&
    base &&
    /^[\u220f-\u2211\u2229-\u2233\u22c0-\u22c3]$/.test(xmlText(base).trim())
  );
}
function isMathSpace(node: XmlElement): boolean {
  return (
    node.name === "mspace" ||
    (node.type === "text" && !xmlText(node).trim()) ||
    (["mstyle", "mrow"].includes(node.name ?? "") &&
      !!node.elements?.length &&
      node.elements.every(isMathSpace))
  );
}
function groupNaryOperands(node: XmlElement) {
  const children = node.elements;
  if (!children) return;
  // mathml2omml only attaches a following token or mrow to the operator base.
  // MathJax emits fractions, powers and roots directly, leaving Office's m:e
  // empty. Wrap that existing operand without changing its content or order.
  for (let index = children.length - 2; index >= 0; index--) {
    if (!isNary(children[index])) continue;
    let operand = index + 1;
    while (operand < children.length && isMathSpace(children[operand]))
      operand++;
    const next = children[operand];
    if (!next || next.name === "mo") continue;
    let end = operand + 1;
    // A nested sum/integral and its already-grouped operand form one unit.
    if (isNary(next)) {
      let nested = end;
      while (nested < children.length && isMathSpace(children[nested]))
        nested++;
      if (children[nested]?.name === "mrow") end = nested + 1;
    }
    const group: XmlElement = {
      type: "element",
      name: "mrow",
      elements: children.slice(index + 1, end),
    };
    children.splice(index + 1, end - index - 1, group);
  }
}

// OMML remains native Office math; no equation images or altChunk HTML imports.
function equation(latex: string, display = true): ParagraphChild {
  const tree = xml2js(latexToMathml(latex, display), {
    compact: false,
  }) as XmlElement;
  const supported = new Set([
    "math",
    "menclose",
    "mfrac",
    "mi",
    "mmultiscripts",
    "mn",
    "mo",
    "mover",
    "mroot",
    "mrow",
    "ms",
    "mspace",
    "msqrt",
    "mstyle",
    "msub",
    "msubsup",
    "msup",
    "mtable",
    "mtd",
    "mtext",
    "mtr",
    "munder",
    "munderover",
    "semantics",
  ]);
  function normalize(node: XmlElement) {
    if (node.name === "mlabeledtr") {
      // MathJax puts the equation number first. Office matrices require rows,
      // and the number belongs to the right of the equation.
      node.name = "mtr";
      const cells = (node.elements || []).filter(
        (child) => child.type === "element",
      );
      node.elements = [...cells.slice(1), ...cells.slice(0, 1)];
    }
    if (node.type === "element" && !supported.has(node.name || ""))
      throw new Error("EXPORT_UNSUPPORTED_FORMULA");
    node.elements?.forEach(normalize);
    groupNaryOperands(node);
  }
  normalize(tree);
  // The converter writes text without XML escaping. Keep the entities emitted
  // by js2xml intact until xml2js parses the OMML, including literal < and &.
  const omml = mml2omml(js2xml(tree), { disableDecode: true });
  if (!omml.includes("<m:oMath") || !omml.includes("<m:t"))
    throw new Error("EXPORT_INVALID_FORMULA");
  // Import the element itself; importing the XML document adds an invalid wrapper.
  const root = (xml2js(omml, { compact: false }) as XmlElement).elements?.[0];
  if (!root) throw new Error("EXPORT_INVALID_FORMULA");
  return convertToXmlComponent(root) as unknown as ParagraphChild;
}
function inline(
  nodes: RootContent[],
  style: IRunOptions = {},
): ParagraphChild[] {
  return nodes.flatMap((node): ParagraphChild[] => {
    if (node.type === "text")
      return [new TextRun({ ...style, text: node.value.replace(/\s+/g, " ") })];
    if (node.type !== "element") return [];
    const math = mathNode(node);
    if (math) return [equation(math.latex, math.display)];
    if (node.tagName === "br") return [new TextRun({ break: 1 })];
    if (node.tagName === "img")
      return [
        new TextRun({ ...style, text: String(node.properties.alt || "") }),
      ];
    return inline(node.children, {
      ...style,
      ...(["strong", "b", "th"].includes(node.tagName) ? { bold: true } : {}),
      ...(["em", "i"].includes(node.tagName) ? { italics: true } : {}),
      ...(node.tagName === "del" ? { strike: true } : {}),
      ...(node.tagName === "code" ? { font: "Consolas" } : {}),
    });
  });
}
const border = { style: BorderStyle.SINGLE, size: 4, color: "D9D9D9" };
function span(value: unknown) {
  const n = Number(value);
  return Number.isInteger(n) && n > 1 && n <= 100 ? n : undefined;
}
function table(node: Element): Table {
  function rows(parent: Element): Element[] {
    return parent.children.flatMap((child) =>
      child.type !== "element"
        ? []
        : child.tagName === "tr"
          ? [child]
          : ["thead", "tbody", "tfoot"].includes(child.tagName)
            ? rows(child)
            : [],
    );
  }
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: border,
      bottom: border,
      left: border,
      right: border,
      insideHorizontal: border,
      insideVertical: border,
    },
    rows: rows(node).map((row) => {
      const cells = row.children.filter(
        (child): child is Element =>
          child.type === "element" && ["th", "td"].includes(child.tagName),
      );
      return new TableRow({
        tableHeader:
          cells.length > 0 && cells.every((cell) => cell.tagName === "th"),
        children: cells.map(
          (cell) =>
            new TableCell({
              columnSpan: span(cell.properties.colSpan),
              rowSpan: span(cell.properties.rowSpan),
              verticalAlign: VerticalAlign.CENTER,
              margins: { top: 90, bottom: 90, left: 110, right: 110 },
              shading: cell.tagName === "th" ? { fill: "F1F3F5" } : undefined,
              children: blocks(
                cell.children,
                cell.tagName === "th" ? { bold: true } : {},
              ),
            }),
        ),
      });
    }),
  });
}
const blockTags = new Set([
  "p",
  "div",
  "section",
  "article",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "pre",
  "table",
  "ul",
  "ol",
  "blockquote",
  "hr",
]);
function blocks(
  nodes: RootContent[],
  style: IRunOptions = {},
): (Paragraph | Table)[] {
  const output: (Paragraph | Table)[] = [];
  let pending: RootContent[] = [];
  function flush() {
    if (pending.some((node) => node.type !== "text" || node.value.trim()))
      output.push(new Paragraph({ children: inline(pending, style) }));
    pending = [];
  }
  for (const node of nodes) {
    if (node.type !== "element" || !blockTags.has(node.tagName)) {
      pending.push(node);
      continue;
    }
    flush();
    if (node.tagName === "table") {
      output.push(table(node));
      continue;
    }
    if (["div", "section", "article", "blockquote"].includes(node.tagName)) {
      output.push(...blocks(node.children, style));
      continue;
    }
    if (node.tagName === "ul" || node.tagName === "ol") {
      let index = Number(node.properties.start) || 1;
      for (const child of node.children)
        if (child.type === "element" && child.tagName === "li") {
          const parts = blocks(child.children, style);
          // Keep each item as separate paragraphs, including nested blocks/tables.
          const first = parts[0];
          if (first instanceof Paragraph)
            first.addRunToFront(
              new TextRun({
                text: node.tagName === "ol" ? `${index++}. ` : "• ",
              }),
            );
          output.push(...parts);
        }
      continue;
    }
    if (node.tagName === "hr") {
      output.push(new Paragraph({ text: "", border: { bottom: border } }));
      continue;
    }
    const math =
      node.tagName === "pre" && node.children.length === 1
        ? mathNode(node.children[0])
        : null;
    if (node.tagName === "pre" && !math) {
      const text = node.children
        .map((child) =>
          child.type === "element"
            ? child.children
                .map((n) => (n.type === "text" ? n.value : ""))
                .join("")
            : child.type === "text"
              ? child.value
              : "",
        )
        .join("");
      output.push(
        new Paragraph({
          children: text
            .replace(/\n$/, "")
            .split("\n")
            .map(
              (line, index) =>
                new TextRun({
                  text: line,
                  break: index ? 1 : 0,
                  font: "Consolas",
                  size: 20,
                }),
            ),
        }),
      );
    } else {
      const headings = [
        HeadingLevel.HEADING_1,
        HeadingLevel.HEADING_2,
        HeadingLevel.HEADING_3,
        HeadingLevel.HEADING_4,
        HeadingLevel.HEADING_5,
        HeadingLevel.HEADING_6,
      ];
      output.push(
        new Paragraph({
          children: inline(node.children, style),
          alignment: math ? AlignmentType.CENTER : undefined,
          heading: /^h[1-6]$/.test(node.tagName)
            ? headings[Number(node.tagName[1]) - 1]
            : undefined,
        }),
      );
    }
  }
  flush();
  // Word requires at least one paragraph in every cell, and one after nested tables.
  if (!output.length || output.at(-1) instanceof Table)
    output.push(new Paragraph(""));
  return output;
}

export async function createDocx(
  content: string,
  mode: RecognitionMode,
  display = true,
): Promise<Uint8Array> {
  const tree = exportTree(content, mode, display);
  const document = new Document({
    creator: BRAND_NAME,
    styles: {
      default: {
        document: {
          run: {
            font: { ascii: "Calibri", hAnsi: "Calibri", eastAsia: "宋体" },
            size: 22,
            color: "000000",
          },
          paragraph: { spacing: { after: 160, line: 300 } },
        },
        heading1: { run: { color: "000000", bold: true, size: 32 } },
        heading2: { run: { color: "000000", bold: true, size: 28 } },
        heading3: { run: { color: "000000", bold: true, size: 25 } },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 },
          },
        },
        children: blocks(tree.children),
      },
    ],
  });
  return new Uint8Array(await Packer.toBuffer(document));
}
