import crypto from "node:crypto";
import { validateSelections } from "./posting-selections.js";

export const postingDefaults = Object.freeze({
  postingEnabled: false,
  postingPersona: "以自然、真诚的口吻分享游戏与数码见闻。观点明确，不编造个人经历，不做广告。",
  postingPrompt: "分享一个值得讨论的游戏话题，给出具体观点，并邀请盒友交流。",
  postingCommunities: [], postingHashtags: [],
  postingTopicId: "", postingSchedule: "daily", postingTime: "20:00", postingAt: "",
  postingWeekdays: [1, 2, 3, 4, 5, 6, 7],
});

export function validatePosting(c) {
  if (typeof c.postingEnabled !== "boolean") throw new Error("发帖开关无效");
  for (const [key, max] of [["postingPersona", 2000], ["postingPrompt", 4000]]) {
    if (typeof c[key] !== "string" || c[key].length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(c[key])) throw new Error(`${key} 无效`);
  }
  if (typeof c.postingTopicId !== "string" || (c.postingTopicId && !/^[1-9]\d{0,19}$/.test(c.postingTopicId))) throw new Error("发帖社区 ID 必须为正整数");
  validateSelections(c.postingCommunities, c.postingHashtags);
  if (c.postingCommunities.length && c.postingTopicId) throw new Error("已选择发帖分区，请清空旧版社区 ID，避免目标不明确");
  if (!["once", "daily", "weekly"].includes(c.postingSchedule)) throw new Error("发帖周期无效");
  if (typeof c.postingTime !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(c.postingTime)) throw new Error("发帖时间格式 HH:mm");
  if (typeof c.postingAt !== "string" || (c.postingAt && !validLocal(c.postingAt))) throw new Error("单次发帖时间格式 YYYY-MM-DDTHH:mm");
  if (!Array.isArray(c.postingWeekdays) || c.postingWeekdays.length > 7 || new Set(c.postingWeekdays).size !== c.postingWeekdays.length || c.postingWeekdays.some(v => !Number.isInteger(v) || v < 1 || v > 7)) throw new Error("发帖星期无效（1–7）");
  if (c.postingEnabled && (!c.postingPersona.trim() || !c.postingPrompt.trim() || (!c.postingTopicId && !c.postingCommunities.length) || (c.postingSchedule === "once" && !c.postingAt) || (c.postingSchedule === "weekly" && !c.postingWeekdays.length))) throw new Error("开启发帖前请填写独立发帖人格、主题、社区和完整时间");
  if (c.postingAt && localEpoch(c.postingAt, c.timeZone) === null) throw new Error("单次发帖时间在所选时区不存在");
}

function validLocal(value) {
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(value)) return false;
  const epoch = Date.parse(value + ":00Z");
  return Number.isFinite(epoch) && new Date(epoch).toISOString().slice(0, 16) === value;
}
function localStamp(epoch, zone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(epoch).map(v => [v.type, v.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
// Try offsets on both sides of a DST transition; choose the first repeated minute.
export function localEpoch(stamp, zone) {
  const naive = Date.parse(stamp + ":00Z");
  const candidates = [-86400000, 0, 86400000].map(delta => {
    const probe = naive + delta;
    const offset = Date.parse(localStamp(probe, zone) + ":00Z") - probe;
    return naive - offset;
  }).filter(epoch => localStamp(epoch, zone) === stamp);
  return candidates.length ? Math.min(...candidates) : null;
}
export function nextPostingAt(c, after) {
  if (c.postingSchedule === "once") {
    const epoch = c.postingAt ? localEpoch(c.postingAt, c.timeZone) : null;
    return epoch !== null && epoch > after ? epoch : null;
  }
  const date = localStamp(after, c.timeZone).slice(0, 10);
  for (let day = 0; day < 9; day++) {
    const calendar = new Date(Date.parse(date + "T00:00:00Z") + day * 86400000);
    if (c.postingSchedule === "weekly" && !c.postingWeekdays.includes(calendar.getUTCDay() || 7)) continue;
    const epoch = localEpoch(calendar.toISOString().slice(0, 10) + "T" + c.postingTime, c.timeZone);
    if (epoch !== null && epoch > after) return epoch;
  }
  return null;
}
function signature(c) {
  return crypto.createHash("sha256").update(JSON.stringify([c.postingSchedule, c.postingTime, c.postingAt, c.postingWeekdays, c.timeZone])).digest("hex");
}
export function parsePostDecision(text) {
  const value = JSON.parse(text.trim().replace(/^```json\s*\n([\s\S]*?)\n```$/, "$1"));
  if (!value || !["send", "skip"].includes(value.action)) throw new Error("发帖决策无效");
  if (value.action === "skip") return { action: "skip" };
  if (typeof value.title !== "string" || !value.title.trim() || value.title.trim().length > 30 || typeof value.text !== "string" || !value.text.trim() || value.text.length > 10000 || /[<>\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value.title + value.text) || /[\r\n]/.test(value.title)) throw new Error("帖子内容无效（标题 1–30 字，正文 1–10000 字，不含 HTML）");
  return { action: "send", title: value.title.trim(), text: value.text.trim() };
}
function receiptId(data) {
  const value = data?.link_id ?? data?.linkid ?? data?.result?.link_id ?? data?.result?.linkid ?? data?.result?.link?.linkid;
  return /^[1-9]\d{0,19}$/.test(String(value)) ? String(value) : null;
}

export class Posting {
  constructor(worker) { this.worker = worker; }
  state(account) {
    const w = this.worker, c = w.data.config;
    const p = w.accountState(account).posting ||= { jobs: [], nextAt: null, scheduleKey: "" };
    const key = signature(c);
    if (key !== p.scheduleKey) {
      p.scheduleKey = key;
      p.nextAt = c.postingSchedule === "once" && c.postingAt ? localEpoch(c.postingAt, c.timeZone) : nextPostingAt(c, w.now());
    }
    return p;
  }
  status() {
    const w = this.worker, account = w.account();
    const p = account?.id ? w.data.accounts[account.id]?.posting : null;
    const accountMatches = !!account?.id && w.data.postingAccountId === account.id;
    return { accountMatches, nextAt: w.data.config.postingEnabled && accountMatches ? p?.nextAt ?? null : null, jobs: (p?.jobs || []).slice(-50).reverse() };
  }
  due(account) {
    const w = this.worker;
    if (!w.data.config.postingEnabled || w.data.postingAccountId !== account.id) return false;
    const unlock = w.lock();
    try {
      w.reload();
      const previousKey = w.data.accounts[account.id]?.posting?.scheduleKey;
      const p = this.state(account);
      if (previousKey !== p.scheduleKey) w.save();
      return w.data.config.postingEnabled && w.data.postingAccountId === account.id && p.nextAt !== null && p.nextAt <= w.now() && !(p.retryAt > w.now());
    } finally { unlock(); }
  }
  async round(account, current) {
    const w = this.worker, c = w.data.config, p = this.state(account), slot = p.nextAt;
    if (slot === null || slot > w.now() || !current()) return;
    let job = p.jobs.find(v => v.slot === slot);
    const advance = () => { p.nextAt = nextPostingAt(c, Math.max(slot, w.now())); delete p.retryAt; w.save(); };
    if (job && !["generating", "pending"].includes(job.status)) { advance(); return; }
    if (w.now() - slot > 10 * 60000) {
      if (!job) { job = { id: crypto.randomUUID(), slot, at: w.now() }; p.jobs.push(job); }
      p.jobs = p.jobs.slice(-200);
      job.status = "missed"; job.error = "错过发布时间超过 10 分钟，请重新安排"; advance(); return;
    }
    if (!job) {
      job = { id: crypto.randomUUID(), slot, at: w.now(), status: "pending", attempts: 0, persona: c.postingPersona, prompt: c.postingPrompt, topicId: c.postingTopicId, communities: c.postingCommunities.map(({ id, name }) => ({ id, name })), hashtags: c.postingHashtags.map(({ name, isActivity }) => ({ name, isActivity })) };
      p.jobs.push(job); p.jobs = p.jobs.slice(-200); w.save();
    }
    if (job.attempts >= 3) { job.status = "failed"; job.error = "内容生成已尝试三次，请重新安排"; advance(); return; }
    try {
      job.status = "generating"; job.attempts++; w.save();
      const decision = await w.generate({ kind: "post", topic: job.prompt, communities: job.communities || [], hashtags: job.hashtags || [] }, { ...c, postingPersona: job.persona }, { signal: w.controller.signal, directory: w.directory });
      if (!current()) throw new Error("任务已停止");
      const content = parsePostDecision(JSON.stringify(decision));
      if (content.action === "skip") { job.status = "skipped"; advance(); return; }
      job.title = content.title; job.text = content.text;
      const a = w.accountState(account);
      const remaining = c.cooldownSeconds * 1000 - (w.now() - a.lastSendAt);
      if (remaining > 0) await w.wait(remaining, undefined, { signal: w.controller.signal });
      if (!current()) throw new Error("任务已停止");
      // Persist an uncertain intent before the irreversible request; never blindly resend it.
      job.status = "uncertain"; job.sentAt = w.now(); a.lastSendAt = w.now(); w.save();
      let receipt;
      try {
        receipt = await w.api(account, "/bbs/app/api/link/post", { web_version: "3.0" }, "POST", {
          title: job.title, text: JSON.stringify([{ type: "text", text: job.text }]),
          desc: job.text.slice(0, 100), words_count: String(job.text.length), topic_ids: job.communities?.length ? job.communities.map(v => v.id).join(",") : job.topicId,
          link_tag: "27", post_type: "1", draft: "0", original: "1", view_limit: "1", hashtags: JSON.stringify((job.hashtags || []).map(v => v.name)), schedule_ts: "0", declaration: "0",
        });
      } catch (error) {
        job.status = error.definitive ? "rejected" : "uncertain";
        job.error = error.definitive ? "平台拒绝发布，请检查登录、社区权限或平台限制" : "发送结果未知，请到平台核对，不会自动重发";
        advance(); return;
      }
      job.postId = receiptId(receipt);
      job.status = job.postId ? "accepted" : "uncertain";
      if (!job.postId) job.error = "平台未返回帖子 ID，请到平台核对，不会自动重发";
      w.save();
      if (job.postId) {
        try {
          const detail = await w.api(account, "/bbs/app/link/tree", { link_id: job.postId, offset: "0", limit: "1" });
          const link = detail.result?.link;
          let blocks; try { blocks = JSON.parse(link?.text); } catch { blocks = null; }
          const body = Array.isArray(blocks) ? blocks.filter(v => v.type === "text").map(v => v.text).join("\n") : link?.text;
          if (String(link?.linkid) === job.postId && link?.title === job.title && body === job.text) job.status = "verified";
          else job.error = "已取得帖子 ID，读取内容尚未核验一致";
        } catch { job.error = "已取得帖子 ID，读取核验暂未成功"; }
      }
      advance();
    } catch (error) {
      if (["uncertain", "accepted", "verified"].includes(job.status) || error.persistence) throw error;
      job.status = job.attempts >= 3 ? "failed" : "pending";
      job.error = current() ? "内容生成失败，稍后重试；连续失败三次后结束本次任务" : "任务已停止，重新开启后可继续";
      if (job.status === "failed") advance();
      else { p.retryAt = w.now() + 60000; w.save(); }
    }
  }
}
