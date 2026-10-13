export type Mode = "document" | "formula";
export type Settings = {
  baseURL: string;
  apiKey: string;
  model: string;
  accessToken: string;
};
export type Issue = { level: "warning" | "error"; message: string };
export type ProcessEvent =
  | {
      type: "stage";
      stage: "validate" | "prepare" | "recognize" | "check";
      message: string;
      elapsedMs: number;
    }
  | {
      type: "result";
      content: string;
      mode: Mode;
      issues: Issue[];
      elapsedMs: number;
      model: string;
      usage?: { input: number | null; output: number | null };
    }
  | {
      type: "error";
      code: string;
      message: string;
      hint: string;
      elapsedMs: number;
    };
