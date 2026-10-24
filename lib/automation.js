import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { generateDecision } from "./generator.js";

export const defaults = Object.freeze({
  enabled: false, intervalMinutes: 30, postsPerRound: 1,
  autoComment: false, mentionAuthor: true, autoReply: false, repliesPerRound: 1,
  dailyComments: 10, dailyReplies: 10, cooldownSeconds: 60,
  valleyOnly: false, timeZone: "Asia/Shanghai", valleyWindows: [[720, 840], [1080, 540]],
  holidays: [], workdays: [], persona: "友好、克制，关注游戏与数码，有内容再发言。",
  dshCommand: "dsh", nodePath: "", generationTimeoutSeconds: 180,
});

export function validateConfig(patch, previous = defaults) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new Error("配置必须是对象");
  const c = structuredClone(previous);
  for (const [key, value] of Object.entries(patch)) {
    if (!Object.hasOwn(defaults,key)) throw new Error(`未知设置：${key}`);
    c[key] = value;
  }
  for (const key of ["enabled", "autoComment", "autoReply", "mentionAuthor", "valleyOnly"]) {
    if (typeof c[key] !== "boolean") throw new Error(`${key} 必须是开关`);
  }
  for (const [key, min, max] of [["intervalMinutes",1,1440],["postsPerRound",1,10],["repliesPerRound",1,10],["dailyComments",0,100],["dailyReplies",0,100],["cooldownSeconds",10,3600],["generationTimeoutSeconds",10,600]]) {
    if (!Number.isInteger(c[key]) || c[key] < min || c[key] > max) throw new Error(`${key} 范围 ${min}–${max}`);
  }
  for (const key of ["persona", "dshCommand", "nodePath", "timeZone"]) {
    if (typeof c[key] !== "string" || c[key].length > 2000 || /[\n\r\0]/.test(c[key])) throw new Error(`${key} 无效`);
  }
  if (!c.dshCommand.trim()) throw new Error("DSH 命令不能为空");
  new Intl.DateTimeFormat("en", { timeZone: c.timeZone }).format();
  for (const key of ["holidays", "workdays"]) {
    if (!Array.isArray(c[key]) || c[key].length > 400 || c[key].some((d) => typeof d !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(d) || new Date(d).toISOString().slice(0,10) !== d)) throw new Error(`${key} 日期格式 YYYY-MM-DD`);
  }
  if (!Array.isArray(c.valleyWindows) || c.valleyWindows.length > 10 || c.valleyWindows.some((w) => !Array.isArray(w) || w.length !== 2 || w.some((m) => !Number.isInteger(m) || m < 0 || m > 1439) || w[0] === w[1])) throw new Error("谷时窗口使用 [起始分钟,结束分钟]，支持跨午夜");
  return c;
}

export function localTime(now, timeZone) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone, year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", hourCycle:"h23", weekday:"short" }).formatToParts(now).map((v) => [v.type,v.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, minute: +p.hour * 60 + +p.minute, weekend: ["Sat","Sun"].includes(p.weekday) };
}
export function inValley(now, config) {
  const t = localTime(now, config.timeZone);
  if (config.holidays.includes(t.day)) return true;
  if (t.weekend && !config.workdays.includes(t.day)) return true;
  return config.valleyWindows.some(([a,b]) => a < b ? t.minute >= a && t.minute < b : t.minute >= a || t.minute < b);
}

function atomicWrite(file, value) {
  const temp = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    const fd = fs.openSync(temp, "wx", 0o600);
    try { fs.writeFileSync(fd, JSON.stringify(value)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(temp, file);
  } finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
}
const id = (v) => v != null && /^\d+$/.test(String(v)) ? String(v) : null;
const userId = (u) => id(u?.userid ?? u?.heybox_id ?? u?.user_id);
export function mentionText(author, text) {
  const name = author?.username || author?.nickname;
  if (!userId(author) || typeof name !== "string" || !name.trim() || /[<>@\r\n]/.test(name) || name.length > 80) throw new Error("缺少可靠作者信息，跳过 @ 评论");
  // Official web editor submits plain text; notification semantics remain unverified.
  return `@${name.trim()} ${text}`;
}
function commentsFrom(result, rootHint) {
  const groups = result?.comments || result?.comment || [];
  return Array.isArray(groups) ? groups.flatMap((g) => {
    const items = Array.isArray(g.comment) ? g.comment : [g];
    const root = Array.isArray(g.comment) ? id(items[0]?.commentid) : rootHint;
    return items.map((c) => ({ ...c, threadRoot: root || id(c.root_comment_id ?? c.root_id) }));
  }) : [];
}
function postText(link) {
  let body = link?.text || link?.description || "";
  if (typeof body !== "string") body = JSON.stringify(body);
  return { title: String(link?.title || "").slice(0,400), body: body.replace(/<[^>]*>/g," ").slice(0,14000) };
}

export class Automation {
  constructor({ directory, account, api, generate = generateDecision, now = Date.now, wait = delay }) {
    Object.assign(this, { directory, account, api, generate, now, wait });
    fs.mkdirSync(directory, { recursive:true, mode:0o700 });
    this.file = path.join(directory,"automation.json");
    this.lockFile = path.join(directory,"automation.lock");
    this.data = { config: structuredClone(defaults), accounts: {}, history: [], nextRunAt: null };
    this.fault = "";
    try { this.reload(); } catch { this.fault = "自动化状态损坏，已停止；请先备份并检查 automation.json"; }
    this.revision = 0;
  }
  reload() {
    if (!fs.existsSync(this.file)) return;
    const data = JSON.parse(fs.readFileSync(this.file,"utf8"));
    if (!data.accounts || typeof data.accounts !== "object" || !Array.isArray(data.history)) throw new Error("invalid state");
    data.config = validateConfig(data.config);
    this.data = data;
  }
  save() { atomicWrite(this.file,this.data); }
  lock() {
    const recovery = this.lockFile + ".recovery";
    if (fs.existsSync(recovery)) throw new Error("正在恢复任务锁，请稍后重试");
    // Never steal a lock based on elapsed time: a live worker may be awaiting upstream.
    try {
      const fd = fs.openSync(this.lockFile,"wx",0o600);
      fs.writeFileSync(fd,JSON.stringify({ pid:process.pid })); fs.closeSync(fd);
      return () => fs.unlinkSync(this.lockFile);
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
      let owner;
      try { owner = JSON.parse(fs.readFileSync(this.lockFile,"utf8")); } catch { throw new Error("任务锁异常，请检查 automation.lock"); }
      if (!Number.isInteger(owner.pid) || owner.pid <= 0) throw new Error("任务锁无效");
      try { process.kill(owner.pid,0); } catch (err) {
        if (err.code === "ESRCH") {
          // Serialize stale-lock recovery so two workers cannot delete each other's lock.
          const recoveryFd = fs.openSync(recovery,"wx",0o600);
          try {
            const latest = JSON.parse(fs.readFileSync(this.lockFile,"utf8"));
            if (latest.pid !== owner.pid) throw new Error("任务锁已改变，请重试");
            fs.unlinkSync(this.lockFile);
          } finally { fs.closeSync(recoveryFd); fs.unlinkSync(recovery); }
          return this.lock();
        }
      }
      throw new Error("另一个任务正在运行");
    }
  }
  status() {
    const key = this.account()?.id;
    const a = this.data.accounts[key];
    return { config:this.data.config, busy:!!this.running, nextRunAt:this.data.nextRunAt,
      fault:this.fault, history:this.data.history.slice(-40).reverse(),
      usage:a?.days?.[localTime(this.now(),this.data.config.timeZone).day] || { comment:0,reply:0 },
      mentionMode:"plain-text-unverified" };
  }
  configure(patch) {
    if (this.fault) throw new Error(this.fault);
    // A stop must take effect even while the round owns the durable lock.
    if (this.running) {
      if (Object.keys(patch).length === 1 && patch.enabled === false) {
        this.data.config.enabled = false; this.data.nextRunAt = null; this.revision++; this.controller?.abort(); this.save(); return this.status();
      }
      throw new Error("任务运行中，请先停止，待任务结束后保存设置");
    }
    const unlock = this.lock();
    try {
      this.reload();
      this.data.config = validateConfig(patch,this.data.config);
      this.revision++;
      this.data.nextRunAt = this.data.config.enabled ? this.now() + this.data.config.intervalMinutes * 60000 : null;
      this.save();
    } finally { unlock(); }
    return this.status();
  }
  cancel() { this.revision++; this.controller?.abort(); }
  start() {
    const timer = setInterval(() => { this.tick().catch(() => {}); },5000);
    timer.unref?.();
    return () => { clearInterval(timer); this.closed = true; this.cancel(); };
  }
  async tick() {
    if (this.running || this.closed || this.fault) return;
    try { this.reload(); } catch { this.fault="自动化状态损坏，已停止"; return; }
    if (this.data.config.enabled && (!this.data.nextRunAt || this.now() >= this.data.nextRunAt)) return this.run();
  }
  run() {
    if (this.running || this.closed) throw new Error("任务正在运行或宿主已停止");
    if (this.fault) throw new Error(this.fault);
    const unlock = this.lock();
    try { this.reload(); } catch(e) { unlock(); throw e; }
    if (!this.data.config.enabled) { unlock(); throw new Error("请先开启定时浏览总开关"); }
    const selected = this.account();
    const account = selected ? { ...selected } : null;
    if (!account?.id) {
      try { this.data.nextRunAt=this.now()+this.data.config.intervalMinutes*60000; this.log("error","请登录包含 heybox_id 的 Cookie"); }
      finally { unlock(); }
      throw new Error("请登录包含 heybox_id 的 Cookie");
    }
    this.controller = new AbortController();
    const revision = this.revision;
    const current = () => !this.closed && !this.controller.signal.aborted && this.revision === revision && this.data.config.enabled && this.account()?.identity === account.identity;
    this.running = this.round(account,current).catch((e) => {
      try { this.log("error", this.controller.signal.aborted ? "任务已停止" : e.message); }
      catch { this.fault="保存自动化状态失败，任务已停止"; }
    }).finally(() => {
      try {
        this.data.nextRunAt = this.data.config.enabled ? this.now()+this.data.config.intervalMinutes*60000 : null;
        this.save();
      } catch { this.fault = "保存自动化状态失败，任务已停止"; }
      finally { unlock(); this.running = null; }
    });
    return this.running;
  }
  log(type,message,extra = {}) {
    this.data.history.push({ at:this.now(),type,message,...extra });
    this.data.history = this.data.history.slice(-200);
    this.save();
  }
  async round(account,current) {
    const c = this.data.config;
    if (c.valleyOnly && !inValley(this.now(),c)) { this.log("skip","当前不在谷时窗口"); return; }
    const a = this.data.accounts[account.id] ||= { seen:{}, actions:{}, days:{}, lastSendAt:0, offset:0 };
    this.log("start","开始一轮浏览");
    const request = async (...args) => {
      if (!current()) throw new Error("任务已停止");
      const value = await this.api(account,...args);
      if (!current()) throw new Error("任务已停止");
      return value.result || {};
    };
    if (c.autoReply) await this.replies(a,account,current,request);
    let count = 0;
    for (let page=0; page<5 && count<c.postsPerRound && current(); page++) {
      const feed = await request("/bbs/app/feeds",{offset:String(a.offset),pull:"0",dw:"800"});
      const links = (feed.links || []).filter((p) => id(p.linkid));
      if (!links.length) { a.offset=0; this.save(); break; }
      let consumed=0;
      for (const item of links) {
        consumed++;
        const postId = String(item.linkid);
        if (a.seen[postId]) continue;
        const tree = await request("/bbs/app/link/tree",{link_id:postId,offset:"0",limit:"30"});
        if (!tree.link || String(tree.link.linkid) !== postId) continue;
        a.seen[postId] = this.now(); count++; this.save();
        this.log("browse", "已读取帖子",{postId,title:String(tree.link.title||"").slice(0,160)});
        if (c.autoComment && userId(tree.link.user) !== account.id && (postText(tree.link).body.trim() || postText(tree.link).title.trim())) {
          try {
            await this.interact(a,account,current,{kind:"comment",key:`post:${postId}`,postId,replyId:"-1",rootId:"-1",author:tree.link.user,input:{kind:"comment",post:postText(tree.link)}});
          } catch(e) {
            // A generation failure may retry next round; committed send intents still deduplicate.
            if (!a.actions[`post:${postId}`]) delete a.seen[postId];
            this.save(); throw e;
          }
        }
        if (count>=c.postsPerRound) break;
      }
      a.offset += consumed; this.save();
    }
    this.log("done",`本轮读取 ${count} 帖`);
  }
  async replies(a,account,current,request) {
    let count=0;
    // Bounded lookback; message identity is persisted only when a decision/send is made.
    for (let offset=0;offset<100 && count<this.data.config.repliesPerRound;offset+=20) {
      const box=await request("/bbs/app/user/message",{list_type:"0",offset:String(offset),limit:"20",no_more:"false"});
      const messages=box.messages || box.list || [];
      if (!Array.isArray(messages) || !messages.length) break;
      for (const m of messages) {
        const incoming=id(m.comment_a_id), root=id(m.root_comment_id), postId=id(m.link?.linkid ?? m.linkid ?? m.link_id);
        if (!incoming || !root || !postId || a.actions[`reply:${incoming}`]) continue;
        const tree=await request("/bbs/app/link/tree",{link_id:postId,offset:"0",limit:"100"});
        let comments=commentsFrom(tree);
        let target=comments.find((v) => id(v.commentid)===incoming);
        if (!target) {
          let cursor;
          for(let page=0;page<5 && !target;page++) {
            const sub=await request("/bbs/app/comment/sub/comments",{root_comment_id:root,limit:"10",...(cursor?{lastval:cursor}:{})});
            const batch=commentsFrom(sub,root); comments.push(...batch);
            target=batch.find((v)=>id(v.commentid)===incoming);
            const next=id(sub.lastval ?? batch.at(-1)?.commentid);
            if (!batch.length || !next || cursor===next) break;
            cursor=next;
          }
        }
        const parent=id(target?.reply_id ?? target?.replyid);
        const addressedToUs=userId(target?.replyuser)===account.id;
        const parentComment=comments.find((v)=>id(v.commentid)===parent);
        const ours=Object.values(a.actions).find((v)=>v.status==="sent" && v.commentId===parent && v.postId===postId);
        const rootKnown=comments.some((v)=>id(v.commentid)===root);
        if (!target || target.threadRoot!==root || !rootKnown || userId(target.user)===account.id || !userId(target.user) || !(ours || userId(parentComment?.user)===account.id || addressedToUs)) continue;
        const result=await this.interact(a,account,current,{kind:"reply",key:`reply:${incoming}`,postId,replyId:incoming,rootId:root,input:{kind:"reply",post:postText(tree.link),parent:String(parentComment?.text||"" ).slice(0,2000),incoming:String(target.text||"").slice(0,4000)}});
        if(result) count++;
        if(count>=this.data.config.repliesPerRound) break;
      }
    }
  }
  async interact(a,account,current,job) {
    const c=this.data.config;
    const budget=()=> a.days[localTime(this.now(),c.timeZone).day] ||= {comment:0,reply:0};
    const allowed=()=>current() && c[job.kind==="comment"?"autoComment":"autoReply"] && (!c.valleyOnly || inValley(this.now(),c)) && budget()[job.kind]<c[job.kind==="comment"?"dailyComments":"dailyReplies"] && !a.actions[job.key];
    if(!allowed()) return false;
    const decision=await this.generate(job.input,c,{signal:this.controller.signal,directory:this.directory});
    if(!allowed()) return false;
    if(decision.action!=="send") {
      a.actions[job.key]={status:"skipped",postId:job.postId,at:this.now()}; this.save(); return true;
    }
    if(typeof decision.text!=="string" || !decision.text.trim() || decision.text.length>500 || /[<>@\u0000-\u0008]/.test(decision.text)) throw new Error("生成内容不符合发送要求");
    const text=job.kind==="comment" && c.mentionAuthor ? mentionText(job.author,decision.text.trim()) : decision.text.trim();
    const waitMs=Math.max(0,a.lastSendAt+c.cooldownSeconds*1000-this.now());
    if(waitMs) await this.wait(waitMs,undefined,{signal:this.controller.signal});
    if(!allowed()) return false;
    // Commit the intent and reserve the quota before the irreversible network call.
    const action={status:"unknown",kind:job.kind,postId:job.postId,at:this.now(),replyId:job.replyId};
    a.actions[job.key]=action; budget()[job.kind]++; a.lastSendAt=this.now(); this.save();
    try {
      const receipt=await this.api(account,"/bbs/app/comment/create",{},"POST",{is_cy:"0",link_id:job.postId,reply_id:job.replyId,root_id:job.rootId,text});
      action.commentId=id(receipt.commentid ?? receipt.result?.commentid ?? receipt.result?.comment?.[0]?.commentid ?? receipt.comment?.[0]?.commentid);
      action.status=action.commentId?"sent":"accepted";
      this.log(action.status,action.commentId?"平台返回评论 ID":"平台接受请求，未返回评论 ID",{postId:job.postId,kind:job.kind});
    } catch(e) {
      action.status=e.definitive?"rejected":"unknown";
      this.log(action.status,e.definitive?"平台明确拒绝发送":"发送结果未知，已去重且不会自动重试",{postId:job.postId,kind:job.kind});
    }
    this.save(); return true;
  }
}
