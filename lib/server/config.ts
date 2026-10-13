import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { AppError } from "./errors";
import { withAbort } from "./abort";

export type ModelConfig = {
  endpoint: URL;
  apiKey: string;
  model: string;
  timeoutMs: number;
  thinking: boolean;
  allowPrivate: boolean;
};
type Input = { baseURL?: unknown; apiKey?: unknown; model?: unknown };
function field(value: unknown, limit: number) {
  if (value === undefined || value === "") return "";
  if (
    typeof value !== "string" ||
    value.length > limit ||
    /[\r\n\0]/.test(value)
  )
    throw new AppError(
      "CONFIG_INVALID",
      "模型设置格式无效。",
      "请检查接口地址、密钥和模型名称。",
    );
  return value.trim();
}
export function serverSummary() {
  const baseURL = process.env.MODEL_API_BASE_URL?.trim() || "";
  let safeBaseURL = "";
  try {
    const url = new URL(baseURL);
    if (
      ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    )
      safeBaseURL = baseURL;
  } catch {
    /* An invalid or credential-bearing URL must not reach the browser. */
  }
  let configured = false;
  try {
    resolveConfig();
    configured = true;
  } catch {
    /* Settings can be fixed in the dialog. */
  }
  return {
    configured,
    model: process.env.MODEL_NAME?.trim() || "",
    baseURL: safeBaseURL,
    allowPrivate: process.env.MODEL_ALLOW_PRIVATE_HOSTS === "true",
  };
}
export function resolveConfig(value: unknown = {}): ModelConfig {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new AppError(
      "CONFIG_INVALID",
      "模型配置格式无效。",
      "请重新填写模型设置。",
    );
  const input = value as Input;
  const base = field(input.baseURL, 2048),
    key = field(input.apiKey, 4096),
    model = field(input.model, 200);
  const savedBase = process.env.MODEL_API_BASE_URL?.trim() || "";
  const savedModel = process.env.MODEL_NAME?.trim() || "";
  const usingCustom = !!(base || key || model);
  // Never forward a saved credential to an address selected by a browser request.
  if (usingCustom && !key && process.env.MODEL_ALLOW_PRIVATE_HOSTS !== "true") {
    throw new AppError(
      "CONFIG_KEY_REQUIRED",
      "自定义接口需要填写自己的密钥。",
      "填写 API Key，或选择默认模型配置。",
    );
  }
  const baseURL = usingCustom ? base : savedBase;
  const selectedModel = usingCustom ? model : savedModel;
  const apiKey = usingCustom ? key : process.env.MODEL_API_KEY?.trim() || "";
  const allowPrivate = process.env.MODEL_ALLOW_PRIVATE_HOSTS === "true";
  if (/[\u0000-\u001f\u007f]/.test(apiKey))
    throw new AppError(
      "CONFIG_INVALID",
      "API Key 包含无效字符。",
      "请重新复制完整密钥，去掉中间的换行。",
    );
  if (!baseURL || !selectedModel || (!apiKey && !allowPrivate)) {
    throw new AppError(
      "CONFIG_MISSING",
      "还没有可用的模型连接。",
      "打开模型设置，填写支持图片的接口地址、API Key 和模型名称。",
      503,
    );
  }
  let endpoint: URL;
  try {
    endpoint = new URL(baseURL);
  } catch {
    throw new AppError(
      "CONFIG_URL_INVALID",
      "接口地址无效。",
      "请输入完整的 http:// 或 https:// 地址。",
    );
  }
  if (
    !["https:", "http:"].includes(endpoint.protocol) ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash
  ) {
    throw new AppError(
      "CONFIG_URL_INVALID",
      "接口地址包含不支持的内容。",
      "使用不含用户名、密码、查询参数或片段的 HTTP(S) 地址。",
    );
  }
  if (endpoint.protocol !== "https:" && !allowPrivate)
    throw new AppError(
      "CONFIG_HTTPS_REQUIRED",
      "远程接口需要 HTTPS。",
      "使用 HTTPS；本地模型需由部署者显式允许私有地址。",
    );
  endpoint.pathname = endpoint.pathname.replace(/\/+$/, "");
  if (!endpoint.pathname.endsWith("/chat/completions"))
    endpoint.pathname += "/chat/completions";
  const configuredTimeout = Number(process.env.MODEL_TIMEOUT_MS || 120000);
  return {
    endpoint,
    apiKey,
    model: selectedModel,
    allowPrivate,
    timeoutMs: Number.isFinite(configuredTimeout)
      ? Math.max(5000, Math.min(300000, configuredTimeout))
      : 120000,
    thinking:
      process.env.MODEL_THINKING === "on" ||
      (process.env.MODEL_THINKING !== "off" &&
        endpoint.hostname === "open.bigmodel.cn"),
  };
}
export function isPrivateAddress(address: string) {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113)
    );
  }
  // Global unicast only. This also rejects mapped IPv4, loopback and link-local IPv6.
  if (isIP(address) === 6)
    return !/^[23]/i.test(address) || /^2001:db8:/i.test(address);
  return true;
}
export async function resolveAddresses(
  config: ModelConfig,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const hostname = config.endpoint.hostname.replace(/^\[|\]$/g, "");
  let addresses;
  try {
    if (isIP(hostname))
      addresses = [{ address: hostname, family: isIP(hostname) }];
    else {
      const task = lookup(hostname, { all: true });
      addresses = signal ? await withAbort(task, signal) : await task;
    }
  } catch {
    if (signal?.aborted) throw signal.reason;
    throw new AppError(
      "MODEL_DNS_FAILED",
      "无法找到模型接口地址。",
      "检查接口地址拼写和服务器的 DNS 网络连接。",
      502,
    );
  }
  if (
    !addresses.length ||
    (!config.allowPrivate &&
      addresses.some((item) => isPrivateAddress(item.address)))
  ) {
    throw new AppError(
      "PRIVATE_HOST_BLOCKED",
      "接口指向私有或保留网络地址。",
      "本地模型请在服务端设置 MODEL_ALLOW_PRIVATE_HOSTS=true。",
      403,
    );
  }
  return addresses;
}
