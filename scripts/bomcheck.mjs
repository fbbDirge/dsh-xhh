/**
 * 检查仓库内文本文件是否带 UTF-8 BOM(EF BB BF)。
 * dsh 启动时会 JSON.parse 各 bundle 的 package.json,带 BOM 会直接崩溃,
 * 所以提交前必须保证全仓库 UTF-8 无 BOM。
 * 运行:node scripts/bomcheck.mjs(失败退出码 1)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skip = new Set([".git", "node_modules"]);
const bad = [];

function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    if (skip.has(name)) continue;
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      walk(full);
      continue;
    }
    const fh = fs.openSync(full, "r");
    const head = Buffer.alloc(3);
    const n = fs.readSync(fh, head, 0, 3, 0);
    fs.closeSync(fh);
    if (n === 3 && head[0] === 0xef && head[1] === 0xbb && head[2] === 0xbf) {
      bad.push(path.relative(root, full));
    }
  }
}

walk(root);
if (bad.length) {
  console.error("BOM found in:\n  " + bad.join("\n  "));
  console.error("请用 UTF-8(无 BOM)重存,例如:PowerShell 7 `utf8NoBOM`,或编辑器 Save with Encoding → UTF-8。");
  process.exit(1);
}
console.log("bomcheck: 全部文件 UTF-8 无 BOM ✔");
