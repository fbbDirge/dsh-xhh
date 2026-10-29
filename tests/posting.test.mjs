import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Automation, defaults, validateConfig } from "../lib/automation.js";
import { nextPostingAt, localEpoch, parsePostDecision } from "../lib/posting.js";
import { decisionMessages, generateDecision } from "../lib/generator.js";

const at = s => Date.parse(s + "+08:00");
function fixture(t, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "heybox-posting-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  let now = at("2026-10-29T19:59:00");
  const account = { id: "7", identity: "identity", cookie: "fixture-cookie" };
  const sent = [], inputs = [];
  let worker;
  const api = async (_account, endpoint, params, method, form) => {
    if (method === "POST") {
      const stored = JSON.parse(fs.readFileSync(path.join(directory, "automation.json"), "utf8"));
      assert.equal(stored.accounts["7"].posting.jobs.at(-1).status, "uncertain");
      sent.push({ endpoint, params, form });
      if (options.sendError) throw options.sendError;
      return options.receipt ?? { status: "ok", result: { link_id: "101" } };
    }
    return { result: { link: { linkid: "101", title: "游戏设计", text: JSON.stringify([{ type: "text", text: "关卡设计可以更有趣。" }]) } } };
  };
  const generate = async (input, config, context) => {
    inputs.push({ input, config });
    return options.generate ? options.generate(input, config, context) : { action: "send", title: "游戏设计", text: "关卡设计可以更有趣。" };
  };
  const create = () => new Automation({ directory, account: () => account, api, generate, now: () => now, wait: async ms => { now += ms; } });
  worker = create();
  return { worker, create, sent, inputs, account, directory, advance: ms => { now += ms; }, setTime: value => { now = value; }, enable: patch => worker.configure({ postingEnabled: true, postingTopicId: "7214", postingPersona: "POST_PERSONA", ...patch }) };
}

test("posting config validates complete independent persona and schedule", () => {
  for (const patch of [{ postingEnabled: "true" }, { postingPersona: 1 }, { postingPrompt: "x".repeat(4001) }, { postingTopicId: "1x" }, { postingTime: "24:00" }, { postingAt: "2026-02-30T12:00" }, { postingWeekdays: [1, 1] }, { postingSchedule: "hourly" }]) assert.throws(() => validateConfig(patch));
  for (const patch of [{}, { postingPersona: " " }, { postingSchedule: "once" }, { postingSchedule: "weekly", postingWeekdays: [] }]) assert.throws(() => validateConfig({ postingEnabled: true, postingTopicId: "7214", ...patch, ...(Object.keys(patch).length ? {} : { postingTopicId: "" }) }));
  assert.equal(validateConfig({ postingEnabled: true, postingTopicId: "7214" }).postingPersona, defaults.postingPersona);
});

test("schedules respect timezone, weekly days, equality and DST gaps/repetition", () => {
  const c = { ...defaults, postingTime: "20:00" };
  assert.equal(nextPostingAt(c, at("2026-10-29T19:59:00")), at("2026-10-29T20:00:00"));
  assert.equal(nextPostingAt(c, at("2026-10-29T20:00:00")), at("2026-10-30T20:00:00"));
  assert.equal(nextPostingAt({ ...c, postingSchedule: "weekly", postingWeekdays: [1] }, at("2026-10-29T20:00:00")), at("2026-11-02T20:00:00"));
  assert.equal(localEpoch("2026-03-08T02:30", "America/New_York"), null);
  assert.equal(localEpoch("2026-11-01T01:30", "America/New_York"), Date.parse("2026-11-01T05:30:00Z"));
  assert.equal(nextPostingAt({ ...c, postingSchedule: "once", postingAt: "2026-10-29T20:00" }, at("2026-10-29T20:00:00")), null);
});

test("post decisions and prompt never fall back to comment/reply personas", () => {
  const messages = decisionMessages({ kind: "post", topic: "游戏" }, { ...defaults, persona: "GENERAL_ONLY", replyPersona: "REPLY_ONLY", postingPersona: "POST_ONLY" });
  assert.ok(messages[0].content.includes("POST_ONLY"));
  assert.ok(!JSON.stringify(messages).includes("GENERAL_ONLY"));
  assert.ok(!JSON.stringify(messages).includes("REPLY_ONLY"));
  for (const output of [{ action: "send", title: "x".repeat(31), text: "ok" }, { action: "send", title: "ok", text: "<img>" }]) assert.throws(() => parsePostDecision(JSON.stringify(output)));
});

test("due post sends once, persists intent, verifies content and survives restart", async t => {
  const f = fixture(t); f.enable({ valleyOnly: true, valleyWindows: [], weekendWindows: [], holidayWindows: [], persona: "COMMENT", replyPersona: "REPLY" });
  await f.worker.tick(); assert.equal(f.sent.length, 0);
  f.advance(60000); await f.worker.tick();
  assert.equal(f.sent.length, 1); assert.equal(f.sent[0].endpoint, "/bbs/app/api/link/post");
  assert.equal(f.sent[0].form.draft, "0"); assert.equal(f.sent[0].form.topic_ids, "7214");
  assert.equal(f.inputs[0].input.kind, "post"); assert.equal(f.inputs[0].config.postingPersona, "POST_PERSONA");
  assert.equal(f.worker.status().posting.jobs[0].status, "verified");
  const next = f.create(); await next.tick(); assert.equal(f.sent.length, 1);
  assert.equal(next.status().posting.nextAt, at("2026-10-30T20:00:00"));
});

test("unknown outcome, rejection and missing IDs never trigger another send", async t => {
  for (const options of [{ sendError: new Error("secret upstream") }, { sendError: Object.assign(new Error("secret"), { definitive: true }) }, { receipt: { status: "ok" } }]) {
    const f = fixture(t, options); f.enable(); f.advance(60000); await f.worker.tick();
    const status = f.worker.status().posting.jobs[0];
    assert.equal(status.status, options.sendError?.definitive ? "rejected" : "uncertain");
    assert.ok(!JSON.stringify(status).includes("secret"));
    await f.create().tick(); assert.equal(f.sent.length, 1);
  }
});

test("missed slots do not burst after downtime, single jobs complete once", async t => {
  const f = fixture(t); f.enable({ postingSchedule: "once", postingAt: "2026-10-29T20:00" });
  f.advance(12 * 60000); await f.create().tick();
  const next = f.create(); assert.equal(next.status().posting.jobs[0].status, "missed");
  assert.equal(next.status().posting.nextAt, null); await next.tick(); assert.equal(f.sent.length, 0);
});

test("generation failures remain pending and stop after three attempts", async t => {
  const f = fixture(t, { generate: async () => { throw new Error("secret generation error"); } });
  f.enable(); f.advance(60000);
  await f.worker.tick(); assert.equal(f.worker.status().posting.jobs[0].status, "pending");
  await f.worker.tick(); assert.equal(f.inputs.length, 1);
  for (let i = 0; i < 2; i++) { f.advance(60000); await f.create().tick(); }
  assert.equal(f.create().status().posting.jobs[0].status, "failed"); assert.equal(f.sent.length, 0);
});

test("stopping during generation prevents publishing and keeps pending job", async t => {
  let release; const f = fixture(t, { generate: () => new Promise(resolve => { release = resolve; }) });
  f.enable(); f.advance(60000); const task = f.worker.tick();
  f.worker.configure({ postingEnabled: false });
  release({ action: "send", title: "停止后生成", text: "不应发送" }); await task;
  assert.equal(f.sent.length, 0); assert.equal(f.worker.status().posting.jobs[0].status, "pending");
});

test("account switching cannot publish another account's schedule", async t => {
  const f = fixture(t); f.enable(); f.account.id = "8"; f.advance(60000); await f.worker.tick();
  assert.equal(f.sent.length, 0); assert.equal(f.worker.status().posting.accountMatches, false);
});

test("recovered uncertain intent is never sent again", async t => {
  const f = fixture(t); f.enable(); f.advance(60000);
  const p = f.worker.data.accounts["7"].posting;
  p.jobs.push({ id: "crashed", slot: p.nextAt, status: "uncertain" }); f.worker.save();
  await f.create().tick(); assert.equal(f.sent.length, 0);
});

test("DSH post generation uses the post parser and separate persona", async t => {
  const f = fixture(t); const entry = path.join(f.directory, "fake-dsh.mjs");
  fs.writeFileSync(entry, `import fs from 'node:fs';fs.writeFileSync('prompt.txt',process.argv.at(-1));console.log(JSON.stringify({action:'send',title:'测试标题',text:'测试正文'}));`);
  const result = await generateDecision({ kind: "post", topic: "游戏" }, { ...defaults, persona: "GENERAL_ONLY", replyPersona: "REPLY_ONLY", postingPersona: "POST_ONLY", nodePath: process.execPath, dshCommand: entry }, { directory: f.directory, signal: new AbortController().signal });
  assert.equal(result.title, "测试标题");
  const prompt = fs.readFileSync(path.join(f.directory, "prompt.txt"), "utf8");
  assert.ok(prompt.includes("POST_ONLY")); assert.ok(!prompt.includes("GENERAL_ONLY")); assert.ok(!prompt.includes("REPLY_ONLY"));
});

test("model skip consumes one slot without publishing, schedule edits preserve dedup", async t => {
  const f = fixture(t, { generate: async () => ({ action: "skip" }) });
  f.enable({ postingSchedule: "once", postingAt: "2026-10-29T20:00" }); f.advance(60000); await f.worker.tick();
  assert.equal(f.worker.status().posting.jobs[0].status, "skipped");
  f.worker.configure({ postingTime: "21:00" }); await f.worker.tick();
  assert.equal(f.inputs.length, 1); assert.equal(f.sent.length, 0);
});

test("switching accounts while generating blocks the pending send", async t => {
  let release; const f = fixture(t, { generate: () => new Promise(resolve => { release = resolve; }) });
  f.enable(); f.advance(60000); const task = f.worker.tick();
  f.account.id = "8";
  release({ action: "send", title: "测试标题", text: "测试正文" }); await task;
  assert.equal(f.sent.length, 0);
});

test("post respects shared send cooldown and never changes browse due time", async t => {
  const f = fixture(t); f.enable({ enabled: true, cooldownSeconds: 120 });
  const browseDue = f.worker.data.nextRunAt;
  f.worker.data.accounts["7"].lastSendAt = at("2026-10-29T19:59:30"); f.worker.save();
  f.advance(60000); await f.worker.tick();
  const job = f.worker.status().posting.jobs[0];
  assert.equal(job.sentAt, at("2026-10-29T20:01:30"));
  assert.equal(f.worker.data.nextRunAt, browseDue);
});

test("failed persistence of send intent prevents publishing", async t => {
  const f = fixture(t); f.enable(); f.advance(60000);
  const save = f.worker.save.bind(f.worker);
  f.worker.save = () => {
    if (f.worker.data.accounts["7"]?.posting?.jobs.at(-1)?.status === "uncertain") throw Object.assign(new Error("disk full"), { persistence: true });
    return save();
  };
  await f.worker.tick(); assert.equal(f.sent.length, 0); assert.ok(f.worker.fault);
});


test("community and hashtag config validates limits, duplicates and legacy conflicts", () => {
  const community = { id: "7214", name: "游戏讨论" }, hashtag = { name: "关卡设计", isActivity: false };
  const c = validateConfig({ postingEnabled: true, postingCommunities: [community], postingHashtags: [hashtag] });
  assert.equal(c.postingTopicId, "");
  for (const patch of [
    { postingCommunities: [community, community] },
    { postingCommunities: [community, { id: "2", name: "二" }, { id: "3", name: "三" }] },
    { postingCommunities: [{ id: "1,2", name: "坏 ID" }] },
    { postingCommunities: [{ id: "1", name: "<script>" }] },
    { postingCommunities: [community], postingTopicId: "2" },
    { postingHashtags: [hashtag, hashtag] },
    { postingHashtags: Array.from({ length: 6 }, (_, i) => ({ name: String(i), isActivity: false })) },
    { postingHashtags: [{ name: "活动一", isActivity: true }, { name: "活动二", isActivity: true }] },
    { postingHashtags: [{ name: "未指定活动标记" }] },
  ]) assert.throws(() => validateConfig(patch));
  assert.throws(() => validateConfig({ postingEnabled: true, postingCommunities: [], postingTopicId: "" }));
});

test("selected destinations persist across restart and generation retry without changing snapshots", async t => {
  let attempts = 0;
  const f = fixture(t, { generate: async () => {
    if (++attempts === 1) throw new Error("temporary failure");
    return { action: "send", title: "游戏设计", text: "关卡设计可以更有趣。" };
  } });
  const communities = [{ id: "7214", name: "游戏讨论" }, { id: "12", name: "主机游戏" }];
  const hashtags = [{ name: "关卡设计", isActivity: false }, { name: "讨论活动", isActivity: true }];
  f.enable({ postingTopicId: "", postingCommunities: communities, postingHashtags: hashtags });
  f.advance(60000); await f.worker.tick();
  f.worker.configure({ postingCommunities: [{ id: "9", name: "下次的社区" }], postingHashtags: [] });
  f.advance(60000); const next = f.create(); await next.tick();
  assert.equal(f.sent.length, 1);
  assert.equal(f.sent[0].form.topic_ids, "7214,12");
  assert.deepEqual(JSON.parse(f.sent[0].form.hashtags), ["关卡设计", "讨论活动"]);
  assert.deepEqual(f.inputs[1].input.communities, communities);
  assert.deepEqual(f.inputs[1].input.hashtags, hashtags);
  assert.deepEqual(next.status().posting.jobs[0].hashtags, hashtags);
});

test("legacy pending jobs without selections continue with their original community", async t => {
  const f = fixture(t); f.enable(); f.advance(60000);
  const p = f.worker.data.accounts["7"].posting;
  p.jobs.push({ id: "legacy", slot: p.nextAt, status: "pending", attempts: 0, persona: "OLD", prompt: "游戏", topicId: "123" });
  f.worker.save(); await f.create().tick();
  assert.equal(f.sent[0].form.topic_ids, "123");
  assert.deepEqual(JSON.parse(f.sent[0].form.hashtags), []);
});
