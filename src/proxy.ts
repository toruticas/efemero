import { clerkMiddleware } from "@clerk/nextjs/server";
import {
  NextResponse,
  type NextRequest,
  type NextFetchEvent,
} from "next/server";
function clerkOrigin() {
  const key = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
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
    authOrigin = clerkOrigin();
  const accountPage = /^\/(app|sign-in|sign-up)(\/|$)/.test(
    request.nextUrl.pathname,
  );
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
    "img-src 'self' data: blob: https://img.clerk.com https://images.clerk.dev",
    `connect-src 'self' https://vercel.com/api/blob https://vercel.com/api/blob/ https://blob.vercel-storage.com https://*.blob.vercel-storage.com ${authOrigin} https://*.clerk.accounts.dev https://*.clerk.com${protectConnections}${dev ? " ws: http://localhost:*" : ""}`,
    `frame-src ${authOrigin || "'self'"} https://challenges.cloudflare.com${protectFrames}`,
    `worker-src 'self'${accountPage ? " blob:" : ""}`,
    "form-action 'self'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
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
  if (
    needsIdentity &&
    process.env.CLERK_SECRET_KEY &&
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
  ) {
    const handler = clerkMiddleware(() =>
      NextResponse.next({ request: { headers: forwarded } }),
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
