import { env } from "./lib/env";

export const SESSION_COOKIE_NAME = "session";
export const SESSION_COOKIE_MAX_AGE_S = 7 * 24 * 60 * 60;

export function readSessionCookie(req: Request): string | null {
  const cookieHeader = req.headers.get("cookie") || "";
  const found = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`));
  return found ? found.slice(SESSION_COOKIE_NAME.length + 1) : null;
}

function buildAttrs(maxAge: number): string {
  const parts = [
    "HttpOnly",
    "Path=/",
    `Max-Age=${maxAge}`,
    "SameSite=Lax",
  ];
  if (env.isProduction) parts.push("Secure");
  return parts.join("; ");
}

export function writeSessionCookie(resHeaders: Headers, token: string): void {
  resHeaders.append(
    "Set-Cookie",
    `${SESSION_COOKIE_NAME}=${token}; ${buildAttrs(SESSION_COOKIE_MAX_AGE_S)}`
  );
}

export function clearSessionCookie(resHeaders: Headers): void {
  resHeaders.append(
    "Set-Cookie",
    `${SESSION_COOKIE_NAME}=; ${buildAttrs(0)}`
  );
}
