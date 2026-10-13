# 部署

本项目是带服务端接口的 Next.js 应用，不能部署成 GitHub Pages 静态网站。支持普通 Node.js 服务器和 Docker，不需要云数据库。

## 本机或 Node.js 服务器

```bash
npm ci
cp .env.example .env.local
# 编辑自己的模型配置
npm run build
npm start
```

默认监听 `127.0.0.1:3000`。可通过 `PORT=4000 npm start` 修改端口。需要直接监听其他网卡时使用：

```bash
APP_HOST=0.0.0.0 APP_ACCESS_TOKEN=自行设置足够长的随机口令 npm start
```

对外部署建议将口令放入受保护的环境配置，使用 HTTPS 反向代理。此口令保护处理、预览、导出及模型配置 API；不是多人身份系统。

## Docker

```bash
cp .env.example .env.local
# 编辑模型配置
docker compose up --build -d
docker compose logs --tail=50
```

Compose 默认仅向主机 `127.0.0.1:3000` 开放端口。容器以普通用户运行，环境文件在启动时注入，`.dockerignore` 阻止环境文件进入镜像构建上下文。

连接运行在主机上的 Ollama：Docker Desktop 通常可使用 `http://host.docker.internal:11434/v1`；Linux 需要给服务添加 `extra_hosts: ["host.docker.internal:host-gateway"]`，并确认模型服务监听容器可达的地址。启用 `MODEL_ALLOW_PRIVATE_HOSTS=true`。这不代表助手会自动安装或启动模型。

## 反向代理

图片请求体最大约 9 MB，模型超时可到 300 秒；代理的请求体和超时设置需相应放宽。识别接口使用 NDJSON 推送阶段，请关闭这个路径的响应缓冲：

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 10m;
    proxy_read_timeout 310s;
    proxy_buffering off;
}
```

使用可信代理并保留原始 Host 和协议信息。API 会检查浏览器请求的 Origin，不允许其他站点代发处理请求。

## 构建产物

`output: "standalone"` 用于 Docker 最终镜像。需要手动搬运构建产物时，一起复制 `.next/standalone/`、`.next/static/` 到其中的 `.next/static/`，以及 `public/` 到其中的 `public/`；通过运行环境注入配置，再执行 `node server.js`。保留许可证文件和独立的 mathml2omml npm 模块。

参考 [Next.js standalone 官方说明](https://nextjs.org/docs/app/api-reference/config/next-config-js/output)。

## 上线检查

打开页面，确认配置状态；用公开示例识别、手工修改并导出 Word，检查文字、表格和公式。再检查访问口令、超时和代理阶段更新。没有填写密钥时，模型识别应明确报配置错误，不能返回假结果。
