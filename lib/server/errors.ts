export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public hint: string,
    public status = 400,
  ) {
    super(message);
    this.name = "AppError";
  }
}
export function publicError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  return new AppError(
    "PROCESS_FAILED",
    "处理未完成。",
    "请检查网络或更换图片后重试。",
    500,
  );
}
