import crypto from "node:crypto";

const AUTH_BASE = "https://auth.tiktok-shops.com";
const API_BASE = "https://open-api.tiktokglobalshop.com";

function appKey() {
  const v = process.env.TTS_APP_KEY;
  if (!v) throw new Error("Missing TTS_APP_KEY");
  return v;
}
function appSecret() {
  const v = process.env.TTS_APP_SECRET;
  if (!v) throw new Error("Missing TTS_APP_SECRET");
  return v;
}

export type TokenData = {
  access_token: string;
  access_token_expire_in: number; // unix seconds
  refresh_token: string;
  refresh_token_expire_in: number; // unix seconds
  open_id: string;
  seller_name?: string;
  user_type?: number;
  granted_scopes?: string[];
};

export class TikTokApiError extends Error {
  constructor(public path: string, public code: number | string, message: string) {
    super(`${path}: ${code} ${message}`);
  }
}

async function authRequest(path: string, params: Record<string, string>): Promise<TokenData> {
  const url = new URL(AUTH_BASE + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { cache: "no-store" });
  const body = await res.json();
  if (!res.ok || body.code !== 0) {
    throw new TikTokApiError(path, body.code ?? res.status, body.message ?? "auth error");
  }
  return body.data as TokenData;
}

/** Đổi auth code (từ redirect URL) lấy token */
export function getToken(authCode: string) {
  return authRequest("/api/v2/token/get", {
    app_key: appKey(),
    app_secret: appSecret(),
    auth_code: authCode,
    grant_type: "authorized_code",
  });
}

export function refreshToken(refresh: string) {
  return authRequest("/api/v2/token/refresh", {
    app_key: appKey(),
    app_secret: appSecret(),
    refresh_token: refresh,
    grant_type: "refresh_token",
  });
}

/** Chữ ký HMAC-SHA256 theo chuẩn TikTok Shop Open API (version 202309+) */
export function sign(path: string, params: Record<string, string>, body = ""): string {
  const secret = appSecret();
  const keys = Object.keys(params)
    .filter((k) => k !== "sign" && k !== "access_token")
    .sort();
  const base = secret + path + keys.map((k) => k + params[k]).join("") + body + secret;
  return crypto.createHmac("sha256", secret).update(base).digest("hex");
}

export async function callApi<T = any>(opts: {
  method: "GET" | "POST";
  path: string;
  accessToken: string;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
}): Promise<T> {
  const params: Record<string, string> = {
    app_key: appKey(),
    timestamp: String(Math.floor(Date.now() / 1000)),
  };
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v !== undefined && v !== null && v !== "") params[k] = String(v);
  }
  const bodyStr = opts.body ? JSON.stringify(opts.body) : "";
  params.sign = sign(opts.path, params, bodyStr);

  const url = new URL(API_BASE + opts.path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  // Retry nhẹ khi bị rate limit / lỗi mạng
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      method: opts.method,
      headers: {
        "content-type": "application/json",
        "x-tts-access-token": opts.accessToken,
      },
      body: bodyStr || undefined,
      cache: "no-store",
    });
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      continue;
    }
    const json = await res.json().catch(() => ({}));
    // HTTP 200 vẫn có thể lỗi nghiệp vụ -> luôn kiểm tra code
    if (!res.ok || json.code !== 0) {
      throw new TikTokApiError(opts.path, json.code ?? res.status, json.message ?? "api error");
    }
    return json.data as T;
  }
}
