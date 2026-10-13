"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  ArrowUpFromLine,
  Check,
  CheckCheck,
  ChevronRight,
  ClipboardPaste,
  Download,
  FileImage,
  FileText,
  CodeXml,
  ImagePlus,
  LoaderCircle,
  LockKeyhole,
  PencilLine,
  RotateCcw,
  ScanLine,
  Settings2,
  Sigma,
  Sparkles,
  X,
  AlertCircle,
  Eye,
} from "lucide-react";
import { SettingsDialog } from "./settings-dialog";
import { useProcessor } from "./use-processor";
import type { Issue, Mode, Settings } from "@/lib/types";
import { BRAND_NAME } from "@/lib/brand";
import { hasCustomModel, modelConfigured } from "@/lib/settings";

const steps = [
  { id: "validate", label: "上传检查" },
  { id: "prepare", label: "图片准备" },
  { id: "recognize", label: "模型识别" },
  { id: "check", label: "结果校验" },
];
const emptySettings: Settings = {
  baseURL: "",
  apiKey: "",
  model: "",
  accessToken: "",
};
type Server = {
  configured: boolean;
  model: string;
  baseURL: string;
  allowPrivate: boolean;
  locked?: boolean;
};
type Preview = { html: string; issues: Issue[]; formulaCount: number };
function headers(settings: Settings) {
  return {
    "Content-Type": "application/json",
    ...(settings.accessToken
      ? { authorization: `Bearer ${settings.accessToken}` }
      : {}),
  };
}

export function Workspace() {
  const [file, setFile] = useState<File | null>(null),
    [imageURL, setImageURL] = useState("");
  const [mode, setMode] = useState<Mode>("document"),
    [content, setContent] = useState(""),
    [original, setOriginal] = useState("");
  const [settings, setSettings] = useState<Settings>(emptySettings),
    [settingsOpen, setSettingsOpen] = useState(false);
  const [server, setServer] = useState<Server>({
    configured: false,
    model: "",
    baseURL: "",
    allowPrivate: false,
  });
  const [tab, setTab] = useState<"edit" | "preview">("preview"),
    [preview, setPreview] = useState<Preview>({
      html: "",
      issues: [],
      formulaCount: 0,
    });
  const [previewBusy, setPreviewBusy] = useState(false),
    [previewError, setPreviewError] = useState("");
  const [proposal, setProposal] = useState<string | null>(null),
    [proposalOpen, setProposalOpen] = useState(false);
  const [feedback, setFeedback] = useState(""),
    [exporting, setExporting] = useState(false),
    [format, setFormat] = useState("docx");
  const [dragging, setDragging] = useState(false),
    [modelUsed, setModelUsed] = useState("");
  const [imageOpen, setImageOpen] = useState(false);
  const [loadingExample, setLoadingExample] = useState(false);
  const exampleRequest = useRef(0);
  const interactionLocked = useRef(false);
  const imageDialog = useRef<HTMLDialogElement>(null);
  const fileInput = useRef<HTMLInputElement>(null),
    proposalDialog = useRef<HTMLDialogElement>(null);
  const { state, run, cancel, reset, finishMessage } = useProcessor();
  const busy = state.status === "running",
    configured = modelConfigured(settings, server);
  const hasCustom = hasCustomModel(settings);
  const locked = busy || exporting || loadingExample;
  interactionLocked.current = busy || exporting;

  useEffect(() => {
    const abort = new AbortController();
    fetch("/api/config", {
      headers: settings.accessToken
        ? { authorization: `Bearer ${settings.accessToken}` }
        : {},
      signal: abort.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        const data = await response.json();
        if (abort.signal.aborted) return;
        if (response.ok) setServer(data);
        else
          setServer({
            configured: false,
            model: "",
            baseURL: "",
            allowPrivate: false,
            locked: response.status === 401,
          });
      })
      .catch(() => {
        if (!abort.signal.aborted)
          setServer({
            configured: false,
            model: "",
            baseURL: "",
            allowPrivate: false,
          });
      });
    return () => abort.abort();
  }, [settings.accessToken]);
  useEffect(() => {
    if (!file) {
      setImageURL("");
      return;
    }
    const url = URL.createObjectURL(file);
    setImageURL(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => {
    if (!content.trim()) {
      setPreview({ html: "", issues: [], formulaCount: 0 });
      setPreviewError("");
      setPreviewBusy(false);
      return;
    }
    const abort = new AbortController();
    setPreviewBusy(true);
    const timer = setTimeout(() => {
      fetch("/api/preview", {
        method: "POST",
        headers: headers(settings),
        body: JSON.stringify({ content, mode }),
        signal: abort.signal,
      })
        .then(async (response) => {
          const data = await response.json();
          if (abort.signal.aborted) return;
          if (!response.ok) throw new Error(data.message);
          setPreview(data);
          setPreviewError("");
        })
        .catch((error) => {
          if (!abort.signal.aborted)
            setPreviewError(error.message || "预览暂不可用");
        })
        .finally(() => {
          if (!abort.signal.aborted) setPreviewBusy(false);
        });
    }, 450);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [content, mode, settings]);
  useEffect(() => {
    if (imageOpen) imageDialog.current?.showModal();
    else imageDialog.current?.close();
  }, [imageOpen]);
  useEffect(() => {
    if (proposalOpen) proposalDialog.current?.showModal();
    else proposalDialog.current?.close();
  }, [proposalOpen]);
  useEffect(() => {
    if (mode === "document" && ["tex", "mathml"].includes(format))
      setFormat("docx");
  }, [mode, format]);

  function chooseFile(next: File) {
    if (interactionLocked.current) return false;
    if (!["image/png", "image/jpeg", "image/webp"].includes(next.type)) {
      setFeedback("仅支持 PNG、JPG 和 WebP 图片。PDF 请先导出为图片。");
      return false;
    }
    if (!next.size || next.size > 8 * 1024 * 1024) {
      setFeedback("请选择大于 0 且不超过 8 MB 的图片。");
      return false;
    }
    if (
      content &&
      !window.confirm("更换图片会清空当前稿件。请先导出需要保留的内容。")
    )
      return false;
    exampleRequest.current++;
    setLoadingExample(false);
    reset();
    setFile(next);
    setContent("");
    setOriginal("");
    setProposal(null);
    setProposalOpen(false);
    setImageOpen(false);
    setFeedback("");
    setModelUsed("");
    return true;
  }
  function changeFile(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files?.[0]) chooseFile(event.target.files[0]);
    event.target.value = "";
  }
  async function loadExample(kind: Mode) {
    if (interactionLocked.current || loadingExample) return;
    const id = ++exampleRequest.current;
    setLoadingExample(true);
    try {
      const response = await fetch(`/examples/${kind}.png`);
      if (!response.ok) throw new Error("Sample missing");
      const blob = await response.blob();
      if (id !== exampleRequest.current || interactionLocked.current) return;
      if (
        chooseFile(
          new File(
            [blob],
            kind === "document" ? "微积分笔记.png" : "高斯积分.png",
            { type: "image/png" },
          ),
        )
      )
        setMode(kind);
    } catch {
      if (id === exampleRequest.current)
        setFeedback("示例图片暂时无法加载，请上传自己的图片。");
    } finally {
      if (id === exampleRequest.current) setLoadingExample(false);
    }
  }
  function process(action: "recognize" | "review") {
    if (!file || locked) return;
    if (!configured || server.locked) {
      setSettingsOpen(true);
      setFeedback("请先完成模型设置和访问口令。");
      return;
    }
    if (
      action === "recognize" &&
      content &&
      !window.confirm("重新识别会替换当前稿件。请先导出需要保留的内容。")
    )
      return;
    setFeedback("");
    setProposal(null);
    interactionLocked.current = true;
    void run(file, mode, settings, action, content, (event) => {
      setModelUsed(event.model);
      if (action === "review") setProposal(event.content);
      else {
        setContent(event.content);
        setOriginal(event.content);
        setTab("preview");
      }
    });
  }
  async function download() {
    if (!content.trim() || locked) return;
    interactionLocked.current = true;
    setExporting(true);
    setFeedback("");
    try {
      const response = await fetch("/api/export", {
        method: "POST",
        headers: headers(settings),
        body: JSON.stringify({
          content,
          mode,
          format,
          filename: file?.name || "formulaflow",
        }),
      });
      if (!response.ok) {
        const problem = await response.json();
        throw new Error(`${problem.message} ${problem.hint || ""}`);
      }
      const blob = await response.blob(),
        url = URL.createObjectURL(blob),
        anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${(file?.name || "formulaflow").replace(/\.[^.]+$/, "")}.${format}`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      setFeedback(
        `${format === "docx" ? "Word" : format === "md" ? "Markdown" : format} 文件已生成。请在下载目录中打开检查。`,
      );
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : "导出失败，请重试。",
      );
    } finally {
      setExporting(false);
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(content);
      setFeedback("源码已复制。");
    } catch {
      setFeedback("复制失败，请在编辑区选中内容后手动复制。");
    }
  }
  const currentStep =
    state.status === "done"
      ? steps.length
      : steps.findIndex((step) => step.id === state.stage);
  return (
    <div
      className="app-shell"
      onPaste={(event) => {
        const pasted = Array.from(event.clipboardData.items)
          .find((item) => item.type.startsWith("image/"))
          ?.getAsFile();
        if (
          pasted &&
          event.target instanceof HTMLElement &&
          !["INPUT", "TEXTAREA"].includes(event.target.tagName)
        ) {
          event.preventDefault();
          chooseFile(pasted);
        }
      }}
    >
      <header className="site-header">
        <a
          className="brand"
          href="#workspace"
          aria-label={`${BRAND_NAME} 工作台`}
        >
          <span className="brand-icon">
            <Sigma size={24} strokeWidth={2.2} />
          </span>
          <span>{BRAND_NAME}</span>
        </a>
        <nav aria-label="主导航">
          <a className="nav-selected" href="#workspace">
            处理工作台
          </a>
          <a
            href="https://github.com/19991621059/formulaflow-open#readme"
            target="_blank"
            rel="noreferrer"
          >
            使用指南
          </a>
        </nav>
        <button
          className="config-button"
          onClick={() => setSettingsOpen(true)}
          disabled={locked}
        >
          <span className={`status-dot ${configured ? "ready" : ""}`} />
          <span>
            {server.locked
              ? "需要访问口令"
              : hasCustom
                ? configured
                  ? "模型已配置"
                  : "完成模型设置"
                : server.configured
                  ? "模型已配置"
                  : "模型设置"}
          </span>
          <Settings2 size={17} />
        </button>
      </header>
      <main>
        <div className="intro">
          <div>
            <h1>识别图片，编辑文字与公式。</h1>
            <p>上传图片，核对识别结果，再导出 Word 或 Markdown。</p>
          </div>
          <div className="intro-symbol" aria-hidden="true">
            ∫<span>原图 → 稿件</span>
          </div>
        </div>
        <section
          className={`process-bar ${state.status === "error" ? "has-error" : ""}`}
          aria-label="处理进度"
        >
          <ol>
            {steps.map((step, index) => (
              <li
                key={step.id}
                className={
                  currentStep > index
                    ? "complete"
                    : currentStep === index && busy
                      ? "active"
                      : ""
                }
              >
                <span className="step-dot">
                  {currentStep > index ? (
                    <Check size={14} />
                  ) : currentStep === index && busy ? (
                    <LoaderCircle size={14} className="spin" />
                  ) : (
                    index + 1
                  )}
                </span>
                {step.label}
                {index < steps.length - 1 && (
                  <ChevronRight className="step-arrow" size={16} />
                )}
              </li>
            ))}
          </ol>
          <div className="process-text" role="status" aria-live="polite">
            <span>
              {state.status === "error"
                ? state.action === "review"
                  ? "复核未完成"
                  : "识别未完成"
                : state.message}
            </span>
            {state.elapsedMs > 0 && (
              <span className="elapsed">
                {Math.round(state.elapsedMs / 1000)} 秒
              </span>
            )}
            {busy && (
              <button className="text-button" onClick={cancel}>
                取消
              </button>
            )}
          </div>
        </section>
        {state.status === "error" && (
          <div className="error-banner" role="alert">
            <AlertCircle size={20} />
            <div>
              <strong>{state.message}</strong>
              <p>{state.hint}</p>
              <details>
                <summary>错误详情</summary>
                <code>{state.code}</code>
              </details>
            </div>
            <button
              className="button secondary"
              onClick={() => process(state.action || "recognize")}
            >
              {state.action === "review" ? "重试复核" : "重新识别"}
            </button>
          </div>
        )}
        {state.status === "cancelled" && <p className="notice">{state.hint}</p>}
        <div className="workspace-grid" id="workspace">
          <section className="source-panel" aria-labelledby="source-title">
            <div className="panel-header">
              <h2 id="source-title">
                <FileImage size={19} />
                原始图片
              </h2>
              <span className="panel-note">对照原图检查</span>
            </div>
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={changeFile}
              aria-label="上传图片"
              className="hidden-input"
              disabled={locked}
            />
            <div
              className={`image-stage ${dragging ? "dragging" : ""} ${file ? "has-image" : ""}`}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                if (event.dataTransfer.files[0])
                  chooseFile(event.dataTransfer.files[0]);
              }}
            >
              {file ? (
                <div className="source-image-wrap">
                  <img src={imageURL} alt="待识别的原始图片" />
                  <button
                    className="image-zoom"
                    onClick={() => setImageOpen(true)}
                  >
                    <Eye size={16} />
                    查看大图
                  </button>
                  <button
                    className="image-change"
                    onClick={() => fileInput.current?.click()}
                    disabled={locked}
                  >
                    <ImagePlus size={16} />
                    更换图片
                  </button>
                </div>
              ) : (
                <div className="upload-empty">
                  <div className="upload-illustration">
                    <FileText size={54} strokeWidth={1.2} />
                    <span>
                      <Sigma size={22} />
                    </span>
                  </div>
                  <h3>放入一张文档图片</h3>
                  <p>拖入截图，或粘贴剪贴板中的图片</p>
                  <button
                    className="button primary"
                    onClick={() => fileInput.current?.click()}
                  >
                    <ArrowUpFromLine size={18} />
                    选择图片
                  </button>
                  <small>PNG / JPG / WebP，最大 8 MB</small>
                </div>
              )}
            </div>
            <div className="source-footer">
              <div className="file-meta">
                {file ? (
                  <>
                    <FileImage size={15} />
                    <span title={file.name}>{file.name}</span>
                    <small>{(file.size / 1024).toFixed(0)} KB</small>
                  </>
                ) : (
                  <span>
                    {loadingExample ? "正在加载示例…" : "试用示例图片"}
                  </span>
                )}
              </div>
              <div className="sample-buttons">
                <button
                  onClick={() => void loadExample("document")}
                  disabled={locked}
                >
                  文档示例
                </button>
                <button
                  onClick={() => void loadExample("formula")}
                  disabled={locked}
                >
                  公式示例
                </button>
              </div>
            </div>
            <div className="recognition-controls">
              <fieldset disabled={locked || !!content}>
                <legend>识别范围</legend>
                <label
                  className={
                    mode === "document" ? "mode-option selected" : "mode-option"
                  }
                >
                  <input
                    type="radio"
                    name="mode"
                    checked={mode === "document"}
                    onChange={() => setMode("document")}
                  />
                  <FileText size={17} />
                  <span>文档与公式</span>
                </label>
                <label
                  className={
                    mode === "formula" ? "mode-option selected" : "mode-option"
                  }
                >
                  <input
                    type="radio"
                    name="mode"
                    checked={mode === "formula"}
                    onChange={() => setMode("formula")}
                  />
                  <Sigma size={18} />
                  <span>单个公式</span>
                </label>
              </fieldset>
              <button
                className="button primary recognize-button"
                disabled={!file || locked}
                onClick={() => process("recognize")}
              >
                {busy ? (
                  <LoaderCircle className="spin" size={18} />
                ) : (
                  <ScanLine size={18} />
                )}
                {busy ? "正在处理" : content ? "重新识别" : "开始识别"}
              </button>
            </div>
          </section>
          <section className="result-panel" aria-labelledby="result-title">
            <div className="panel-header">
              <h2 id="result-title">
                <PencilLine size={19} />
                可编辑结果
              </h2>
              <span className={`result-badge ${content ? "available" : ""}`}>
                {content
                  ? content !== original
                    ? "已修改"
                    : "等待你核对"
                  : "等待识别"}
              </span>
            </div>
            <div className="result-toolbar">
              <div
                role="tablist"
                aria-label="结果视图"
                onKeyDown={(event) => {
                  if (
                    ["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                      event.key,
                    )
                  ) {
                    event.preventDefault();
                    const next =
                      event.key === "Home"
                        ? "preview"
                        : event.key === "End"
                          ? "edit"
                          : tab === "edit"
                            ? "preview"
                            : "edit";
                    setTab(next);
                    document.getElementById(`${next}-tab`)?.focus();
                  }
                }}
              >
                <button
                  role="tab"
                  tabIndex={tab === "preview" ? 0 : -1}
                  id="preview-tab"
                  aria-selected={tab === "preview"}
                  aria-controls="preview-panel"
                  className={tab === "preview" ? "selected" : ""}
                  onClick={() => setTab("preview")}
                >
                  <Eye size={16} />
                  预览
                </button>
                <button
                  role="tab"
                  tabIndex={tab === "edit" ? 0 : -1}
                  id="edit-tab"
                  aria-selected={tab === "edit"}
                  aria-controls="edit-panel"
                  className={tab === "edit" ? "selected" : ""}
                  onClick={() => setTab("edit")}
                >
                  <PencilLine size={15} />
                  编辑源码
                </button>
              </div>
              <button
                className="review-button"
                disabled={!content.trim() || !file || locked}
                onClick={() => process("review")}
              >
                <CheckCheck size={16} />
                对照原图复核
              </button>
            </div>
            {!content && tab === "preview" ? (
              <div
                className="result-empty"
                role="tabpanel"
                id="preview-panel"
                aria-labelledby="preview-tab"
              >
                <div className="empty-lines" aria-hidden="true">
                  <span />
                  <span />
                  <div>f(x) = ∫ g(x) dx</div>
                  <span />
                </div>
                <h3>从图片，变成你的稿件</h3>
                <p>
                  识别后在这里检查文字、表格和公式。
                  <br />
                  你可以直接修改，再导出可编辑的文件。
                </p>
                <button className="text-button" onClick={() => setTab("edit")}>
                  也可以直接输入内容
                </button>
              </div>
            ) : tab === "edit" ? (
              <div
                role="tabpanel"
                id="edit-panel"
                aria-labelledby="edit-tab"
                className="editor-wrap"
              >
                <textarea
                  aria-label={
                    mode === "document" ? "Markdown 编辑器" : "LaTeX 编辑器"
                  }
                  value={content}
                  onChange={(event) => {
                    setContent(event.target.value);
                    setFeedback("");
                    if (proposal !== null) {
                      setProposal(null);
                      finishMessage("稿件已修改，请重新复核或直接导出");
                    }
                  }}
                  spellCheck={false}
                  placeholder={
                    mode === "document"
                      ? "输入 Markdown。行内公式使用 $...$，独立公式使用 $$。"
                      : "输入 LaTeX 公式，例如 \\frac{a}{b}"
                  }
                  disabled={busy || exporting}
                />
                <span className="editor-count">
                  {content.length.toLocaleString()} 字符
                </span>
              </div>
            ) : (
              <div
                role="tabpanel"
                id="preview-panel"
                aria-labelledby="preview-tab"
                className="preview-wrap"
              >
                <div
                  className="document-preview"
                  dangerouslySetInnerHTML={{ __html: preview.html }}
                />
                {previewBusy && (
                  <span className="preview-loading">
                    <LoaderCircle size={14} className="spin" />
                    更新预览
                  </span>
                )}
              </div>
            )}
            <div className="check-status" role="status">
              {previewError ? (
                <span className="warning-text">
                  <AlertCircle size={16} />
                  {previewError}
                </span>
              ) : !content ? (
                <span>识别完成后，自动检查公式语法</span>
              ) : previewBusy ? (
                <span>正在检查修改后的内容…</span>
              ) : (
                <>
                  <span>
                    <Check size={16} />
                    {preview.formulaCount} 个公式
                    {preview.issues.length
                      ? "，有待检查内容"
                      : "，语法检查通过"}
                  </span>
                  <small>请继续核对识别准确性</small>
                </>
              )}
            </div>
            {!!preview.issues.length && (
              <ul className="issues">
                {preview.issues.map((issue, index) => (
                  <li key={index} className={issue.level}>
                    <AlertCircle size={15} />
                    {issue.message}
                  </li>
                ))}
              </ul>
            )}
            {proposal !== null && (
              <div className="proposal-notice">
                <Sparkles size={18} />
                <div>
                  <strong>
                    {proposal === content
                      ? "复核没有提出修改"
                      : "复核提案已生成"}
                  </strong>
                  <span>模型复核仍可能有误，请对照原图决定。</span>
                </div>
                <button
                  className="button secondary"
                  onClick={() => setProposalOpen(true)}
                >
                  查看提案
                </button>
                <button
                  className="icon-button"
                  aria-label="丢弃复核提案"
                  onClick={() => {
                    setProposal(null);
                    finishMessage("已保留当前稿件，可继续编辑和导出");
                  }}
                >
                  <X size={17} />
                </button>
              </div>
            )}
            <div className="export-toolbar">
              <div className="export-label">
                <Download size={18} />
                <span>带回你的文档</span>
                <small>Word 公式可继续编辑</small>
              </div>
              <div className="export-actions">
                <select
                  aria-label="导出格式"
                  value={format}
                  disabled={busy || exporting}
                  onChange={(event) => setFormat(event.target.value)}
                >
                  <option value="docx">Word (.docx)</option>
                  <option value="md">Markdown (.md)</option>
                  {mode === "formula" && (
                    <>
                      <option value="tex">LaTeX (.tex)</option>
                      <option value="mathml">MathML (.mathml)</option>
                    </>
                  )}
                  <option value="json">结构化 JSON</option>
                </select>
                <button
                  className="button primary"
                  disabled={!content.trim() || locked}
                  onClick={() => void download()}
                >
                  {exporting ? (
                    <LoaderCircle size={17} className="spin" />
                  ) : (
                    <Download size={17} />
                  )}
                  {exporting ? "正在导出" : "导出文件"}
                </button>
              </div>
            </div>
            {content && (
              <div className="draft-actions">
                <button className="text-button" onClick={() => void copy()}>
                  <ClipboardPaste size={14} />
                  复制源码
                </button>
                <button
                  className="text-button"
                  disabled={content === original || !original || locked}
                  onClick={() => {
                    if (window.confirm("恢复首次识别稿会替换当前修改。")) {
                      setContent(original);
                      setProposal(null);
                      setFeedback("已恢复首次识别稿。");
                    }
                  }}
                >
                  <RotateCcw size={14} />
                  恢复识别稿
                </button>
                <span>{modelUsed && `本次模型：${modelUsed}`}</span>
              </div>
            )}
          </section>
        </div>
        {feedback && (
          <div className="feedback" role="status">
            <AlertCircle size={17} />
            <span>{feedback}</span>
            <button
              className="icon-button"
              aria-label="关闭提示"
              onClick={() => setFeedback("")}
            >
              <X size={16} />
            </button>
          </div>
        )}
        <footer className="workspace-footer">
          <span>
            <LockKeyhole size={14} />
            文件与稿件仅在当前会话处理，助手不建立内容档案。
          </span>
          <a
            href="https://github.com/19991621059/formulaflow-open"
            target="_blank"
            rel="noreferrer"
          >
            <CodeXml size={16} />
            项目与使用说明
          </a>
        </footer>
      </main>
      <dialog
        ref={imageDialog}
        className="image-dialog"
        onCancel={() => setImageOpen(false)}
        aria-labelledby="image-dialog-title"
      >
        <div className="dialog-heading">
          <h2 id="image-dialog-title">原图大图</h2>
          <button
            className="icon-button"
            aria-label="关闭原图大图"
            onClick={() => setImageOpen(false)}
          >
            <X size={20} />
          </button>
        </div>
        {imageURL && <img src={imageURL} alt="原图完整内容" />}
      </dialog>
      <SettingsDialog
        open={settingsOpen}
        settings={settings}
        server={server}
        onClose={() => setSettingsOpen(false)}
        onSave={setSettings}
      />
      <dialog
        ref={proposalDialog}
        className="proposal-dialog"
        onCancel={() => setProposalOpen(false)}
        aria-labelledby="proposal-title"
      >
        <div className="dialog-heading">
          <div>
            <h2 id="proposal-title">复核提案</h2>
          </div>
          <button
            className="icon-button"
            aria-label="关闭复核提案"
            onClick={() => setProposalOpen(false)}
          >
            <X size={20} />
          </button>
        </div>
        <div className="proposal-grid">
          <section>
            <h3>当前稿件</h3>
            <pre>{content}</pre>
          </section>
          <section>
            <h3>建议稿件</h3>
            <pre>{proposal}</pre>
          </section>
        </div>
        <p className="muted">接受后会替换当前稿件；仍可恢复首次识别结果。</p>
        <div className="dialog-actions">
          <button
            className="button secondary"
            onClick={() => {
              setProposal(null);
              setProposalOpen(false);
              finishMessage("已保留当前稿件，可继续编辑和导出");
            }}
          >
            保留当前稿件
          </button>
          <button
            className="button primary"
            onClick={() => {
              if (proposal !== null) setContent(proposal);
              setProposal(null);
              setProposalOpen(false);
              finishMessage("已接受复核提案，请继续核对和导出");
            }}
          >
            接受提案
          </button>
        </div>
      </dialog>
    </div>
  );
}
