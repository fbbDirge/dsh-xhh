import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { generateDecision } from "./generator.js";
import { platformDetails } from "./platform-error.js";

export const defaults = Object.freeze({
  enabled: false, intervalMinutes: 30, postsPerRound: 1,
  autoComment: false, mentionAuthor: true, autoReply: false, repliesPerRound: 1,
  replyIntervalSeconds: 180, replyFollowSchedule: false,
  dailyComments: 10, dailyReplies: 10, cooldownSeconds: 60,
  valleyOnly: false, timeZone: "Asia/Shanghai", valleyWindows: [[720, 840], [1080, 540]],
  weekendWindows: [[0, 1440]], holidayWindows: [[0, 1440]],
  holidays: [], workdays: [], persona: "友好、克制，关注游戏与数码，有内容再发言。", replyPersona: "",
  dshCommand: "dsh", nodePath: "", generationTimeoutSeconds: 180,
  mentionTarget: "author", mentionName: "", mentionUserId: "",
  generationProvider: "dsh", apiBaseUrl: "", apiModel: "", apiKey: "",
});

export function validateConfig(patch, previous = defaults) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new Error("配置必须是对象");
  const c = structuredClone(previous);
  for (const [key, value] of Object.entries(patch)) {
    if (!Object.hasOwn(defaults,key)) throw new Error(`未知设置：${key}`);
    c[key] = value;
  }
  for (const key of ["enabled", "autoComment", "autoReply", "mentionAuthor", "valleyOnly", "replyFollowSchedule"]) {
    if (typeof c[key] !== "boolean") throw new Error(`${key} 必须是开关`);
  }
  for (const [key, min, max] of [["replyIntervalSeconds",30,86400],["intervalMinutes",1,1440],["postsPerRound",1,10],["repliesPerRound",1,10],["dailyComments",0,100],["dailyReplies",0,100],["cooldownSeconds",10,3600],["generationTimeoutSeconds",10,600]]) {
    if (!Number.isInteger(c[key]) || c[key] < min || c[key] > max) throw new Error(`${key} 范围 ${min}–${max}`);
  }
  for (const key of ["persona", "replyPersona"]) {
    if (typeof c[key] !== "string" || c[key].length > 2000 || /[\0\x01-\x08\x0b\x0c\x0e-\x1f]/.test(c[key])) throw new Error(`${key} 无效`);
  }
  if (!["author", "custom", "none"].includes(c.mentionTarget)) throw new Error("提及对象无效");
  if (typeof c.mentionName === "string") c.mentionName = c.mentionName.trim().replace(/^@/, "").trim();
  if (typeof c.mentionName !== "string" || c.mentionName.length > 80 || /[<>@\r\n\x00-\x1f]/.test(c.mentionName)) throw new Error("自定义昵称无效，请填写单个昵称");
  if (c.mentionTarget === "custom" && !c.mentionName.trim()) throw new Error("请填写自定义提及昵称");
  // Keep nickname-only legacy configs readable; sending requires a bound user ID.
  if (c.mentionUserId === undefined) c.mentionUserId = "";
  if (typeof c.mentionUserId !== "string") throw new Error("提及用户 ID 必须为数字字符串");
  c.mentionUserId = c.mentionUserId.trim();
  if (c.mentionUserId && !/^[1-9]\d{0,19}$/.test(c.mentionUserId)) throw new Error("提及用户 ID 必须为 1–20 位正整数");
  if (!["dsh", "external"].includes(c.generationProvider)) throw new Error("生成方式无效");
  for (const key of ["apiBaseUrl", "apiModel", "apiKey"]) {
    if (typeof c[key] !== "string" || c[key].length > 4096 || /[\x00-\x1f\x7f]/.test(c[key])) throw new Error(`${key} 无效`);
  }
  if (c.apiBaseUrl) {
    let url;
    try { url = new URL(c.apiBaseUrl); } catch { throw new Error("API 地址无效"); }
    if (url.username || url.password || url.search || url.hash || !["https:", "http:"].includes(url.protocol)) throw new Error("API 地址必须为无凭据、查询参数的 HTTP(S) 地址");
    if (url.protocol === "http:" && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error("远程 API 必须使用 HTTPS");
  }
  if (c.generationProvider === "external" && (!c.apiBaseUrl || !c.apiModel.trim())) throw new Error("第三方 API 需要填写地址与模型名");
  for (const key of ["dshCommand", "nodePath", "timeZone"]) {
    if (typeof c[key] !== "string" || c[key].length > 2000 || /[\n\r\0]/.test(c[key])) throw new Error(`${key} 无效`);
  }
  if (!c.dshCommand.trim()) throw new Error("DSH 命令不能为空");
  new Intl.DateTimeFormat("en", { timeZone: c.timeZone }).format();
  for (const key of ["holidays", "workdays"]) {
    if (!Array.isArray(c[key]) || c[key].length > 400 || c[key].some((d) => typeof d !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(d) || new Date(d).toISOString().slice(0,10) !== d)) throw new Error(`${key} 日期格式 YYYY-MM-DD`);
  }
  for (const key of ["valleyWindows", "weekendWindows", "holidayWindows"]) {
    if (!Array.isArray(c[key]) || c[key].length > 10 || c[key].some((w) => !Array.isArray(w) || w.length !== 2 || !Number.isInteger(w[0]) || w[0] < 0 || w[0] > 1439 || !Number.isInteger(w[1]) || w[1] < 0 || w[1] > 1440 || w[0] === w[1])) throw new Error(`${key} 使用 [起始分钟,结束分钟]，支持跨午夜；[0,1440] 表示全天，空数组表示不运行`);
  }
  return c;
}

export function localTime(now, timeZone) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone, year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", hourCycle:"h23", weekday:"short" }).formatToParts(now).map((v) => [v.type,v.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, minute: +p.hour * 60 + +p.minute, weekend: ["Sat","Sun"].includes(p.weekday) };
}
export function inValley(now, config) {
  const t = localTime(now, config.timeZone);
  const windows = config.holidays.includes(t.day) ? config.holidayWindows ?? defaults.holidayWindows
    : t.weekend && !config.workdays.includes(t.day) ? config.weekendWindows ?? defaults.weekendWindows : config.valleyWindows;
  return windows.some(([a,b]) => a < b ? t.minute >= a && t.minute < b : t.minute >= a || t.minute < b);
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
  const uid = userId(author);
  if (!uid || !/^[1-9]\d{0,19}$/.test(uid) || typeof name !== "string" || !name.trim() || /[<>@\x00-\x1f\x7f]/.test(name) || name.length > 80) throw new Error("缺少可靠提及用户 ID 或昵称，跳过 @ 评论");
  const escapedName = name.trim().replace(/[&"']/g, (v) => ({ "&": "&amp;", '"': "&quot;", "'": "&#39;" })[v]);
  // Match the user-selected mention markup observed in the official mobile client.
  const protocol = encodeURIComponent(JSON.stringify({ protocol_type: "openUser", user_id: uid }));
  return `<a data-user-id="${uid}" href="https://api.xiaoheihe.cn/open_inapp/#heybox://${protocol}">@${escapedName}</a> ${text}`;
}
export function commentText(config, author, text) {
  if (!config.mentionAuthor || config.mentionTarget === "none") return text;
  if (config.mentionTarget === "custom") {
    if (!config.mentionUserId) throw new Error("自定义 @ 缺少用户 ID，请在互动设置中填写；仅昵称无法绑定用户");
    return mentionText({ userid: config.mentionUserId, username: config.mentionName }, text);
  }
  return mentionText(author, text);
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

// Unknown read state requires a reliable timestamp; never infer that old history is new.
export function isNewReply(message, baselineAt) {
  const boolean = (value) => {
    const text = String(value ?? "").toLowerCase().trim();
    return ["1", "true", "yes"].includes(text) ? true : ["0", "false", "no"].includes(text) ? false : undefined;
  };
  for (const key of ["is_unread", "unread", "is_read", "has_read", "read_status"]) {
    const text = String(message[key] ?? "").toLowerCase().trim();
    if (text === "unread") return true;
    if (text === "read") return false;
    const value = boolean(message[key]);
    if (value !== undefined) return ["is_unread", "unread"].includes(key) ? value : !value;
  }
  const value = Number(message.timestamp || message.create_at);
  const timestamp = value < 1e12 ? value * 1000 : value;
  return Number.isFinite(timestamp) && timestamp > baselineAt;
}

export class Automation {
  constructor({ directory, account, api, generate = generateDecision, now = Date.now, wait = delay }) {
    Object.assign(this, { directory, account, api, generate, now, wait });
    fs.mkdirSync(directory, { recursive:true, mode:0o700 });
    this.file = path.join(directory,"automation.json");
    this.configFile = path.join(directory,"config.json");
    this.lockFile = path.join(directory,"automation.lock");
    this.data = { config: structuredClone(defaults), accounts: {}, history: [], nextRunAt: null };
    this.fault = "";
    try { this.reload(); } catch { this.fault = "配置或自动化状态损坏，已停止；请先备份并检查 config.json 与 automation.json"; }
    this.revision = 0;
  }
  reload() {
    const data = fs.existsSync(this.file) ? JSON.parse(fs.readFileSync(this.file,"utf8")) : this.data;
    if (!data.accounts || typeof data.accounts !== "object" || !Array.isArray(data.history)) throw new Error("invalid state");
    const hasConfig = fs.existsSync(this.configFile);
    data.config = validateConfig(hasConfig ? JSON.parse(fs.readFileSync(this.configFile,"utf8")) : data.config);
    if (!hasConfig) atomicWrite(this.configFile, data.config);
    // Older versions kept titles only in the rolling event log; retain what remains.
    const browseEvents = new Map(data.history.filter((v) => v.type === "browse").map((v) => [v.postId + ":" + v.at, v]));
    for (const account of Object.values(data.accounts)) {
      account.watched ||= {};
      for (const [postId, at] of Object.entries(account.seen || {})) {
        const event = browseEvents.get(postId + ":" + at);
        account.watched[postId] ||= { at, postId, title: event?.title || "" };
      }
    }
    this.data = data;
  }
  save() {
    const { apiKey, ...config } = this.data.config;
    atomicWrite(this.file, { ...this.data, config });
  }
  watched({ offset = 0, limit = 50 } = {}) {
    if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("浏览记录分页参数无效");
    const account = this.data.accounts[this.account()?.id];
    const records = Object.values(account?.watched || {}).sort((a, b) => b.at - a.at || String(a.postId).localeCompare(String(b.postId)));
    return { total: records.length, offset, limit, records: records.slice(offset, offset + limit).map((record) => ({ ...record, type: "browse" })) };
  }
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
    const interactions = Object.entries(a?.actions || {}).filter(([, v]) => v.status !== "skipped")
      .sort(([, x], [, y]) => y.at - x.at).slice(0, 100).map(([key, v]) => ({
        at: v.at, kind: v.kind || (key.startsWith("reply:") ? "reply" : "comment"), status: v.status,
        postId: v.postId, title: v.title, text: v.text, displayText: v.displayText, incoming: v.incoming, parent: v.parent, commentId: v.commentId, replyId: v.replyId,
        ...platformDetails(v),
      }));
    const { apiKey, ...config } = this.data.config;
    return { config, apiKeyConfigured:!!apiKey, configPath:this.configFile, busy:!!this.running, runningKind:this.runningKind || null, nextRunAt:this.data.nextRunAt,
      nextReplyAt:config.autoReply && !a?.replyPoll?.paused ? a?.replyPoll?.nextAt ?? null : null,
      replyPaused:a?.replyPoll?.paused || "", replyFailures:a?.replyPoll?.failures || 0, interactions,
      fault:this.fault, history:this.data.history.slice(-40).reverse(),
      usage:a?.days?.[localTime(this.now(),this.data.config.timeZone).day] || { comment:0,reply:0 },
      mentionMode:"user-link-unverified" };
  }
  configure(patch) {
    if (this.fault) throw new Error(this.fault);
    // Disabling either task must work while the shared execution lock is held.
    if (this.running) {
      if (Object.keys(patch).length && Object.entries(patch).every(([key, value]) => ["enabled", "autoReply"].includes(key) && value === false)) {
        Object.assign(this.data.config, patch);
        atomicWrite(this.configFile, this.data.config);
        if (patch.enabled === false) this.data.nextRunAt = null;
        if (patch[this.runningKind === "reply" ? "autoReply" : "enabled"] === false) this.cancel();
        this.save(); return this.status();
      }
      throw new Error("任务运行中，请先停止，待任务结束后保存设置");
    }
    const unlock = this.lock();
    try {
      this.reload();
      const wasReplyEnabled = this.data.config.autoReply;
      const previousReplyInterval = this.data.config.replyIntervalSeconds;
      this.data.config = validateConfig(patch,this.data.config);
      atomicWrite(this.configFile,this.data.config);
      this.revision++;
      const selected = this.account();
      if (this.data.config.autoReply && selected?.id) {
        const poll = this.replyState(selected);
        if (!wasReplyEnabled) {
          poll.baselineAt = this.now(); poll.paused = ""; poll.failures = 0; poll.nextAt = this.now();
        } else if (previousReplyInterval !== this.data.config.replyIntervalSeconds) {
          poll.nextAt = this.now() + this.data.config.replyIntervalSeconds * 1000 * 2 ** Math.min(poll.failures, 5);
        }
      }
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
  accountState(account) {
    return this.data.accounts[account.id] ||= { seen:{}, actions:{}, days:{}, lastSendAt:0, offset:0 };
  }
  replyState(account) {
    const a = this.accountState(account);
    const poll = a.replyPoll ||= { baselineAt:this.now(), nextAt:this.now(), failures:0, paused:"", identity:account.identity };
    if (poll.identity !== account.identity) {
      poll.identity = account.identity; poll.paused = ""; poll.failures = 0; poll.nextAt = this.now();
    }
    return poll;
  }
  async tick() {
    if (this.running || this.closed || this.fault) return;
    try { this.reload(); } catch { this.fault="自动化状态损坏，已停止"; return; }
    const account = this.account();
    if (!account?.id) return;
    const c = this.data.config;
    const poll = c.autoReply ? this.replyState(account) : null;
    const browseDue = c.enabled && (!this.data.nextRunAt || this.now() >= this.data.nextRunAt);
    const replyDue = poll && !poll.paused && this.now() >= poll.nextAt;
    if (replyDue && (!browseDue || poll.nextAt <= (this.data.nextRunAt || 0))) return this.run("reply");
    if (browseDue) return this.run("browse");
  }
  run(kind = "browse") {
    if (!["browse", "reply"].includes(kind)) throw new Error("任务类型无效");
    if (this.running || this.closed) throw new Error("任务正在运行或宿主已停止");
    if (this.fault) throw new Error(this.fault);
    const unlock = this.lock();
    try { this.reload(); } catch(e) { unlock(); throw e; }
    const enabledKey = kind === "reply" ? "autoReply" : "enabled";
    if (!this.data.config[enabledKey]) { unlock(); throw new Error(kind === "reply" ? "请先开启自动回复" : "请先开启定时浏览开关"); }
    const selected = this.account();
    const account = selected ? { ...selected } : null;
    if (!account?.id) { unlock(); throw new Error("请登录包含 heybox_id 的 Cookie"); }
    const poll = kind === "reply" ? this.replyState(account) : null;
    if (poll?.paused) { unlock(); throw new Error(poll.paused); }
    try { this.save(); } catch(e) { unlock(); throw e; }
    this.controller = new AbortController();
    this.runningKind = kind;
    const revision = this.revision;
    const current = () => !this.closed && !this.controller.signal.aborted && this.revision === revision && this.data.config[enabledKey] && this.account()?.identity === account.identity;
    this.running = this.round(account,current,kind).then(() => {
      if (poll) poll.failures = 0;
    }).catch((e) => {
      try {
        if (poll && current()) {
          poll.failures = Math.min(10, poll.failures + 1);
          if (["authentication", "captcha"].includes(e.kind)) poll.paused = e.kind === "captcha"
            ? "回复检查已暂停：请完成平台人机验证后重新登录。"
            : "回复检查已暂停：登录失效，请重新登录。";
        }
        this.log("error", this.controller.signal.aborted ? "任务已停止" : (poll?.paused || e.message));
      } catch { this.fault="保存自动化状态失败，任务已停止"; }
    }).finally(() => {
      try {
        if (poll) poll.nextAt = this.now() + this.data.config.replyIntervalSeconds * 1000 * 2 ** Math.min(poll.failures, 5);
        else this.data.nextRunAt = this.data.config.enabled ? this.now()+this.data.config.intervalMinutes*60000 : null;
        this.save();
      } catch { this.fault = "保存自动化状态失败，任务已停止"; }
      finally { unlock(); this.running = null; this.runningKind = null; }
    });
    return this.running;
  }
  log(type,message,extra = {}) {
    this.data.history.push({ at:this.now(),type,message,...extra });
    this.data.history = this.data.history.slice(-200);
    this.save();
  }
  async round(account,current,kind) {
    const c = this.data.config;
    if (c.valleyOnly && (kind !== "reply" || c.replyFollowSchedule) && !inValley(this.now(),c)) { this.log("skip","当前不在允许运行时段，跳过本轮"); return; }
    const a = this.accountState(account);
    this.log("start",kind === "reply" ? "检查评论回复" : "开始一轮浏览");
    const request = async (...args) => {
      if (!current()) throw new Error("任务已停止");
      const value = await this.api(account,...args);
      if (!current()) throw new Error("任务已停止");
      return value.result || {};
    };
    if (kind === "reply") {
      await this.replies(a,account,current,request);
      this.log("done", "本轮回复检查完成"); return;
    }
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
        a.seen[postId] = this.now();
        (a.watched ||= {})[postId] = { at: a.seen[postId], postId, title: String(tree.link.title || "").slice(0, 160) };
        count++; this.save();
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
        if (!incoming || !root || !postId || a.actions[`reply:${incoming}`] || !isNewReply(m, a.replyPoll.baselineAt)) continue;
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
    const allowed=()=>current() && c[job.kind==="comment"?"autoComment":"autoReply"] && (!c.valleyOnly || (job.kind === "reply" && !c.replyFollowSchedule) || inValley(this.now(),c)) && budget()[job.kind]<c[job.kind==="comment"?"dailyComments":"dailyReplies"] && !a.actions[job.key];
    if(!allowed()) return false;
    const decision=await this.generate(job.input,c,{signal:this.controller.signal,directory:this.directory});
    if(!allowed()) return false;
    if(decision.action!=="send") {
      a.actions[job.key]={status:"skipped",postId:job.postId,at:this.now()}; this.save(); return true;
    }
    if(typeof decision.text!=="string" || !decision.text.trim() || decision.text.length>500 || /[<>@\u0000-\u0008]/.test(decision.text)) throw new Error("生成内容不符合发送要求");
    const text=job.kind==="comment" ? commentText(c,job.author,decision.text.trim()) : decision.text.trim();
    if (text.length > 500) throw new Error("添加提及后评论超过 500 字，请缩短正文或昵称");
    const displayText = text.startsWith("<a ")
      ? `@${c.mentionTarget === "custom" ? c.mentionName : (job.author.username || job.author.nickname).trim()} ${decision.text.trim()}` : text;
    const waitMs=Math.max(0,a.lastSendAt+c.cooldownSeconds*1000-this.now());
    if(waitMs) await this.wait(waitMs,undefined,{signal:this.controller.signal});
    if(!allowed()) return false;
    // Commit the intent and reserve the quota before the irreversible network call.
    const action={status:"unknown",kind:job.kind,postId:job.postId,at:this.now(),replyId:job.replyId,
      text, displayText, title:job.input.post?.title || "", incoming:job.input.incoming || "", parent:job.input.parent || ""};
    a.actions[job.key]=action; budget()[job.kind]++; a.lastSendAt=this.now(); this.save();
    try {
      const receipt=await this.api(account,"/bbs/app/comment/create",{},"POST",{is_cy:"0",link_id:job.postId,reply_id:job.replyId,root_id:job.rootId,text});
      action.commentId=id(receipt.commentid ?? receipt.result?.commentid ?? receipt.result?.comment?.[0]?.commentid ?? receipt.comment?.[0]?.commentid);
      action.status=action.commentId?"sent":"accepted";
      this.log(action.status,action.commentId?"平台返回评论 ID":"平台接受请求，未返回评论 ID",{postId:job.postId,kind:job.kind});
    } catch(e) {
      action.status=e.definitive?"rejected":"unknown";
      Object.assign(action, platformDetails(e, [account.cookie, c.apiKey]));
      const reason = [action.platformStatus, action.platformMessage, action.httpStatus ? `HTTP ${action.httpStatus}` : ""].filter(Boolean).join(" · ");
      this.log(action.status,(e.definitive?"平台明确拒绝发送":"发送结果未知，已去重且不会自动重试") + (reason ? "：" + reason : ""),{postId:job.postId,kind:job.kind,...platformDetails(action)});
      if (job.kind === "reply" && ["authentication", "captcha", "rate_limit"].includes(e.kind)) { this.save(); throw e; }
    }
    this.save(); return true;
  }
}
