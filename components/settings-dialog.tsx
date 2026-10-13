"use client";

import { useEffect, useRef, useState } from "react";
import { X, LockKeyhole, Server, ExternalLink } from "lucide-react";
import type { Settings } from "@/lib/types";

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
  useEffect(() => {
    if (open) {
      setDraft(settings);
      dialog.current?.showModal();
    } else dialog.current?.close();
  }, [open, settings]);
  const update = (name: keyof Settings, value: string) =>
    setDraft((previous) => ({ ...previous, [name]: value }));
  return (
    <dialog
      ref={dialog}
      className="settings-dialog"
      onCancel={onClose}
      aria-labelledby="settings-title"
    >
      <div className="dialog-heading">
        <div>
          <span className="small-label">由你选择连接</span>
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
        使用支持图片输入的 Chat Completions 兼容接口。图片和复核稿会发送到这里。
      </p>
      <div className="presets" aria-label="配置模板">
        <button
          type="button"
          onClick={() =>
            setDraft((previous) => ({
              ...previous,
              baseURL: "https://open.bigmodel.cn/api/paas/v4",
              model: "glm-5.3-flash",
              apiKey: "",
            }))
          }
        >
          智谱模板
        </button>
        <button
          type="button"
          onClick={() =>
            setDraft((previous) => ({
              ...previous,
              baseURL: "",
              model: "",
              apiKey: "",
            }))
          }
        >
          自定义接口
        </button>
        <button
          type="button"
          onClick={() =>
            setDraft((previous) => ({
              ...previous,
              baseURL: "http://127.0.0.1:11434/v1",
              model: "qwen3-vl:8b",
              apiKey: "",
            }))
          }
        >
          本地模型
        </button>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSave(draft);
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
            本地模型需在服务端启用 MODEL_ALLOW_PRIVATE_HOSTS，并重启助手。
          </p>
        )}
        <p className="privacy-note">
          <LockKeyhole size={16} />
          密钥不会写入浏览器存储。刷新页面后，临时配置、图片和稿件会清空。
        </p>
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
            使用服务端配置
          </button>
          <button className="button primary" type="submit">
            应用临时配置
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
