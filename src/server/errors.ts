import "server-only";
export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export const unavailable = () =>
  new AppError(404, "UNAVAILABLE", "Artefato indisponível ou acesso inválido.");
export const unauthorized = () =>
  new AppError(403, "FORBIDDEN", "Operação não autorizada.");
