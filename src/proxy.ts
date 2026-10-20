import { clerkMiddleware } from "@clerk/nextjs/server";
import {
  NextResponse,
  type NextRequest,
  type NextFetchEvent,
} from "next/server";
import {
  accountsEnabled,
  clerkPublishableKey,
  authProvider,
  storageDriver,
  loopbackHTTP,
} from "@/lib/runtime-options";
function clerkOrigin() {
  const key = clerkPublishableKey();
  if (!key) return "";
  try {
    const host = atob(key.split("_").slice(2).join("_")).replace(/\$$/, "");
    return /^[a-zA-Z0-9.-]+$/.test(host) ? `https://${host}` : "";
  } catch {
    return "";
  }
}
export default async function proxy(
  request: NextRequest,
  event: NextFetchEvent,
) {
  const nonce = btoa(
    String.fromCharCode(...crypto.getRandomValues(new Uint8Array(24))),
  );
  const dev = process.env.NODE_ENV !== "production",
    authOrigin = accountsEnabled() ? clerkOrigin() : "";
  const accountPage =
    /^\/(app|sign-in|sign-up)(\/|$)/.test(request.nextUrl.pathname) &&
    authProvider() === "clerk";
  const clerkConnections =
    authProvider() === "clerk"
      ? `${authOrigin} https://*.clerk.accounts.dev https://*.clerk.com`
      : "";
  const blobConnections =
    storageDriver() === "vercel-blob"
      ? "https://vercel.com/api/blob https://vercel.com/api/blob/ https://blob.vercel-storage.com https://*.blob.vercel-storage.com"
      : "";
  // Clerk Protect needs blob workers and HTTPS probes on non-default ports.
  // Keep these permissions scoped to pages that actually load Clerk.
  const protectConnections = accountPage
    ? " https://*.protect.clerk.com:*"
    : "";
  const protectFrames = accountPage ? " https://*.protect.clerk.com" : "";
  const csp = [
    "default-src 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    `img-src 'self' data: blob:${authProvider() === "clerk" ? " https://img.clerk.com https://images.clerk.dev" : ""}`,
    `connect-src 'self' ${blobConnections} ${clerkConnections}${protectConnections}${dev ? " ws: http://localhost:*" : ""}`,
    `frame-src ${authOrigin || "'self'"}${authProvider() === "clerk" ? " https://challenges.cloudflare.com" : ""}${protectFrames}`,
    `worker-src 'self'${accountPage ? " blob:" : ""}`,
    "form-action 'self'",
    ...(dev || loopbackHTTP() ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
  const forwarded = new Headers(request.headers);
  forwarded.set("x-nonce", nonce);
  forwarded.set("Content-Security-Policy", csp);
  const needsIdentity =
    /^\/(app|sign-in|sign-up|api\/account)(\/|$)/.test(
      request.nextUrl.pathname,
    ) ||
    ["/api/artifacts/reserve", "/api/artifacts/revoke"].includes(
      request.nextUrl.pathname,
    );
  let response: Response;
  if (needsIdentity && accountsEnabled()) {
    const handler = clerkMiddleware(
      () => NextResponse.next({ request: { headers: forwarded } }),
      { publishableKey: clerkPublishableKey() },
    );
    response =
      (await handler(request, event)) ||
      NextResponse.next({ request: { headers: forwarded } });
  } else response = NextResponse.next({ request: { headers: forwarded } });
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
