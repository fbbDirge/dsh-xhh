/**
 * Host-half unit tests: URL/host allowlist, cookie rules, signature.
 * Run: node tests/rewrite.test.mjs
 */
import assert from "node:assert/strict";
import {
  safeUrl,
  isAllowedHost,
  heyboxIdFromCookie,
  validateCookie,
  ov,
  generateSignature,
} from "../lib/index.js";

// --- safeUrl ---------------------------------------------------------------
assert.equal(safeUrl("https://api.xiaoheihe.cn/").href, "https://api.xiaoheihe.cn/");
assert.equal(safeUrl(" http://www.xiaoheihe.cn/x ").href, "http://www.xiaoheihe.cn/x");
assert.equal(safeUrl("ftp://xiaoheihe.cn/"), null);
assert.equal(safeUrl("javascript:alert(1)"), null);
assert.equal(safeUrl(""), null);
assert.equal(safeUrl("xiaoheihe.cn"), null); // 无协议

// --- isAllowedHost ----------------------------------------------------------
for (const ok of [
  "https://xiaoheihe.cn/",
  "https://www.xiaoheihe.cn/community",
  "https://api.xiaoheihe.cn/bbs/app/feeds",
  "https://img.xiaoheihe.cn/x.png",
  "https://static.max-c.com/static/x.js", // 小黑盒 CDN
  "https://imgheybox.max-c.com/x.png",
  "https://cdn.max-c.com/x",
]) {
  assert.equal(isAllowedHost(ok), true, "should allow " + ok);
}
for (const bad of [
  "https://xiaoheihe.cn.evil.com/x", // 后缀欺骗
  "https://evilxiaoheihe.cn/x",
  "https://static.max-c.com.evil.com/x",
  "https://evilmax-c.com/x",
  "http://localhost/x",
  "https://raw.githubusercontent.com/x", // 开发期源码域已移除
  "https://api.github.com/x",
  "ftp://xiaoheihe.cn/x",
  "https://user:pass@xiaoheihe.cn/x", // 带凭据
]) {
  assert.equal(isAllowedHost(bad), false, "should refuse " + bad);
}

// --- cookie -----------------------------------------------------------------
assert.equal(heyboxIdFromCookie("a=1; heybox_id=123456; b=2"), "123456");
assert.equal(heyboxIdFromCookie("nothing=here"), null);
assert.equal(validateCookie("x_xhh_tokenid=abc"), true);
assert.equal(validateCookie("user_pkey=abc"), true);
assert.equal(validateCookie("heybox_id=42; x=1"), true);
assert.equal(validateCookie("foo=bar"), false);
assert.equal(validateCookie(""), false);

// --- signature ----------------------------------------------------------------
// ov() 对相同入参必须确定。
assert.equal(ov("/bbs/app/feeds", 1700000000, "ABCDEF0123456789ABCDEF0123456789"), ov("/bbs/app/feeds", 1700000000, "ABCDEF0123456789ABCDEF0123456789"));
// 规范化路径(首尾斜杠)。
assert.equal(ov("bbs/app/feeds", 1700000000, "N"), ov("/bbs/app/feeds/", 1700000000, "N"));
const sig = generateSignature("/bbs/app/link/tree");
assert.ok(/^[A-Z0-9]{1,5}\d{2}$/.test(sig.hkey), "hkey shape: " + sig.hkey);
assert.equal(String(sig._time).length, 10, "_time is unix seconds");
assert.ok(/^[0-9A-F]{32}$/.test(sig.nonce), "nonce 32 upper hex");
// 同一路径连续生成签名结构一致
for (let i = 0; i < 20; i++) {
  const s2 = generateSignature("/bbs/app/feeds");
  assert.ok(/^[A-Z0-9]{1,5}\d{2}$/.test(s2.hkey));
}

console.log("host helpers test passed ✔");
