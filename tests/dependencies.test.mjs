import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { Dependencies, loadQrCode } from "../lib/dependencies.js";
import { defaults } from "../lib/automation.js";

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "heybox-dependencies-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  let ready = false;
  const launches = [];
  const manager = new Dependencies({ directory, config: () => defaults, npm: { command: process.execPath, args: ["npm-cli.js"] },
    probe: () => { if (!ready) throw new Error("missing"); return { toDataURL() {} }; },
    run: (...args) => {
      const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
      child.kill = () => child.emit("close", null);
      launches.push({ args, child }); return child;
    },
  });
  t.after(() => manager.close());
  return { manager, launches, directory, ready: () => { ready = true; } };
}

test("dependency install is fixed, local, asynchronous, deduplicated and rechecked", (t) => {
  const s = fixture(t);
  assert.equal(s.manager.status().qrReady, false);
  assert.equal(s.manager.install().installing, true);
  s.manager.install(); assert.equal(s.launches.length, 1);
  const { args, child } = s.launches[0];
  assert.equal(args[0], process.execPath);
  assert.ok(args[1].includes("--ignore-scripts"));
  assert.equal(args[1].at(-1), "qrcode@1.5.4");
  assert.equal(args[2].shell, false);
  assert.equal(args[2].cwd, path.join(s.directory, "dependencies"));
  child.stderr.emit("data", Buffer.from("registry token=must-not-leak"));
  assert.ok(!JSON.stringify(s.manager.status()).includes("must-not-leak"));
  s.ready(); child.emit("close", 0);
  assert.equal(s.manager.status().qrReady, true);
  assert.equal(s.manager.status().installing, false);
  assert.equal(s.manager.status().error, "");
});

test("dependency failures permit retry; close kills pending installation", (t) => {
  const s = fixture(t);
  s.manager.install(); s.launches[0].child.emit("error", new Error("spawn failed"));
  assert.match(s.manager.status().error, /无法启动/);
  s.manager.install(); assert.equal(s.launches.length, 2);
  s.launches[1].child.emit("close", 1);
  assert.match(s.manager.status().error, /退出码 1/);
  s.manager.install(); s.launches[2].child.emit("close", 0);
  assert.match(s.manager.status().error, /未通过加载检查/);
  s.manager.install(); s.manager.close();
  assert.equal(s.manager.status().installing, false);
  assert.throws(() => s.manager.install(), /停止/);
});

test("bundled QR dependency remains available without private install", () => {
  assert.equal(typeof loadQrCode(os.tmpdir()).toDataURL, "function");
});
