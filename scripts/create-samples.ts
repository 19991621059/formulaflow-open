import sharp from "sharp";
import { writeFile } from "node:fs/promises";
import { renderFormula } from "../lib/formula";

const root = new URL("../public/examples/", import.meta.url);
const equation = async (latex: string, width: number) =>
  sharp(Buffer.from(renderFormula(latex).svg))
    .resize({ width })
    .png()
    .toBuffer();
const page = `<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="1250"><rect width="1100" height="1250" fill="white"/><g fill="#15243d" font-family="sans-serif"><text x="90" y="120" font-size="48" font-weight="600">微积分课堂笔记</text><text x="90" y="200" font-size="32">定积分表示曲线与横轴之间的有向面积。</text><text x="90" y="320" font-size="36" font-weight="600">例：计算定积分</text><text x="90" y="560" font-size="32">因此，函数在区间 [0, 1] 上的平均值为 1/3。</text><text x="90" y="680" font-size="36" font-weight="600">常用导数</text><text x="135" y="785" font-size="32">函数</text><text x="630" y="785" font-size="32">导数</text><text x="90" y="1130" font-size="28" fill="#59708f">FormulaFlow Open 公开演示素材</text></g><g stroke="#cbd5e3" stroke-width="2" fill="none"><path d="M90 725H1010V1035H90Z M90 825H1010 M90 930H1010 M550 725V1035"/></g></svg>`;
await sharp(Buffer.from(page))
  .composite([
    {
      input: await equation("\\int_0^1 x^2\\,dx=\\frac{1}{3}", 450),
      left: 250,
      top: 350,
    },
    { input: await equation("x^2", 70), left: 135, top: 850 },
    { input: await equation("2x", 85), left: 630, top: 850 },
    { input: await equation("\\sin x", 130), left: 135, top: 960 },
    { input: await equation("\\cos x", 130), left: 630, top: 960 },
  ])
  .png()
  .toFile(new URL("document.png", root).pathname);
const formula = "\\int_{-\\infty}^{+\\infty} e^{-x^2}\\,dx = \\sqrt{\\pi}";
const math = await equation(formula, 980);
await sharp({
  create: { width: 1200, height: 480, channels: 4, background: "#ffffff" },
})
  .composite([{ input: math, left: 100, top: 95 }])
  .png()
  .toFile(new URL("formula.png", root).pathname);
await writeFile(new URL("formula.tex", root), formula + "\n");
await writeFile(
  new URL("document.md", root),
  "# 微积分课堂笔记\n\n定积分表示曲线与横轴之间的有向面积。\n\n## 例：计算定积分\n\n$$\n\\int_0^1 x^2\\,dx=\\frac{1}{3}\n$$\n\n因此，函数在区间 [0, 1] 上的平均值为 1/3。\n\n## 常用导数\n\n| 函数 | 导数 |\n| --- | --- |\n| $x^2$ | $2x$ |\n| $\\sin x$ | $\\cos x$ |\n\nFormulaFlow Open 公开演示素材\n",
);
console.log("Generated original public examples; no private source documents.");
