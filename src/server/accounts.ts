import "server-only";
import { auth } from "@clerk/nextjs/server";
import { randomUUID } from "node:crypto";
import { RESERVED_NAMES } from "@/lib/protocol";
import { getDatabase, type Row } from "./db";
import { configurationStatus } from "./config";
import { AppError } from "./errors";
export type Account = Row & { id: string; username: string };
export async function clerkUserId() {
  if (!configurationStatus().accounts)
    throw new AppError(
      503,
      "ACCOUNTS_NOT_CONFIGURED",
      "A área de contas ainda está sendo configurada. Você pode compartilhar anonimamente.",
    );
  const { userId } = await auth();
  if (!userId)
    throw new AppError(
      401,
      "LOGIN_REQUIRED",
      "Entre na sua conta para continuar.",
    );
  return userId;
}
export async function currentAccount() {
  const userId = await clerkUserId();
  const result = await getDatabase().query<Account>(
    "SELECT id,username FROM accounts WHERE clerk_id=$1",
    [userId],
  );
  return result.rows[0] || null;
}
export async function createAccount(username: string) {
  if (RESERVED_NAMES.has(username))
    throw new AppError(409, "USERNAME_TAKEN", "Este username está reservado.");
  const userId = await clerkUserId();
  try {
    const result = await getDatabase().query<Account>(
      "INSERT INTO accounts(id,clerk_id,username) VALUES($1,$2,$3) ON CONFLICT(clerk_id) DO NOTHING RETURNING id,username",
      [randomUUID(), userId, username],
    );
    if (!result.rowCount)
      throw new AppError(
        409,
        "USERNAME_FIXED",
        "O username da conta já foi definido e não pode ser alterado nesta versão.",
      );
    return result.rows[0];
  } catch (error) {
    if ((error as { code?: string }).code === "23505")
      throw new AppError(
        409,
        "USERNAME_TAKEN",
        "Este username já está em uso.",
      );
    throw error;
  }
}
