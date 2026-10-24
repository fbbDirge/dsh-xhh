import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { patchBili } from "../scripts/bili-compat.mjs";

const parser = `  const parseSeenTable = () => {
    const out = []
    for (const raw of text.split(/\\r?\\n/)) {
      const line = raw.trim()
      if (!line.startsWith('|')) continue
      const cells = line.split('|').map(s => s.trim()).slice(1, -1)
      if (/^BV[0-9A-Za-z]{10}$/.test(cells[1])) out.push(cells)
    }
    return out
  }
  const coverFor = async (bv) => {
    try {
      const r = await fetch('https://api.bilibili.com/x/web-interface/view?bvid=' + bv, {
        headers: { 'user-agent': 'Mozilla/5.0', referer: 'https://www.bilibili.com/' },
      })
      const img = await fetch('https://i0.hdslb.com/test.jpg', {
        headers: { 'user-agent': 'Mozilla/5.0', referer: 'https://www.bilibili.com/' },
      })
      return img
    } catch { return null }
  }
  const rotateLogIfBig = () => {}
  const PERSONA_LIMIT = 40000
  const credentialProbe = () => dmCred(stateDir)
`;

test("bili compatibility parses list/table, is repeatable and keeps upstream persona limit", () => {
  const { source } = patchBili(parser);
  const rows = vm.runInNewContext(source + "\nparseSeenTable()", { text: "- 2026-10-24 · BV1dsn86FEKB · 标题 | 更多 · 挑中（值得看）\n| 2026-10-24 | BV1dsn86FEKC | 表格标题 | UP | 跳过 |\n无效行" });
  assert.equal(rows.length, 2);
  assert.equal(rows[0][2], "标题 ｜ 更多");
  assert.equal(rows[0][4], "挑中（值得看）");
  assert.ok(source.includes("PERSONA_LIMIT = 40000"));
  assert.equal(patchBili(source).changed, false);
  assert.ok(patchBili(parser.replace("PERSONA_LIMIT = 40000", "PERSONA_LIMIT = 6000")).source.includes("PERSONA_LIMIT = 8000"));
  assert.throws(() => patchBili("unsupported source"), /Unsupported/);
});

test("cover Cookie goes only to Bili metadata and refuses header injection", async () => {
  const { source } = patchBili(parser);
  const calls = [];
  const cred = { sessdata: "host-only-session" };
  const cover = vm.runInNewContext(source + "\ncoverFor", { dmCred: () => cred, stateDir: "/tmp/bili", fetch: async (...args) => { calls.push(args); return {}; } });
  await cover("BV1dsn86FEKB");
  assert.equal(calls[0][1].headers.Cookie, "SESSDATA=host-only-session");
  assert.equal(calls[1][1].headers.Cookie, undefined);
  cred.sessdata = "bad\r\nvalue";
  assert.equal(await cover("BV1dsn86FEKB"), null);
  assert.equal(calls.length, 2);
});

test("maintenance CLI dry run, backup, repeat and reinstall recovery", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bili-compat-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const plugin = path.join(dir, "plugin");
  fs.mkdirSync(plugin);
  const file = path.join(plugin, "index.js");
  const backup = path.join(dir, "backup");
  fs.writeFileSync(file, parser);
  const run = (...args) => spawnSync(process.execPath, ["scripts/bili-compat.mjs", file, ...args], { encoding: "utf8" });
  assert.equal(run().status, 0);
  assert.equal(fs.readFileSync(file, "utf8"), parser);
  assert.notEqual(run("--apply", "--backup-dir=" + plugin).status, 0);
  assert.equal(run("--apply", "--backup-dir=" + backup).status, 0);
  const patched = fs.readFileSync(file, "utf8");
  assert.notEqual(patched, parser);
  assert.equal(fs.readFileSync(path.join(backup, fs.readdirSync(backup)[0]), "utf8"), parser);
  assert.equal(run("--apply", "--backup-dir=" + backup).status, 0);
  assert.equal(fs.readFileSync(file, "utf8"), patched);
  fs.writeFileSync(file, parser);
  assert.equal(run("--apply", "--backup-dir=" + backup).status, 0);
  assert.equal(fs.readFileSync(file, "utf8"), patched);
});

// Optional integration against a separately checked-out upstream; no source is vendored here.
if (process.env.BILI_SOURCE) test("patch current upstream and parse actual list records", () => {
  const { source } = patchBili(fs.readFileSync(process.env.BILI_SOURCE, "utf8"));
  const start = source.indexOf("  const parseSeenTable = () => {");
  const end = source.indexOf("  const coverFor = async (bv) => {", start);
  const text = "- 2026-10-24 · BV1dsn86FEKB · 列表标题 · 挑中（值得看）\n| 2026-10-23 18:51 | BV1dsn86FEKC | 表格标题 | UP | 评论 |";
  const rows = vm.runInNewContext(source.slice(start, end) + "\nparseSeenTable()", { join: (...v) => v.join("/"), stateDir: "/tmp/bili", readFileSync: () => text });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].picked, true);
  assert.equal(rows[1].delivered, true);
});
