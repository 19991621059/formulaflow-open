import { mathjax } from "mathjax-full/js/mathjax.js";
import { TeX } from "mathjax-full/js/input/tex.js";
import { SVG } from "mathjax-full/js/output/svg.js";
import { liteAdaptor } from "mathjax-full/js/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "mathjax-full/js/handlers/html.js";
import { AllPackages } from "mathjax-full/js/input/tex/AllPackages.js";
import { STATE } from "mathjax-full/js/core/MathItem.js";
import { SerializedMmlVisitor } from "mathjax-full/js/core/MmlTree/SerializedMmlVisitor.js";

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
// Arbitrary HTML, links and dynamic package loading are not formula features.
const packages = AllPackages.filter(
  (name) =>
    ![
      "html",
      "require",
      "autoload",
      "newcommand",
      "configmacros",
      "noerrors",
      "noundefined",
    ].includes(name),
);
const input = new TeX({ packages, maxBuffer: 20000, maxMacros: 1000 });
const document = mathjax.document("", {
  InputJax: input,
  OutputJax: new SVG({ fontCache: "none" }),
});
const visitor = new SerializedMmlVisitor();

export function latexToMathml(latex: string, display = true): string {
  if (!latex.trim() || latex.length > 20000)
    throw new Error(
      "请输入 1 至 20,000 个字符的 LaTeX。 / Enter 1–20,000 LaTeX characters.",
    );
  input.reset();
  const root = document.convert(latex, { display, end: STATE.COMPILED });
  const serialized = visitor.visitTree(root);
  const mathml = display
    ? serialized
    : serialized.replace(/^<math(?=\s)/, '<math display="inline"');
  if (mathml.includes("<merror"))
    throw new Error("公式语法有误，请检查 LaTeX。 / Check the LaTeX syntax.");
  return mathml;
}

export function renderFormula(
  latex: string,
  display = true,
): { svg: string; mathml: string } {
  const mathml = latexToMathml(latex, display);
  input.reset();
  const markup = adaptor.outerHTML(document.convert(latex, { display }));
  const start = markup.indexOf("<svg");
  const end = markup.lastIndexOf("</svg>");
  if (start < 0 || end < 0)
    throw new Error("无法生成公式图像。 / Unable to render formula.");
  return {
    svg: markup.slice(start, end + 6).replace(/currentColor/g, "#07111f"),
    mathml,
  };
}
