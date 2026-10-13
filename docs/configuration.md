# 模型配置

助手调用兼容 Chat Completions 的接口：`POST {baseURL}/chat/completions`，通过 `Authorization: Bearer` 传递你提供的密钥，消息中使用 `image_url` 的 PNG data URI。返回结果需要包含 `choices[0].message.content`。

配置分两种：

- 服务端 `.env.local` / 部署环境变量：适合自己常用的模型，密钥不会返回到页面。
- 页面内临时配置：右上角打开「模型设置」，填写地址、模型和 API Key。只保留在当前页面内存，通过助手服务器转发；刷新后清空。它优先于服务端配置。

临时选择其他地址时必须提供自己的密钥，服务端保存的密钥不会借给临时接口。

## 智谱示例

```dotenv
MODEL_API_BASE_URL=https://open.bigmodel.cn/api/paas/v4
MODEL_API_KEY=填入自己的密钥
MODEL_NAME=glm-5.3-flash
MODEL_THINKING=auto
```

使用通用模型 API 根地址，视觉模型名称和权限以自己的账户为准。`auto` 仅对这个官方域名传入 `thinking: {type: "enabled"}`；其他接口默认不传。可以用 `off` 关闭额外参数。参考 [智谱官方 API 指引](https://docs.bigmodel.cn/cn/api/introduction)。

## 自定义兼容接口

```dotenv
MODEL_API_BASE_URL=https://your-provider.example/v1
MODEL_API_KEY=填入自己的密钥
MODEL_NAME=供应商提供的视觉模型名称
MODEL_THINKING=off
```

也接受以 `/chat/completions` 结尾的完整地址。远程接口要求 HTTPS，地址不能包含用户名、密码或查询参数。不会跟随重定向；这样可避免把密钥转发到另一主机。

## 本地 Ollama / vLLM

先安装并启动自己选择的视觉模型，确认模型服务能从助手服务器访问。

```dotenv
MODEL_API_BASE_URL=http://127.0.0.1:11434/v1
MODEL_API_KEY=
MODEL_NAME=qwen3-vl:8b
MODEL_ALLOW_PRIVATE_HOSTS=true
MODEL_THINKING=off
```

`qwen3-vl:8b` 是模板名称，请替换成实际已安装且支持图片输入的模型。Ollama 兼容接口的地址和图片输入格式见 [官方说明](https://docs.ollama.com/api/openai-compatibility)。本版本没有在真实本地模型上验收，不把兼容接口测试当作本地模型性能验证。

私有网络访问默认禁用；只在自己的可信部署中显式启用。允许后，能通过访问口令的用户也能提交可达的私有接口地址。Docker 内的主机地址见部署文档。

## 其他设置

| 变量                        | 默认值 | 用途                                                                |
| --------------------------- | ------ | ------------------------------------------------------------------- |
| `MODEL_TIMEOUT_MS`          | 120000 | 单次模型网络请求超时，支持 5000–300000 毫秒                         |
| `MODEL_THINKING`            | auto   | auto / on / off                                                     |
| `MODEL_ALLOW_PRIVATE_HOSTS` | false  | 是否允许本地 / 私有网络模型接口                                     |
| `APP_ACCESS_TOKEN`          | 空     | 保护模型、预览和导出 API；页面「访问口令」与此值一致                |
| `APP_PUBLIC_ORIGIN`         | 空     | 代理场景下明确指定浏览器访问的 Origin，如 https://assistant.example |

环境配置修改后需要重启应用。不要把 `.env.local` 提交到 Git，也不要使用 `NEXT_PUBLIC_` 变量存放密钥。示例文件只提供字段，不含可用密钥。

## 失败提示

| 提示             | 下一步                                 |
| ---------------- | -------------------------------------- |
| 没有模型连接     | 填写配置或检查部署环境变量             |
| 模型接口拒绝密钥 | 检查密钥和该模型的权限                 |
| 余额或额度不足   | 检查供应商账户额度；智谱 1113 单独映射 |
| 不接受图片请求   | 核对 API 路径、模型名和 image_url 支持 |
| 请求频繁         | 等待后重试，检查供应商限流             |
| 模型超时         | 裁剪图片，或调整超时设置               |
| 输出截断         | 分割图片，避免导出不完整稿件           |
| 公式语法有误     | 修改源码；也可先导出 Markdown / LaTeX  |

助手不展示供应商原始错误正文，避免回显密钥、私人提示词或内部内容。失败后可重试，没有自动换供应商或偷偷重发的逻辑。

如果本机 VPN / 代理使用 fake-IP DNS，把公网域名解析成 `198.18.x.x` 等保留地址，默认地址检查也会拦截。可在可信的本机实例中显式启用 `MODEL_ALLOW_PRIVATE_HOSTS=true`；对外提供服务时应谨慎配置，并使用访问口令。
