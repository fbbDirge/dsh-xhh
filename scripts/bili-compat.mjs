import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const marker = "// dsh-xhh bili compatibility v1";

export function patchBili(source) {
  if (source.includes(marker)) return { source, changed: false };
  const start = source.indexOf("  const parseSeenTable = () => {");
  const end = source.indexOf("  const coverFor = async (bv) => {", start);
  if (start < 0 || end < 0) throw new Error("Unsupported bili source: parser/cover anchors not found; no files changed");
  let parser = source.slice(start, end);
  const anchor = "      const line = raw.trim()\n      if (!line.startsWith('|')) continue";
  if (parser.split(anchor).length !== 2) throw new Error("Unsupported bili parser; no files changed");
  parser = parser.replace(anchor, `      ${marker}
      let line = raw.trim()
      if (!line.startsWith('|')) {
        const list = /^(?:[-*+]\\s+|\\d+[.)]\\s+)?(\\d{4}-\\d{2}-\\d{2}(?:[ T]\\d{2}:\\d{2}(?::\\d{2})?)?)\\s*[·•]\\s*(BV[0-9A-Za-z]{10})\\s*[·•]\\s*(.+)$/.exec(line)
        if (!list) continue
        const parts = list[3].split(/\\s+[·•]\\s+/)
        if (parts.length < 2) continue
        const status = parts.pop()
        const title = parts.join(' · ').replace(/\\|/g, '｜')
        line = '| ' + list[1] + ' | ' + list[2] + ' | ' + title + ' | | ' + status + ' |'
      }
      if (!line.startsWith('|')) continue`);
  let result = source.slice(0, start) + parser + source.slice(end);
  const coverStart = result.indexOf("  const coverFor = async (bv) => {");
  const coverEnd = result.indexOf("  const rotateLogIfBig", coverStart);
  if (coverEnd < 0 || !result.includes("dmCred(stateDir)")) throw new Error("Unsupported credential/cover layout; no files changed");
  let cover = result.slice(coverStart, coverEnd);
  const header = "headers: { 'user-agent': 'Mozilla/5.0', referer: 'https://www.bilibili.com/' },";
  if (!cover.includes(header)) throw new Error("Unsupported cover headers; no files changed");
  // Cookie is sent only to Bilibili's metadata API, never to the image CDN.
  cover = cover.replace("    try {", `    try {
      const credential = dmCred(stateDir) || {}
      const sessionCookie = String(credential.sessdata || credential.SESSDATA || '')
      if (/[\\r\\n;]/.test(sessionCookie)) return null`);
  cover = cover.replace(header, "headers: { 'user-agent': 'Mozilla/5.0', referer: 'https://www.bilibili.com/', ...(sessionCookie ? { Cookie: 'SESSDATA=' + sessionCookie } : {}) },");
  result = result.slice(0, coverStart) + cover + result.slice(coverEnd);
  // Modern upstream already supports 40000; only raise the older 6000 limit.
  result = result.replace(/const PERSONA_LIMIT = 6000\b/g, "const PERSONA_LIMIT = 8000");
  return { source: result, changed: true };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    const file = args.find((arg) => !arg.startsWith("--"));
    if (!file) throw new Error("Usage: node scripts/bili-compat.mjs /path/to/dsh-bili-scroll/index.js [--apply] [--backup-dir=/outside/plugin]");
    const target = fs.realpathSync(file);
    const before = fs.readFileSync(target, "utf8");
    const patched = patchBili(before);
    if (!patched.changed) console.log("Compatibility patch already present; no changes.");
    else if (!args.includes("--apply")) console.log("Compatible source detected. Dry run only; use --apply and --backup-dir=/outside/plugin to write.");
    else {
      const backupArg = args.find((arg) => arg.startsWith("--backup-dir="));
      if (!backupArg) throw new Error("--backup-dir is required and must be outside the plugin directory");
      let backupDir = path.resolve(backupArg.slice("--backup-dir=".length));
      const pluginDir = path.dirname(target);
      if (fs.existsSync(backupDir)) backupDir = fs.realpathSync(backupDir);
      if (backupDir === pluginDir || backupDir.startsWith(pluginDir + path.sep)) throw new Error("Backup directory must be outside the plugin directory");
      const syntax = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: patched.source, encoding: "utf8" });
      if (syntax.status !== 0) throw new Error("Patched source failed syntax check; no files changed");
      fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
      backupDir = fs.realpathSync(backupDir);
      if (backupDir === pluginDir || backupDir.startsWith(pluginDir + path.sep)) throw new Error("Backup directory must be outside the plugin directory");
      const digest = crypto.createHash("sha256").update(before).digest("hex");
      const backup = path.join(backupDir, "bili-index-" + digest + ".js");
      if (!fs.existsSync(backup)) fs.writeFileSync(backup, before, { mode: 0o600, flag: "wx" });
      const temp = target + ".compat-" + process.pid;
      try {
        fs.writeFileSync(temp, patched.source, { mode: fs.statSync(target).mode, flag: "wx" });
        fs.renameSync(temp, target);
      } finally { fs.rmSync(temp, { force: true }); }
      console.log("Patched Bili parser and metadata Cookie; backup: " + backup + ". Restart the DSH host to load it.");
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
