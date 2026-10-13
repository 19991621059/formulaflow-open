import { cpSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";

const root = new URL("../", import.meta.url),
  runtime = new URL(".next/standalone/", root);
if (!existsSync(new URL("server.js", runtime))) {
  console.error("请先运行 npm run build。");
  process.exit(1);
}
if (existsSync(new URL(".env.local", root)))
  process.loadEnvFile(new URL(".env.local", root));
cpSync(new URL(".next/static/", root), new URL(".next/static/", runtime), {
  recursive: true,
});
cpSync(new URL("public/", root), new URL("public/", runtime), {
  recursive: true,
});
const child = spawn(
  process.execPath,
  [new URL("server.js", runtime).pathname],
  {
    cwd: runtime,
    env: {
      ...process.env,
      HOSTNAME: process.env.APP_HOST || "127.0.0.1",
      PORT: process.env.PORT || "3000",
    },
    stdio: "inherit",
  },
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code || 0));
