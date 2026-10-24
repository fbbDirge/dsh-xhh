import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Automation, defaults, validateConfig, inValley, mentionText, commentText } from "../lib/automation.js";
import { parseDecision } from "../lib/generator.js";

function fixture(t, overrides = {}) {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),"heybox-test-"));
  t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  let time=Date.parse("2026-10-23T12:00:00Z");
  const sent=[];
  const account={id:"7",identity:"test",cookie:"never-in-prompt"};
  const api=async (_account, endpoint, params, method, form)=> {
    if(method==="POST") {sent.push(form);return {status:"ok",commentid:String(100+sent.length)};}
    if(endpoint.endsWith("/feeds")) return {result:{links:[1,2,3].slice(+params.offset).map((linkid)=>({linkid}))}};
    if(endpoint.endsWith("/tree")) return {result:{link:{linkid:params.link_id,title:"游戏体验",text:"剧情与关卡值得讨论",user:{userid:8,username:"作者"}},comments:[]}};
    return {result:{messages:[]}};
  };
  const worker=new Automation({directory,account:()=>account,api,generate:async ()=>({action:"send",text:"这个关卡设计挺有意思。"}),now:()=>time,wait:async(ms)=>{time+=ms;},...overrides});
  return {worker,sent,directory,account,advance:(ms)=>{time+=ms;}};
}

test("configuration rejects coercion, unknown fields and invalid windows",()=>{
  for(const patch of [{enabled:"true"},{postsPerRound:0},{cooldownSeconds:0},{force:true},{intervalMinutes:1.5},{valleyWindows:[[900,900]]},{timeZone:"bad"}]) assert.throws(()=>validateConfig(patch));
  assert.equal(validateConfig({postsPerRound:3}).postsPerRound,3);
  assert.equal(validateConfig({ replyPersona: "理性讨论\n不编造经历" }).replyPersona, "理性讨论\n不编造经历");
  assert.throws(() => validateConfig({ replyPersona: 123 }));
  assert.throws(() => validateConfig({ replyPersona: "x".repeat(2001) }));
  assert.throws(() => validateConfig({ replyPersona: "bad\0" }));
});
test("valley uses Shanghai boundary, weekend and workday override",()=>{
  assert.equal(inValley(Date.parse("2026-10-23T03:59:00Z"),defaults),false);
  assert.equal(inValley(Date.parse("2026-10-23T04:00:00Z"),defaults),true);
  assert.equal(inValley(Date.parse("2026-10-23T06:00:00Z"),defaults),false);
  assert.equal(inValley(Date.parse("2026-10-23T16:30:00Z"),defaults),true);
  const noon=Date.parse("2026-10-24T02:00:00Z");
  assert.equal(inValley(noon,defaults),true);
  assert.equal(inValley(noon,{...defaults,workdays:["2026-10-24"]}),false);
});
test("mention targets current author, invalid identities stop sending",()=>{
  assert.equal(mentionText({userid:8,username:"作者"},"正文"),"@作者 正文");
  assert.throws(()=>mentionText({username:"作者"},"正文"));
});
test("custom mentions are added by host and modes survive restart", async (t) => {
  const { worker, sent, directory } = fixture(t);
  worker.configure({ enabled: true, autoComment: true, mentionTarget: "custom", mentionName: "指定用户" });
  await worker.run();
  assert.equal(sent[0].text, "@指定用户 这个关卡设计挺有意思。");
  const next = new Automation({ directory, account: worker.account });
  assert.equal(next.status().config.mentionName, "指定用户");
  assert.equal(commentText({ ...defaults, mentionTarget: "none" }, null, "正文"), "正文");
  assert.equal(commentText({ ...defaults, mentionAuthor: false, mentionTarget: "custom" }, null, "正文"), "正文");
  assert.equal(validateConfig({ mentionTarget: "custom", mentionName: " @指定用户 " }).mentionName, "指定用户");
  for (const mentionName of ["", "@@用户", "用\n户", "<用户>"]) assert.throws(() => validateConfig({ mentionTarget: "custom", mentionName }));
});
test("separate editable config preserves history and redacts keys", async (t) => {
  const { worker, directory } = fixture(t);
  worker.configure({ enabled: true, postsPerRound: 2, apiKey: "private-test-key" });
  await worker.run();
  const before = worker.watched();
  const config = JSON.parse(fs.readFileSync(worker.configFile, "utf8"));
  assert.equal(fs.statSync(worker.configFile).mode & 0o777, 0o600);
  assert.equal(config.apiKey, "private-test-key");
  assert.ok(!JSON.stringify(worker.status()).includes("private-test-key"));
  assert.ok(!fs.readFileSync(worker.file, "utf8").includes("private-test-key"));
  fs.writeFileSync(worker.configFile, JSON.stringify({ ...config, persona: "文件修改的人格", intervalMinutes: 45 }));
  worker.reload();
  assert.equal(worker.status().config.persona, "文件修改的人格");
  worker.configure({ dailyComments: 2 });
  assert.equal(worker.data.config.apiKey, "private-test-key");
  const next = new Automation({ directory, account: worker.account });
  assert.deepEqual(next.watched(), before);
  assert.equal(next.status().config.intervalMinutes, 45);
  assert.equal(next.status().apiKeyConfigured, true);
  next.configure({ apiKey: "" });
  assert.equal(next.status().apiKeyConfigured, false);
  for (const patch of [{ apiBaseUrl: "http://example.com/v1" }, { apiBaseUrl: "https://user:secret@example.com" }, { apiKey: "key\n" }, { generationProvider: "external" }]) assert.throws(() => validateConfig(patch));
});
test("model accepts only bounded structured content",()=>{
  assert.equal(parseDecision('{"action":"skip"}').action,"skip");
  assert.equal(parseDecision('```json\n{"action":"send","text":"评论"}\n```').text,"评论");
  for(const text of ['日志\n{"action":"skip"}','{"action":"send","text":"@其他人"}','{"action":"send","text":"<script>"}','{"action":"force"}']) assert.throws(()=>parseDecision(text));
});
test("timer waits until due, reads chosen batch and never overlaps",async(t)=>{
  const {worker,sent,advance}=fixture(t);
  worker.configure({enabled:true,autoComment:true,postsPerRound:2});
  await worker.tick(); assert.equal(sent.length,0);
  advance(30*60000); const run=worker.tick();
  await worker.tick(); await run;
  assert.equal(sent.length,2);
  assert.equal(sent[0].text,"@作者 这个关卡设计挺有意思。");
  assert.equal(worker.status().usage.comment,2);
  assert.equal(worker.status().history.filter((v)=>v.type==="browse").length,2);
  assert.equal(worker.status().interactions[0].text, sent[0].text);
  assert.equal(worker.status().interactions[0].status, "sent");
});
test("budget applies to manual rounds; per-post dedup survives restart",async(t)=>{
  const {worker,sent,directory}=fixture(t);
  worker.configure({enabled:true,autoComment:true,dailyComments:1,postsPerRound:2});
  await worker.run(); await worker.run();
  assert.equal(sent.length,1);
  const reopened=new Automation({directory,account:worker.account,api:worker.api,generate:worker.generate,now:worker.now,wait:worker.wait});
  assert.equal(reopened.status().interactions[0].text, sent[0].text);
  await reopened.run(); assert.equal(sent.length,1);
});
test("watched archive survives event rotation, retry, upgrade and stays isolated from bili files", async (t) => {
  const { worker, directory } = fixture(t);
  const bili = path.join(directory, "..", path.basename(directory) + "-bili-duty");
  fs.mkdirSync(bili);
  t.after(() => fs.rmSync(bili, { recursive: true, force: true }));
  const seenFile = path.join(bili, "seen.md");
  const original = "- 2026-10-24 · BV1dsn86FEKB · 标题 · 挑中（值得看）\n";
  fs.writeFileSync(seenFile, original);
  worker.configure({ enabled: true, postsPerRound: 2 });
  await worker.run();
  for (let i = 0; i < 205; i++) worker.log("done", "event");
  assert.equal(worker.status().history.some((v) => v.type === "browse"), false);
  assert.equal(worker.watched().total, 2);
  worker.data.accounts[7].seen = {};
  worker.save();
  const reopened = new Automation({ directory, account: worker.account });
  assert.equal(reopened.watched().total, 2);
  assert.equal(reopened.watched({ limit: 1, offset: 1 }).records.length, 1);
  assert.equal(reopened.watched().records[0].title, "游戏体验");
  assert.throws(() => reopened.watched({ limit: 101 }));
  reopened.account = () => ({ id: "other" });
  assert.equal(reopened.watched().total, 0);
  assert.equal(fs.readFileSync(seenFile, "utf8"), original);

  const legacy = JSON.parse(fs.readFileSync(worker.file, "utf8"));
  delete legacy.accounts[7].watched;
  legacy.accounts[7].seen = { "1": 100, "2": 200 };
  legacy.history = [{ type: "browse", postId: "1", at: 100, title: "恢复的标题" }];
  fs.writeFileSync(worker.file, JSON.stringify(legacy));
  const migrated = new Automation({ directory, account: worker.account });
  assert.equal(migrated.watched().total, 2);
  assert.equal(migrated.watched().records.find((v) => v.postId === "1").title, "恢复的标题");
  assert.equal(migrated.watched().records.find((v) => v.postId === "2").title, "");
});
test("network ambiguity consumes quota and prevents retry",async(t)=>{
  let attempts=0;
  const {worker}=fixture(t);
  const read=worker.api;
  worker.api=async(...args)=>{if(args[3]==="POST"){attempts++;throw new Error("timeout");}return read(...args);};
  worker.configure({enabled:true,autoComment:true});
  await worker.run();
  assert.equal(worker.data.accounts[7].actions["post:1"].status,"unknown");
  assert.equal(worker.status().usage.comment,1);
  assert.equal(worker.status().interactions[0].status, "unknown");
  assert.ok(worker.status().interactions[0].text.includes("这个关卡"));
  worker.data.accounts[7].seen={}; worker.data.accounts[7].offset=0; worker.save();
  await worker.run(); assert.equal(attempts,1);
});
test("stop during generation blocks send; a second host cannot run",async(t)=>{
  let release, started;
  const ready=new Promise((r)=>{started=r;});
  const {worker,sent,directory}=fixture(t,{generate:async()=>{started();return new Promise((r)=>{release=r;});}});
  worker.configure({enabled:true,autoComment:true});
  const running=worker.run(); await ready;
  const other=new Automation({directory,account:worker.account,api:worker.api});
  assert.throws(()=>other.run(),/另一个任务/);
  worker.configure({enabled:false}); release({action:"send",text:"取消后的评论"}); await running;
  assert.equal(sent.length,0); assert.equal(worker.status().nextRunAt,null);
});
test("account changes during generation block send",async(t)=>{
  const f=fixture(t);
  f.worker.generate=async()=>{f.account.identity="changed";return {action:"send",text:"正文"};};
  f.worker.configure({enabled:true,autoComment:true});await f.worker.run();assert.equal(f.sent.length,0);
});
test("replies require an actual parent belonging to us and use incoming/root IDs",async(t)=>{
  const {worker,sent}=fixture(t);
  const read=worker.api;
  worker.api=async(...args)=>{
    if(args[1].endsWith("/message")) return {result:{messages:[
      {comment_a_id:91,root_comment_id:90,linkid:1},
      {comment_a_id:92,root_comment_id:90,linkid:1},
    ]}};
    if(args[1].endsWith("/tree")) {
      const result=await read(...args);
      result.result.comments=[{comment:[
        {commentid:90,user:{userid:7},text:"我的评论"},
        {commentid:91,reply_id:90,user:{userid:8},text:"你觉得结局怎么样？"},
        {commentid:92,reply_id:93,user:{userid:9},text:"别人的对话"},
      ]}];return result;
    }
    return read(...args);
  };
  worker.configure({enabled:true,autoReply:true,repliesPerRound:5,dailyComments:0});
  await worker.run();
  assert.equal(sent.length,1); assert.equal(sent[0].reply_id,"91"); assert.equal(sent[0].root_id,"90");
  assert.equal(worker.status().usage.reply,1);
  assert.equal(worker.status().interactions[0].incoming, "你觉得结局怎么样？");
  assert.equal(worker.status().interactions[0].kind, "reply");
  await worker.run();assert.equal(sent.length,1);
});

test("old configs gain reply persona; interaction records are isolated by account and bounded", (t) => {
  const { worker, account, directory } = fixture(t);
  const oldConfig = { ...defaults }; delete oldConfig.replyPersona;
  const actions = Object.fromEntries(Array.from({ length: 110 }, (_, i) => ["post:" + i, { status: "sent", at: i, postId: String(i), text: "正文" + i }]));
  actions["reply:old"] = { status: "unknown", at: 111, postId: "1" };
  fs.writeFileSync(worker.file, JSON.stringify({ config: oldConfig, accounts: { "7": { actions } }, history: [] }));
  const reopened = new Automation({ directory, account: () => account, api: worker.api });
  assert.equal(reopened.status().config.replyPersona, "");
  assert.equal(reopened.status().interactions.length, 100);
  assert.equal(reopened.status().interactions[0].kind, "reply");
  assert.equal(reopened.status().interactions[0].text, undefined);
  account.id = "8";
  assert.deepEqual(reopened.status().interactions, []);
});
test("read-only mode needs no model and no send",async(t)=>{
  const {worker,sent}=fixture(t,{generate:async()=>{throw new Error("must not generate");}});
  worker.configure({enabled:true,postsPerRound:3});await worker.run();
  assert.equal(sent.length,0);assert.equal(worker.status().history.filter((v)=>v.type==="browse").length,3);
});
test("corrupt state fails closed",(t)=>{
  const {directory,worker}=fixture(t);
  fs.writeFileSync(worker.file,"broken");
  const next=new Automation({directory,account:worker.account,api:worker.api});
  assert.ok(next.status().fault); assert.throws(()=>next.configure({enabled:true}));
});

test("temporary generation failure retries the same post without consuming send quota",async(t)=>{
  const {worker,sent}=fixture(t);
  const generate=worker.generate;
  worker.generate=async()=>{throw new Error("model unavailable");};
  worker.configure({enabled:true,autoComment:true});await worker.run();
  assert.equal(worker.status().usage.comment,0);
  worker.generate=generate;await worker.run();
  assert.equal(sent.length,1);assert.equal(sent[0].link_id,"1");
});
