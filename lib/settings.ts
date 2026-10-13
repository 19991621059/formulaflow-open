import type { Settings } from "./types";

export function hasCustomModel(settings: Settings) {
  return !!(
    settings.baseURL.trim() ||
    settings.model.trim() ||
    settings.apiKey.trim()
  );
}

/** Validate a temporary connection without calling or charging the provider. */
export function settingsError(
  settings: Settings,
  allowPrivate: boolean,
): string | null {
  if (!hasCustomModel(settings)) return null;
  if (!settings.baseURL.trim()) return "请填写接口地址。";
  if (!settings.model.trim()) return "请填写支持图片输入的模型名称。";
  if (!settings.apiKey.trim() && !allowPrivate)
    return "请填写这个接口的 API Key。";
  if (
    settings.baseURL.length > 2048 ||
    settings.model.length > 200 ||
    settings.apiKey.length > 4096
  )
    return "模型配置内容过长，请检查填写的地址、模型名称和密钥。";
  if (/[\u0000-\u001f\u007f]/.test(settings.apiKey.trim()))
    return "API Key 中不能包含换行或控制字符。";
  try {
    const url = new URL(settings.baseURL.trim());
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      return "请填写不含用户名、密码或查询参数的 HTTP(S) 接口地址。";
    if (url.protocol !== "https:" && !allowPrivate)
      return "远程接口请使用 HTTPS。本地模型的连接方法见配置说明。";
  } catch {
    return "请填写完整的 http:// 或 https:// 接口地址。";
  }
  return null;
}

export function modelConfigured(
  settings: Settings,
  server: { configured: boolean; allowPrivate: boolean },
) {
  return hasCustomModel(settings)
    ? settingsError(settings, server.allowPrivate) === null
    : server.configured;
}
