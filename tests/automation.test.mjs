import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Automation, defaults, validateConfig, inValley, mentionText } from "../lib/automation.js";
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
});
test("budget applies to manual rounds; per-post dedup survives restart",async(t)=>{
  const {worker,sent,directory}=fixture(t);
  worker.configure({enabled:true,autoComment:true,dailyComments:1,postsPerRound:2});
  await worker.run(); await worker.run();
  assert.equal(sent.length,1);
  const reopened=new Automation({directory,account:worker.account,api:worker.api,generate:worker.generate,now:worker.now,wait:worker.wait});
  await reopened.run(); assert.equal(sent.length,1);
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
  await worker.run();assert.equal(sent.length,1);
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
