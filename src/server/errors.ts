import "server-only";
import type { Message } from "@/lib/i18n/messages";
export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: Message,
  ) {
    super(message);
  }
}
export const unavailable = () =>
  new AppError(404, "UNAVAILABLE", "Artifact unavailable or invalid access.");
export const unauthorized = () =>
  new AppError(403, "FORBIDDEN", "Operation not authorized.");
