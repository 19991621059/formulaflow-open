"use client";

import { useEffect, useRef, useState } from "react";
import { X, LockKeyhole, Server, ExternalLink } from "lucide-react";
import type { Settings } from "@/lib/types";
import { settingsError } from "@/lib/settings";

type Props = {
  open: boolean;
  settings: Settings;
  server: {
    configured: boolean;
    model: string;
    baseURL: string;
    allowPrivate: boolean;
    locked?: boolean;
  };
  onClose(): void;
  onSave(settings: Settings): void;
};
export function SettingsDialog({
  open,
  settings,
  server,
  onClose,
  onSave,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(settings);
  const [error, setError] = useState("");
  useEffect(() => {
    if (open) {
      setDraft(settings);
      setError("");
      dialog.current?.showModal();
    } else dialog.current?.close();
  }, [open, settings]);
  const update = (name: keyof Settings, value: string) => {
    setError("");
    setDraft((previous) => ({ ...previous, [name]: value }));
  };
  const preset = (baseURL: string, model: string) => {
    setError("");
    setDraft((previous) => ({ ...previous, baseURL, model, apiKey: "" }));
  };
  return (
    <dialog
      ref={dialog}
      className="settings-dialog"
      onCancel={onClose}
      aria-labelledby="settings-title"
    >
      <div className="dialog-heading">
        <div>
          <h2 id="settings-title">模型设置</h2>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="关闭设置"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      <p className="muted">
        选择支持图片输入的模型。识别和复核时，图片与稿件会发送到所填接口。
      </p>
      <div className="presets" aria-label="配置模板">
        <button
          type="button"
          onClick={() =>
            preset("https://open.bigmodel.cn/api/paas/v4", "glm-5.3-flash")
          }
        >
          智谱模板
        </button>
        <button type="button" onClick={() => preset("", "")}>
          自定义接口
        </button>
        <button
          type="button"
          onClick={() => preset("http://127.0.0.1:11434/v1", "qwen3-vl:8b")}
        >
          本地模型
        </button>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const problem = settingsError(draft, server.allowPrivate);
          if (problem) {
            setError(problem);
            return;
          }
          onSave({
            baseURL: draft.baseURL.trim(),
            model: draft.model.trim(),
            apiKey: draft.apiKey.trim(),
            accessToken: draft.accessToken.trim(),
          });
          onClose();
        }}
      >
        <label>
          接口地址
          <input
            type="url"
            placeholder={server.baseURL || "https://your-api.example/v1"}
            value={draft.baseURL}
            onChange={(event) => update("baseURL", event.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <p className="field-hint">
          填写 API 根路径；也支持完整的 /chat/completions 地址。
        </p>
        <label>
          模型名称
          <input
            placeholder={server.model || "供应商提供的视觉模型名称"}
            value={draft.model}
            onChange={(event) => update("model", event.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <label>
          API Key
          <input
            type="password"
            placeholder="只在这次页面会话中使用"
            value={draft.apiKey}
            onChange={(event) => update("apiKey", event.target.value)}
            autoComplete="off"
          />
        </label>
        <label>
          访问口令 <span className="muted">（部署者设置时填写）</span>
          <input
            type="password"
            value={draft.accessToken}
            onChange={(event) => update("accessToken", event.target.value)}
            autoComplete="off"
            placeholder={
              server.locked ? "此部署需要访问口令" : "本机默认无需填写"
            }
          />
        </label>
        {draft.baseURL.startsWith("http:") && !server.allowPrivate && (
          <p className="notice warning">
            <Server size={16} />
            此部署尚未允许本地模型。请按配置说明启用后重启。
          </p>
        )}
        <p className="privacy-note">
          <LockKeyhole size={16} />
          密钥不会写入浏览器存储。刷新页面后，临时配置、图片和稿件会清空。
        </p>
        {error && (
          <p className="notice warning" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button
            type="button"
            className="button secondary"
            onClick={() => {
              onSave({
                baseURL: "",
                model: "",
                apiKey: "",
                accessToken: draft.accessToken,
              });
              onClose();
            }}
          >
            {server.configured ? "使用默认模型" : "清空模型设置"}
          </button>
          <button className="button primary" type="submit">
            应用设置
          </button>
        </div>
      </form>
      <a
        className="help-link"
        href="https://github.com/19991621059/formulaflow-open/blob/main/docs/configuration.md"
        target="_blank"
        rel="noreferrer"
      >
        查看配置说明 <ExternalLink size={14} />
      </a>
    </dialog>
  );
}
