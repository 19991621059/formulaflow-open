import type { Metadata } from "next";
import "./globals.css";
import { BRAND_NAME } from "@/lib/brand";

export const metadata: Metadata = {
  title: `${BRAND_NAME} · 文档与公式处理助手`,
  description: "使用自己的模型接口，将图片中的文字、表格和公式变为可编辑内容。",
};
export default function Layout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
