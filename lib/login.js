import crypto from "node:crypto";
import { loadQrCode } from "./dependencies.js";

const terminal = new Set(["authenticated", "expired", "cancelled", "requires_2fa", "error"]);
function credentials(result) {
  const id = String(result?.profile?.heybox_id || result?.account_detail?.userid || "");
  const pkey = result?.pkey;
  if (!/^\d+$/.test(id) || typeof pkey !== "string" || !pkey || pkey.length > 4096 || /[;\s\x00-\x1f\x7f]/.test(pkey)) return null;
  return { id, pkey };
}
function mergeCookies(jar, cookies = []) {
  for (const cookie of cookies) {
    const pair = cookie.split(";", 1)[0];
    const equal = pair.indexOf("=");
    if (equal < 1 || /[\r\n\0]/.test(pair)) continue;
    const key = pair.slice(0, equal);
    if (!/^[\w-]+$/.test(key) || pair.length > 8192) continue;
    jar.set(key, pair.slice(equal + 1));
  }
}
const cookieText = (jar) => [...jar].map(([key, value]) => key + "=" + value).join("; ");

/** One ephemeral QR session per host; superseded/ cancelled responses cannot log in. */
export class QrLogin {
  constructor({ request, authenticate, now = Date.now, directory, encode = (text) => loadQrCode(directory).toDataURL(text, { width: 256, margin: 4, errorCorrectionLevel: "M" }) }) {
    this.request = request; this.authenticate = authenticate; this.now = now; this.encode = encode;
    this.session = null;
  }
  cancel() { if (this.session) { this.session.status = "cancelled"; this.session.cookies.clear(); } this.session = null; }
  cancelSession(id) { if (this.session?.id === id) this.cancel(); }
  current(session) { return this.session === session && !terminal.has(session.status); }
  snapshot(session) {
    return { sessionId: session.id, status: session.status, image: terminal.has(session.status) ? null : session.image || null, expiresAt: session.expiresAt, pollIntervalMs: 1500 };
  }
  async start() {
    this.cancel();
    const session = { id: crypto.randomBytes(24).toString("hex"), status: "loading", cookies: new Map(), expiresAt: this.now() + 120000, lastPoll: -Infinity, busy: false };
    this.session = session;
    try {
      const { data, cookies } = await this.request("/account/get_qrcode_url/", { app: "web" }, "");
      if (!this.current(session)) throw new Error("二维码请求已取消，请重新获取");
      const url = new URL(data?.result?.qr_url);
      const qr = url.searchParams.get("qr");
      if (data.status !== "ok" || url.origin !== "https://api.xiaoheihe.cn" || url.pathname !== "/account/qr_login/" || !qr || qr.length > 2048) throw new Error("平台返回的二维码无效，请重试");
      mergeCookies(session.cookies, cookies);
      session.qr = qr;
      const expire = Number(data.result.expire);
      // The official endpoint currently returns a relative lifetime in seconds (120).
      session.expiresAt = this.now() + (Number.isFinite(expire) && expire > 0 && expire <= 3600 ? expire : 120) * 1000;
      session.image = await this.encode(url.href);
      if (!this.current(session)) throw new Error("二维码请求已取消，请重新获取");
      session.status = "waiting";
      return this.snapshot(session);
    } catch (error) { if (this.session === session) this.cancel(); throw error; }
  }
  async poll(id) {
    const session = this.session;
    if (!session || id !== session.id) throw new Error("二维码会话不存在，请重新获取");
    if (terminal.has(session.status)) return this.snapshot(session);
    if (this.now() >= session.expiresAt) { session.status = "expired"; session.cookies.clear(); return this.snapshot(session); }
    if (session.busy || this.now() - session.lastPoll < 1500) return this.snapshot(session);
    session.busy = true; session.lastPoll = this.now();
    try {
      const { data, cookies } = await this.request("/account/qr_state/", { qr: session.qr, app: "web" }, cookieText(session.cookies));
      if (!this.current(session)) throw new Error("二维码请求已取消，请重新获取");
      if (this.now() >= session.expiresAt) { session.status = "expired"; return this.snapshot(session); }
      mergeCookies(session.cookies, cookies);
      if (data.status === "need_google_check") session.status = "requires_2fa";
      else if (data.status !== "ok") throw new Error("二维码状态查询失败，请重试或重新获取二维码");
      else if (data.result?.error === "wait") session.status = "waiting";
      else if (data.result?.error === "ready") session.status = "scanned";
      else if (data.result?.error === "ok") {
        let identity = credentials(data.result);
        // Match the website's restore-login fallback when confirmation only sets cookies.
        if (!identity) {
          const restored = await this.request("/account/restore_login", {}, cookieText(session.cookies));
          if (!this.current(session)) throw new Error("二维码请求已取消，请重新获取");
          if (this.now() >= session.expiresAt) { session.status = "expired"; return this.snapshot(session); }
          mergeCookies(session.cookies, restored.cookies);
          if (restored.data.status === "need_google_check") session.status = "requires_2fa";
          else if (restored.data.status === "ok") identity = credentials(restored.data.result);
        }
        if (identity) {
          for (const key of ["heybox_id", "user_heybox_id"]) session.cookies.set(key, identity.id);
          for (const key of ["pkey", "user_pkey"]) session.cookies.set(key, identity.pkey);
          const cookie = cookieText(session.cookies);
          if (cookie.length > 16384) throw new Error("平台登录凭据过长，请重新登录");
          if (!this.current(session)) throw new Error("二维码请求已取消，请重新获取");
          await this.authenticate({ cookie, heyboxId: identity.id });
          session.status = "authenticated";
        } else if (session.status !== "requires_2fa") throw new Error("平台未返回完整登录凭据，请使用 Cookie 备用登录");
      } else session.status = "expired";
      return this.snapshot(session);
    } finally { session.busy = false; if (terminal.has(session.status)) session.cookies.clear(); }
  }
}
