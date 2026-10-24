/**
 * Smoke test: load the client bundle the way the DSH web app does
 * (window.__ModuleLoader__), with mocked require/document/ctx.
 * Run: node tests/client.smoke.mjs
 */
import fs from "node:fs";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const clientPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "lib", "client.js");
const code = fs.readFileSync(clientPath, "utf8");

// --- mocked browser-ish globals ---
const styleEl = { setAttribute() {}, remove() {} };
const fakeQueryable = {
  querySelector() { return null; },
  querySelectorAll() { return []; },
};
global.document = {
  createElement: () => styleEl,
  head: { append() {} },
  addEventListener() {},
  removeEventListener() {},
  querySelector: fakeQueryable.querySelector,
  querySelectorAll: fakeQueryable.querySelectorAll,
};
global.localStorage = {
  _m: {},
  getItem(k) { return this._m[k] ?? null; },
  setItem(k, v) { this._m[k] = String(v); },
  removeItem(k) { delete this._m[k]; },
};
global.window = {
  innerWidth: 1920,
  innerHeight: 1080,
  addEventListener() {},
  removeEventListener() {},
  open() {},
};

const noop = () => {};
const fakeReact = {
  useState: () => [undefined, noop],
  useEffect: noop,
  useRef: () => ({ current: null }),
  useCallback: (f) => f,
  createElement: () => ({}),
};

let loaded = null;
global.window.__ModuleLoader__ = {
  load(spec) { loaded = spec; },
};

const runner = new Function("window", "document", "localStorage", code);
runner(window, document, localStorage, code);

assert.ok(loaded, "bundle called __ModuleLoader__.load");
assert.equal(loaded.id, "heybox");

const moduleExports = loaded.factory((name) => {
  if (name === "react") return fakeReact;
  throw new Error("unexpected require: " + name);
});
assert.deepEqual(moduleExports.inject, ["slots"], "inject services");
assert.equal(typeof moduleExports.apply, "function", "apply exported");

// --- apply() registration flow ---
let injected = null;
let registered = null;
const fakeSlots = {
  inject(name, thunk) { injected = { name, thunk }; },
  register(desc, render) { registered = { desc, render }; return "ok"; },
};
const effects = [];
const ctx = {
  effect(fn) { effects.push(fn); },
  get(name) { return name === "slots" ? fakeSlots : undefined; },
};
moduleExports.apply(ctx);
assert.equal(effects.length, 1, "stylesheet effect registered");
effects[0](); // run it
assert.ok(styleEl.textContent && styleEl.textContent.includes(".hx2"), "CSS injected");
assert.ok(injected && injected.name === "shell.overlay", "slots.inject('shell.overlay')");
const registerResult = injected.thunk();
assert.ok(registered && registered.desc.id === "heybox", "slot id heybox");
assert.equal(typeof registered.render, "function", "seat render component provided");
assert.equal(registerResult, "ok", "slots.register returns a stop handle");

console.log("client bundle smoke test passed ✔");

// Render the actual settings branch with a small hook harness, then exercise controls.
const states = [];
let hookIndex = 0;
const interactiveReact = {
  ...fakeReact,
  createElement: (type, props, ...children) => ({type,props:props||{},children:children.flat(Infinity)}),
  useState(initial) {
    const i=hookIndex++;
    if (!(i in states)) states[i]=typeof initial==="function"?initial():initial;
    return [states[i], (v)=>{states[i]=typeof v==="function"?v(states[i]):v;}];
  },
  useRef: (value)=>({current:value}),
};
const interactiveModule=loaded.factory((name)=>{
  if(name==="react")return interactiveReact;
  throw new Error(name);
});
let renderSlot;
interactiveModule.apply({effect(){},get:()=>({inject:(_name,fn)=>fn(),register:(_desc,fn)=>{renderSlot=fn;}})});
const component=renderSlot({}).type;
function render(){hookIndex=0;return component({});}
function all(tree) {return tree && typeof tree==="object" ? [tree,...(tree.children||[]).flatMap(all)] : [];}
function button(tree,label){return all(tree).find((n)=>n.type==="button" && n.children.includes(label));}
render();
states[3]=true; // Explicitly expand the existing responsive panel.
let tree=render();
assert.ok(button(tree,"定时"));
button(tree,"定时").props.onClick();
const {defaults}=await import("../lib/automation.js");
states[9]={config:{...defaults},usage:{comment:0,reply:0},history:[],busy:false};
states[10]={...defaults};
tree=render();
const checkbox=all(tree).find((n)=>n.type==="input" && n.props["aria-label"]==="定时浏览总开关");
checkbox.props.onChange({target:{checked:true}});
const requests=[];
global.fetch=async(url,options)=>{
  const payload=JSON.parse(options.body);requests.push({url,...payload});
  return {json:async()=>({ok:true,...states[9],config:{...defaults,...payload.config}})};
};
const nativeSetTimeout=global.setTimeout;
global.setTimeout=()=>0;
try { await button(render(),"保存设置").props.onClick(); }
finally {global.setTimeout=nativeSetTimeout;}
assert.equal(requests[0].config.enabled,true);
assert.equal(requests[0].url,"/heybox/automation");
assert.ok(button(render(),"停止任务"));
assert.ok(all(render()).some((n)=>n.type==="input"&&n.props["aria-label"]==="每轮帖子数"));
console.log("automation settings interaction smoke test passed ✔");
