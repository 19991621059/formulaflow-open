"use client";

import { useEffect, useRef, useState } from "react";
import type { Mode, ProcessEvent, Settings } from "@/lib/types";

export type ProcessState = {
  status: "idle" | "running" | "done" | "error" | "cancelled";
  stage: string;
  message: string;
  elapsedMs: number;
  action?: "recognize" | "review";
  code?: string;
  hint?: string;
};
export function useProcessor() {
  const [state, setState] = useState<ProcessState>({
    status: "idle",
    stage: "",
    message: "选择图片后开始识别",
    elapsedMs: 0,
  });
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const started = useRef(0);
  useEffect(() => {
    if (state.status !== "running") return;
    const timer = setInterval(
      () =>
        setState((previous) =>
          previous.status !== "running"
            ? previous
            : {
                ...previous,
                elapsedMs: Date.now() - started.current,
              },
        ),
      1000,
    );
    return () => clearInterval(timer);
  }, [state.status]);
  useEffect(
    () => () => {
      generation.current++;
      controller.current?.abort();
    },
    [],
  );
  function reset() {
    generation.current++;
    controller.current?.abort();
    setState({
      status: "idle",
      stage: "",
      message: "图片已就绪，可以开始识别",
      elapsedMs: 0,
    });
  }
  function cancel() {
    generation.current++;
    controller.current?.abort();
    setState((previous) => ({
      ...previous,
      status: "cancelled",
      message: "已取消本次处理",
      hint: "可以重试。供应商已开始的计算仍可能计费。",
    }));
  }
  function finishMessage(message: string) {
    setState((previous) =>
      previous.status === "running" ? previous : { ...previous, message },
    );
  }
  async function run(
    file: File,
    mode: Mode,
    settings: Settings,
    action: "recognize" | "review",
    draft: string,
    onResult: (event: Extract<ProcessEvent, { type: "result" }>) => void,
  ) {
    controller.current?.abort();
    const id = ++generation.current,
      abort = new AbortController();
    controller.current = abort;
    started.current = Date.now();
    setState({
      status: "running",
      action,
      stage: "upload",
      message: "正在上传图片",
      elapsedMs: 0,
    });
    try {
      const form = new FormData();
      form.set("image", file);
      form.set("mode", mode);
      form.set("action", action);
      form.set(
        "settings",
        JSON.stringify({
          baseURL: settings.baseURL,
          apiKey: settings.apiKey,
          model: settings.model,
        }),
      );
      if (action === "review") form.set("draft", draft);
      const response = await fetch("/api/process", {
        method: "POST",
        body: form,
        signal: abort.signal,
        headers: settings.accessToken
          ? { authorization: `Bearer ${settings.accessToken}` }
          : {},
      });
      if (!response.ok) {
        const problem = await response.json();
        if (id === generation.current)
          setState({
            status: "error",
            action,
            stage: "",
            message: problem.message || "请求未完成",
            code: problem.code,
            hint: problem.hint,
            elapsedMs: Date.now() - started.current,
          });
        return;
      }
      if (!response.body) throw new Error("Missing response stream");
      const reader = response.body.getReader(),
        decoder = new TextDecoder();
      let buffer = "",
        completed = false;
      const handle = (line: string) => {
        if (!line.trim() || id !== generation.current) return;
        const event: ProcessEvent = JSON.parse(line);
        if (event.type === "stage")
          setState({
            status: "running",
            action,
            stage: event.stage,
            message: event.message,
            elapsedMs: event.elapsedMs,
          });
        if (event.type === "result") {
          completed = true;
          onResult(event);
          setState({
            status: "done",
            action,
            stage: "complete",
            message:
              action === "review"
                ? "复核提案已生成，请检查后接受"
                : "识别完成，请对照原图检查结果",
            elapsedMs: event.elapsedMs,
          });
        }
        if (event.type === "error") {
          completed = true;
          setState({
            status: "error",
            action,
            stage: "",
            message: event.message,
            code: event.code,
            hint: event.hint,
            elapsedMs: event.elapsedMs,
          });
        }
      };
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          lines.forEach(handle);
        }
        buffer += decoder.decode();
        handle(buffer);
      } finally {
        reader.releaseLock();
      }
      if (!completed && id === generation.current)
        throw new Error("Interrupted stream");
    } catch {
      if (id !== generation.current || abort.signal.aborted) return;
      setState({
        status: "error",
        action,
        stage: "",
        code: "NETWORK_INTERRUPTED",
        message: "连接中断，尚未收到完整结果。",
        hint: "检查网络后重试；已编辑的稿件会保留。",
        elapsedMs: Date.now() - started.current,
      });
    }
  }
  return { state, run, cancel, reset, finishMessage };
}
