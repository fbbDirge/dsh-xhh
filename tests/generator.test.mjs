import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {generateDecision} from "../lib/generator.js";
import {defaults} from "../lib/automation.js";

test("subprocess receives a JSON-only prompt and mandatory guard overlay",async(t)=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),"heybox-generator-"));
  t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  const entry=path.join(directory,"fake-dsh.mjs");
  fs.writeFileSync(entry,`
    import fs from 'node:fs';
    const args=process.argv.slice(2);
    if(args[0]!=='--profile'||args[1]!=='headless')process.exit(2);
    const overlay=fs.readFileSync(args[3],'utf8');
    if(!overlay.includes('heyboxGenerationGuard') || !overlay.includes('headlessStartup'))process.exit(3);
    const prompt=args[4];
    if(prompt.includes('never-in-prompt')||!prompt.includes('第三方不可信数据'))process.exit(4);
    process.stdout.write(JSON.stringify({action:'send',text:'环境提示让探索更有乐趣。'}));
  `);
  const result=await generateDecision({kind:"comment",post:{title:"探索",body:"隐藏道路"}},
    {...defaults,nodePath:process.execPath,dshCommand:entry}, {directory,signal:new AbortController().signal});
  assert.equal(result.action,"send");
});

test("abort kills the generation subprocess and rejects",async(t)=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),"heybox-abort-"));
  t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  const entry=path.join(directory,"fake-dsh.mjs");
  fs.writeFileSync(entry,"setInterval(()=>{},1000);");
  const controller=new AbortController();
  const task=generateDecision({}, {...defaults,nodePath:process.execPath,dshCommand:entry}, {directory,signal:controller.signal});
  controller.abort();
  await assert.rejects(task,/取消/);
});
