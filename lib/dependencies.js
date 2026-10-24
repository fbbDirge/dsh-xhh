import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { resolveLauncher } from "./generator.js";

const packageRequire = createRequire(import.meta.url);
export function loadQrCode(directory) {
  try { return packageRequire("qrcode"); }
  catch {
    try { return createRequire(path.join(directory, "dependencies", "package.json"))("qrcode"); }
    catch { throw new Error("缺少扫码依赖 qrcode，请到高级菜单一键安装依赖"); }
  }
}

function executable(command) {
  const candidates = path.isAbsolute(command) || command.includes(path.sep) ? [command]
    : (process.env.PATH || "").split(path.delimiter).map((p) => path.join(p, command));
  return candidates.some((candidate) => { try { fs.accessSync(candidate, fs.constants.X_OK); return true; } catch { return false; } });
}
function npmLauncher() {
  // Run npm with the host's Node, even if PATH contains an older Node.
  const candidates = [path.join(path.dirname(process.execPath), "node_modules/npm/bin/npm-cli.js"), path.resolve(path.dirname(process.execPath), "../lib/node_modules/npm/bin/npm-cli.js")];
  for (const file of candidates) if (fs.existsSync(file)) return { command: process.execPath, args: [file] };
  const npm = (process.env.PATH || "").split(path.delimiter).map((p) => path.join(p, "npm")).find((p) => executable(p));
  if (npm && process.platform !== "win32") return { command: process.execPath, args: [fs.realpathSync(npm)] };
  return null;
}

export class Dependencies {
  constructor({ directory, config, run = spawn, probe = loadQrCode, npm = npmLauncher() }) {
    Object.assign(this, { directory, config, run, probe, npm });
    this.installing = false; this.logs = []; this.error = ""; this.closed = false;
  }
  log(message) { this.logs.push(message); this.logs = this.logs.slice(-80); }
  status() {
    let qrReady = false;
    try { qrReady = typeof this.probe(this.directory)?.toDataURL === "function"; } catch { /* dependency absent */ }
    const launcher = resolveLauncher(this.config());
    return { installing: this.installing, qrReady, nodeVersion: process.version, nodeReady: Number(process.versions.node.split(".")[0]) >= 18,
      dshReady: executable(launcher.command) && (!launcher.prefix.length || fs.existsSync(launcher.prefix[0])),
      npmReady: !!this.npm, logs: this.logs, error: this.error };
  }
  install() {
    if (this.closed) throw new Error("宿主正在停止");
    if (this.installing) return this.status();
    if (!this.npm) throw new Error("未找到 npm，请先为宿主安装带 npm 的 Node.js");
    const target = path.join(this.directory, "dependencies");
    fs.mkdirSync(target, { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(target, "package.json"), JSON.stringify({ name: "heybox-local-dependencies", private: true, version: "1.0.0" }), { mode: 0o600 });
    this.logs = []; this.error = ""; this.installing = true; this.progressSeen = false;
    this.log("正在安装 qrcode@1.5.4（仅当前 DSH 数据目录）…");
    let child, finished = false, timer;
    const finish = (error) => {
      if (finished) return;
      finished = true; clearTimeout(timer); this.child = null; this.installing = false;
      if (!error) { try { if (typeof this.probe(this.directory)?.toDataURL !== "function") throw new Error("invalid module"); } catch { error = "安装完成但依赖未通过加载检查"; } }
      this.error = error || "";
      this.log(error || "依赖安装完成，可直接使用扫码登录。");
    };
    try {
      child = this.run(this.npm.command, [...this.npm.args, "install", "--prefix", target, "--ignore-scripts", "--no-audit", "--no-fund", "--save-exact", "qrcode@1.5.4"],
        { cwd: target, shell: false, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, npm_config_update_notifier: "false" } });
      this.child = child;
      for (const stream of [child.stdout, child.stderr]) stream.on("data", (chunk) => {
        // npm diagnostics can contain configured registry credentials; show progress without raw output.
        if (chunk.length && !this.progressSeen) { this.progressSeen = true; this.log("npm 正在处理依赖，请稍候…"); }
      });
      child.on("error", () => finish("无法启动 npm，请检查宿主 Node.js / npm 安装"));
      child.on("close", (code) => finish(code === 0 ? "" : "依赖安装失败（退出码 " + code + "），请检查网络、npm 源和目录权限后重试"));
      timer = setTimeout(() => { finish("安装超时，请检查网络后重试"); child.kill("SIGKILL"); }, 180000);
      timer.unref?.();
    } catch { finish("无法启动依赖安装，请检查目录权限和 npm"); }
    return this.status();
  }
  close() { this.closed = true; this.child?.kill("SIGKILL"); }
}
