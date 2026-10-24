/** Load through DSH's ModuleLoader and exercise the registered settings view. */
import fs from "node:fs";
import assert from "node:assert/strict";
import { defaults } from "../lib/automation.js";

let bundle;
const styles = [];
global.window = { __ModuleLoader__: { load(spec) { bundle = spec; } } };
global.document = {
  createElement: () => ({ setAttribute() {}, remove() { this.removed = true; } }),
  head: { appendChild(style) { styles.push(style); } },
};
new Function(fs.readFileSync(new URL("../lib/client.js", import.meta.url), "utf8"))();
assert.equal(bundle.id, "heybox");

const timers = new Map();
const nativeInterval = global.setInterval;
const nativeClear = global.clearInterval;
global.setInterval = (fn) => { const key = timers.size + 1; timers.set(key, fn); return key; };
global.clearInterval = (key) => timers.delete(key);
const requests = [];
let server = { ok: true, config: structuredClone(defaults), busy: false, nextRunAt: null, fault: "", usage: { comment: 0, reply: 0 }, history: [] };
let account = { ok: true, loggedIn: true, heyboxId: "123" };
let failSave = false;
let dependencies = { ok: true, qrReady: false, nodeReady: true, nodeVersion: "v24.0.0", dshReady: true, npmReady: true, installing: false, logs: [], error: "" };
global.fetch = async (url, options) => {
  const body = options.body ? JSON.parse(options.body) : null;
  requests.push({ url, body, signal: options.signal });
  if (url.includes("/watched?")) return { ok: true, status: 200, json: async () => ({ ok: true, total: 1, records: [{ at: Date.now(), type: "browse", title: "示例帖子", postId: "123" }] }) };
  if (url.endsWith("dependencies")) {
    if (body?.action === "install") dependencies = { ...dependencies, installing: true, logs: ["正在安装 qrcode…"] };
    return { ok: true, status: 200, json: async () => structuredClone(dependencies) };
  }
  if (body?.action === "configure") {
    if (failSave) return { ok: false, status: 409, json: async () => ({ ok: false, error: "配置保存失败" }) };
    server = { ...server, config: { ...server.config, ...body.config } };
  }
  if (body?.action === "run") server = { ...server, busy: true };
  if (body?.action === "login") account = { ...account, loggedIn: true };
  if (body?.action === "logout") account = { ...account, loggedIn: false };
  return { ok: true, status: 200, json: async () => structuredClone(url.endsWith("state") ? account : server) };
};

// Minimal hook lifecycle: state and refs persist, effects run after mount and clean up.
function harness() {
  const hooks = [];
  const effects = [];
  let cursor = 0;
  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children: children.flat(Infinity) }, children: children.flat(Infinity) }),
    useState(initial) {
      const i = cursor++;
      if (!(i in hooks)) hooks[i] = typeof initial === "function" ? initial() : initial;
      return [hooks[i], (value) => { hooks[i] = typeof value === "function" ? value(hooks[i]) : value; }];
    },
    useRef(value) { const i = cursor++; return hooks[i] ??= { current: value }; },
    useEffect(fn) { const i = cursor++; if (!(i in hooks)) { hooks[i] = true; effects.push(fn); } },
  };
  const registrations = new Map();
  const cleanup = [];
  const module = bundle.factory((name) => { assert.equal(name, "react"); return react; });
  assert.deepEqual(module.inject, ["slots"]);
  module.apply({
    effect: (fn) => cleanup.push(fn()),
    get: () => ({
      inject: (name, fn) => { assert.ok(["settings.section", "conversation.view"].includes(name)); return fn(); },
      register: (desc, render) => { registrations.set(desc.name, { desc, render }); },
    }),
  });
  function expand(node) {
    if (!node || typeof node !== "object") return node;
    if (typeof node.type === "function") return expand(node.type(node.props));
    return { ...node, children: node.children.map(expand) };
  }
  let component;
  return {
    registrations,
    mount(name) { component = registrations.get(name).render().type; const tree = this.render(); for (const effect of effects.splice(0)) cleanup.push(effect()); return tree; },
    render() { cursor = 0; return expand(component()); },
    unmount() { for (const stop of cleanup) stop?.(); },
  };
}
function all(tree) { return tree && typeof tree === "object" ? [tree, ...tree.children.flatMap(all)] : []; }
function text(tree) { return tree && typeof tree === "object" ? tree.children.map(text).join("") : typeof tree === "string" || typeof tree === "number" ? String(tree) : ""; }
function control(tree, label) { const found = all(tree).find((n) => n.props["aria-label"] === label); assert.ok(found, label); return found; }
function button(tree, label) { const found = all(tree).find((n) => n.type === "button" && text(n) === label); assert.ok(found, label); return found; }
async function settle() { for (let i = 0; i < 15; i++) await Promise.resolve(); }
async function poll() { await Promise.all([...timers.values()].map((fn) => fn())); await settle(); }

try {
  const page = harness();
  assert.equal(page.registrations.get("settings.section").desc.label, "刷小黑盒");
  assert.equal(page.registrations.get("conversation.view").desc.label, "刷过的帖子");
  assert.equal(page.registrations.get("conversation.view").desc.scope, "session");
  assert.equal(page.registrations.get("conversation.view").desc.id, "heybox-watched");
  page.mount("settings.section");
  await settle();
  let tree = page.render();
  assert.ok(text(tree).includes("已保存 Cookie"));
  const tabs = all(tree).filter((n) => n.props.role === "tab");
  assert.deepEqual(tabs.map(text), ["概览", "账号", "浏览", "互动", "评论记录", "峰谷", "高级"]);
  assert.equal(tabs.filter((n) => n.props["aria-selected"]).length, 1);
  assert.equal(all(tree).find((n) => n.props.id === "hx-panel-browse").props.hidden, true);
  button(tree, "浏览").props.onClick();
  tree = page.render();
  assert.equal(all(tree).find((n) => n.props.id === "hx-panel-browse").props.hidden, false);
  control(tree, "定时浏览总开关").props.onChange({ target: { checked: true } });
  tree = page.render();
  control(tree, "每轮帖子数").props.onChange({ target: { value: "3" } });
  button(page.render(), "互动").props.onClick();
  control(page.render(), "回复人格").props.onChange({ target: { value: "认真倾听\n简洁回答" } });
  control(page.render(), "评论提及对象").props.onChange({ target: { value: "custom" } });
  control(page.render(), "自定义提及昵称").props.onChange({ target: { value: "@指定用户" } });
  button(page.render(), "高级").props.onClick();
  control(page.render(), "生成方式").props.onChange({ target: { value: "external" } });
  control(page.render(), "API Base URL").props.onChange({ target: { value: "https://example.com/v1" } });
  control(page.render(), "模型名称").props.onChange({ target: { value: "custom-model" } });
  control(page.render(), "API Key").props.onChange({ target: { value: "private-key" } });
  button(page.render(), "概览").props.onClick();
  await poll();
  assert.equal(control(page.render(), "每轮帖子数").props.value, 3, "poll preserves unsaved form");
  await all(page.render()).find((n) => n.type === "form").props.onSubmit({ preventDefault() {} });
  assert.equal(server.config.enabled, true);
  assert.equal(server.config.postsPerRound, 3);
  assert.equal(server.config.replyPersona, "认真倾听\n简洁回答");
  assert.equal(server.config.mentionName, "@指定用户");
  assert.equal(server.config.generationProvider, "external");
  assert.equal(control(page.render(), "API Key").props.value, "", "clear key field after save");
  button(page.render(), "编辑配置 JSON").props.onClick();
  const json = JSON.parse(control(page.render(), "配置 JSON").props.value);
  assert.equal(json.apiKey, undefined);
  control(page.render(), "配置 JSON").props.onChange({ target: { value: JSON.stringify({ ...json, persona: "从 JSON 修改" }) } });
  await button(page.render(), "保存配置文件").props.onClick();
  assert.equal(control(page.render(), "通用人设与兴趣").props.value, "从 JSON 修改");
  assert.equal(typeof server.config.postsPerRound, "number");
  assert.deepEqual(server.config.valleyWindows, defaults.valleyWindows);
  assert.equal(button(page.render(), "立即执行一轮").props.disabled, false);

  button(page.render(), "峰谷").props.onClick();
  button(page.render(), "峰底快捷方案").props.onClick();
  assert.equal(control(page.render(), "按自定义时段运行").props.checked, true);
  assert.equal(control(page.render(), "工作日时段结束 1").props.value, "06:00");
  control(page.render(), "工作日时段开始 1").props.onChange({ target: { value: "22:30" } });
  control(page.render(), "工作日时段结束 1").props.onChange({ target: { value: "05:15" } });
  button(page.render(), "周末时段不运行").props.onClick();
  button(page.render(), "节假日时段全天").props.onClick();
  await poll();
  assert.equal(control(page.render(), "工作日时段开始 1").props.value, "22:30");
  await all(page.render()).find((n) => n.type === "form").props.onSubmit({ preventDefault() {} });
  assert.deepEqual(server.config.valleyWindows, [[1350, 315]]);
  assert.deepEqual(server.config.weekendWindows, []);
  assert.deepEqual(server.config.holidayWindows, [[0, 1440]]);
  button(page.render(), "不限时段").props.onClick();
  assert.equal(control(page.render(), "按自定义时段运行").props.checked, false);
  assert.equal(control(page.render(), "工作日时段开始 1").props.value, "22:30");
  button(page.render(), "峰谷快捷方案").props.onClick();
  assert.equal(control(page.render(), "工作日时段开始 2").props.value, "18:00");
  assert.equal(control(page.render(), "周末时段结束 1").props.value, "00:00");
  await all(page.render()).find((n) => n.type === "form").props.onSubmit({ preventDefault() {} });
  assert.deepEqual(server.config.valleyWindows, defaults.valleyWindows);

  failSave = true;
  await all(page.render()).find((n) => n.type === "form").props.onSubmit({ preventDefault() {} });
  assert.ok(text(page.render()).includes("配置保存失败"));
  await poll();
  assert.ok(text(page.render()).includes("配置保存失败"), "successful polls do not hide action errors");
  failSave = false;
  await button(page.render(), "立即执行一轮").props.onClick();
  assert.equal(button(page.render(), "保存设置").props.disabled, true);
  await button(page.render(), "停止任务").props.onClick();
  assert.deepEqual(requests.filter((r) => r.body?.action === "configure").at(-1).body.config, { enabled: false });

  control(page.render(), "Cookie").props.onChange({ target: { value: "heybox_id=123; user_pkey=secret" } });
  await button(page.render(), "保存账号").props.onClick();
  assert.equal(control(page.render(), "Cookie").props.value, "", "clear cookie after host saves");
  assert.equal(requests.filter((r) => r.body?.action === "login").at(-1).body.cookie, "heybox_id=123; user_pkey=secret");
  await button(page.render(), "一键安装依赖").props.onClick();
  assert.equal(button(page.render(), "正在安装依赖…").props.disabled, true);
  dependencies = { ...dependencies, installing: false, qrReady: true, logs: ["依赖安装完成"] };
  server.interactions = [
    { at: Date.now(), kind: "comment", status: "sent", postId: "1", text: "@作者 测试评论正文" },
    { at: Date.now(), kind: "reply", status: "unknown", postId: "2", text: "测试回复正文", incoming: "对方的问题" },
  ];
  await poll();
  button(page.render(), "评论记录").props.onClick();
  assert.ok(text(page.render()).includes("@作者 测试评论正文"));
  button(page.render(), "评论回复").props.onClick();
  assert.ok(text(page.render()).includes("测试回复正文"));
  assert.ok(text(page.render()).includes("对方的问题"));
  assert.ok(!text(page.render()).includes("@作者 测试评论正文"));
  page.unmount();
  assert.equal(timers.size, 0, "poll timer cleaned up");
  assert.ok(styles.at(-1).removed);

  server.history = [
    { at: Date.now(), type: "browse", message: "已读取帖子", title: "示例帖子", postId: "123" },
    { at: Date.now(), type: "error", message: "示例失败" },
  ];
  const watched = harness();
  watched.mount("conversation.view");
  await settle();
  tree = watched.render();
  assert.ok(text(tree).includes("示例帖子"));
  assert.ok(!text(tree).includes("示例失败"));
  assert.ok(!text(tree).includes("已读取帖子"), "watched list omits redundant event message");
  assert.equal(all(tree).find((n) => n.type === "a").props.href, "https://www.xiaoheihe.cn/app/bbs/link/123");
  assert.ok(requests.some((r) => r.url.includes("/heybox/watched?offset=0&limit=50")));
  assert.ok(text(tree).includes("共 1 帖"));
  watched.unmount();
  assert.equal(timers.size, 0);

  // Settings continue to register when an older DSH host lacks conversation.view.
  const fallback = bundle.factory(() => ({ createElement() {} }));
  let settingsRegistered = false;
  fallback.apply({ effect() {}, slots: { inject(name, fn) { if (name === "conversation.view") throw new Error("unsupported slot"); fn(); }, register(desc) { settingsRegistered = desc.name === "settings.section"; } } });
  assert.ok(settingsRegistered);
  console.log("client settings/view registration, save, polling, stop, account and cleanup tests passed");
} finally {
  global.setInterval = nativeInterval;
  global.clearInterval = nativeClear;
}
