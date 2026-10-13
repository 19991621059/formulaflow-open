import { AppError } from "./errors";

/** Reserve synchronously, before reading a request body or starting any work. */
export function createCapacity(limit: number) {
  let active = 0;
  return function reserve() {
    if (active >= limit)
      throw new AppError(
        "SERVER_BUSY",
        "当前处理请求较多。",
        "请等待正在进行的任务结束后重试。",
        503,
      );
    active++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      active--;
    };
  };
}
