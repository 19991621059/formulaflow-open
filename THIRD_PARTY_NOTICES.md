# 第三方说明

本项目的应用源码采用 MIT。依赖包和字体保留各自许可证，不以本项目的 MIT 替代。

识别内容解析、公式渲染与 Word 导出的部分核心代码来自作者维护的 FormulaFlow，已为本项目提取、调整并以 MIT 发布。未包含账户、支付、私有后台、历史对话或业务数据。

| 组件                                          | 许可证            | 用途                                       |
| --------------------------------------------- | ----------------- | ------------------------------------------ |
| Next.js / React / React DOM                   | MIT               | 应用框架                                   |
| docx                                          | MIT               | Word 文档生成                              |
| MathJax (mathjax-full)                        | Apache-2.0        | 公式解析与渲染                             |
| mathml2omml                                   | LGPL-3.0-or-later | MathML 转 Office 原生公式                  |
| unified / remark / rehype / hast-util-to-html | MIT               | Markdown 与安全内容解析                    |
| sharp                                         | Apache-2.0        | 图片解码与元数据清理；底层组件有各自许可证 |
| xml-js                                        | MIT               | XML 转换                                   |
| lucide-react                                  | ISC               | 界面图标                                   |
| Adobe Source Han Sans CN                      | SIL OFL-1.1       | 界面字体                                   |

关键组件许可证保存在 `licenses/`；字体许可证与字体一起保存在 `public/fonts/SourceHanSans-LICENSE.txt`。完整依赖树及版本见 `package-lock.json`，依赖包中的许可证应随分发保留。

`mathml2omml` 在服务端作为独立 npm 包使用，并在 Next.js 构建中保持外部模块；没有修改它的源码。上游源码与许可证见 [fiduswriter/mathml2omml](https://github.com/fiduswriter/mathml2omml)。安装后可以替换该模块并重新构建。

公开示例图片、演示稿和文档截图由本项目制作，适用本项目的 MIT 许可证。真实截图中的模型结果以这些公开示例为输入，没有私人文件或账号密钥。
