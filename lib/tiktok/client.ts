import crypto from "node:crypto";

const AUTH_BASE = "https://auth.tiktok-shops.com";
const API_BASE = "https://open-api.tiktokglobalshop.com";
const REQUEST_TIMEOUT_MS = 15_000;

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

export type TikTokApiEnvelope<T = unknown> = {
  code: number | string;
  message?: string;
  request_id?: string;
  data?: T;
};

async function authRequest(path: string, params: Record<string, string>): Promise<TokenData> {
  const url = new URL(AUTH_BASE + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
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
  const result = await callApiWithMeta<T>(opts);
  return result.data as T;
}

/** Same request as callApi, but keeps the TikTok envelope for audit storage. */
export async function callApiWithMeta<T = any>(opts: {
  method: "GET" | "POST";
  path: string;
  accessToken: string;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
}): Promise<{ data: T; envelope: TikTokApiEnvelope<T>; httpStatus: number }> {
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

  // Retry ngắn để một endpoint lỗi không giữ cron quá lâu.
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method: opts.method,
        headers: {
          "content-type": "application/json",
          "x-tts-access-token": opts.accessToken,
        },
        body: bodyStr || undefined,
        cache: "no-store",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      // Lỗi mạng/timeout chỉ thử lại một lần; nhiều endpoint chạy nối tiếp
      // nên retry 3 lần có thể làm cron vượt giới hạn thời gian của Render.
      if (attempt < 1) {
        await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
        continue;
      }
      throw error;
    }
    if ((res.status === 429 || res.status >= 500) && attempt < 1) {
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      continue;
    }
    const json = await res.json().catch(() => ({})) as TikTokApiEnvelope<T>;
    // HTTP 200 vẫn có thể lỗi nghiệp vụ -> luôn kiểm tra code
    if (!res.ok || json.code !== 0) {
      throw new TikTokApiError(opts.path, json.code ?? res.status, json.message ?? "api error");
    }
    return { data: json.data as T, envelope: json, httpStatus: res.status };
  }
}
