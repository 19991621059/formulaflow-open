# 贡献指南

欢迎修复兼容接口问题、改进识别稿的检查体验和增加复杂公式导出覆盖。

```bash
npm ci
npm run dev
npm run typecheck
npm test
npm run build
npm run test:e2e
npm run check:secrets
```

`components/` 是工作台与临时设置；`app/api/` 提供配置、处理、预览和导出；`lib/server/model.ts` 处理兼容模型、图片清理及失败映射；`lib/formula.ts`、`lib/export-content.ts`、`lib/server/export-docx.ts` 处理安全内容与原生公式导出。

请保持阶段消息与真实处理对应，避免虚构百分比。模型复核必须保留用户的决定权；导出使用当前稿件，不能暗中恢复原识别内容。

提交复现时使用自制公开图片，不附私人文档、密钥、真实错误正文或 `.env.local`。新增模型示例需标明是否用真实视觉模型验收；测试接口返回固定结果的检查不能写成真实识别成功。

项目保留 Source Han Sans CN 的 OFL 许可证。应用源码采用 MIT，依赖保留各自许可证。改变依赖后更新锁文件和第三方说明。
