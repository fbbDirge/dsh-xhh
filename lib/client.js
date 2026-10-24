/** DSH settings section and optional conversation view, following dsh-bili-scroll. */
window.__ModuleLoader__.load({
  id: "heybox",
  factory: (require) => {
    const React = require("react");
    const { useState, useEffect, useRef } = React;
    const h = React.createElement;
    const CSS = `
.hx-page{--hx-line:rgba(127,127,127,.22);--hx-fill:rgba(127,127,127,.07);display:flex;flex-direction:column;gap:20px;max-width:720px;min-width:0;color:var(--dsw-alias-label-primary,inherit);font:inherit;padding:2px 2px 20px}
.hx-page *{box-sizing:border-box}.hx-page h2,.hx-page h3,.hx-page p{margin:0}.hx-page h2{font-size:20px}.hx-page h3{font-size:14px}
.hx-section{display:flex;flex-direction:column;gap:12px;border-bottom:1px solid var(--hx-line);padding-bottom:20px}.hx-row{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.hx-grow{flex:1;min-width:160px}
.hx-note{font-size:12px;line-height:1.7;color:var(--dsw-alias-label-secondary,inherit);opacity:.8}.hx-page label{font-size:13px;line-height:1.6}.hx-field{display:flex;flex-direction:column;gap:6px;min-width:0}.hx-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.hx-input,.hx-button{font:inherit;font-size:13px;color:inherit;border:1px solid var(--hx-line);border-radius:8px;background:var(--hx-fill);padding:8px 10px}.hx-input{width:100%;min-width:0}.hx-page textarea{resize:vertical}.hx-button{cursor:pointer}.hx-button:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.16))}.hx-button:disabled,.hx-input:disabled{opacity:.5;cursor:default}.hx-primary{background:#2378d4;color:#fff;border-color:#2378d4}.hx-page :focus-visible{outline:2px solid #2378d4;outline-offset:3px}
.hx-toggle{display:flex;align-items:center;gap:10px;cursor:pointer}.hx-toggle input{width:17px;height:17px;accent-color:#2378d4;flex:none}.hx-sub{display:flex;flex-direction:column;gap:14px;margin-left:8px;padding-left:16px;border-left:2px solid var(--hx-line)}
.hx-message{font-size:13px;line-height:1.7;padding:10px 12px;border-radius:8px;background:var(--hx-fill);overflow-wrap:anywhere}.hx-error{color:var(--dsw-alias-status-error,#c54c3b)}.hx-history{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:10px}.hx-history li{padding:12px;background:var(--hx-fill);border:1px solid var(--hx-line);border-radius:8px;overflow-wrap:anywhere}.hx-page a{color:inherit;text-underline-offset:3px}.hx-page summary{cursor:pointer;font-size:13px}.hx-details{display:flex;flex-direction:column;gap:14px;padding-top:14px}.hx-wide{max-width:none;width:100%}
@media(max-width:520px){.hx-grid{grid-template-columns:1fr}.hx-sub{margin-left:0;padding-left:10px}.hx-row .hx-button{flex-grow:1}}
`;
    async function api(path, body, signal) {
      const response = await fetch("/heybox/" + path, {
        credentials: "same-origin", signal,
        ...(body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
      });
      let data;
      try { data = await response.json(); } catch { throw new Error("宿主返回无效响应（HTTP " + response.status + "）"); }
      if (!response.ok || !data.ok) throw new Error(data.error || data.msg || "HTTP " + response.status);
      return data;
    }
    function editable(config) {
      return { ...config, valleyWindows: JSON.stringify(config.valleyWindows), holidays: config.holidays.join(", "), workdays: config.workdays.join(", ") };
    }
    function configFrom(draft) {
      const config = { ...draft, valleyWindows: JSON.parse(draft.valleyWindows) };
      for (const key of ["holidays", "workdays"]) config[key] = draft[key].split(/[,，\s]+/).filter(Boolean);
      return config;
    }
    function time(value) { return value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "—"; }
    function postLink(record) {
      return /^\d+$/.test(String(record.postId))
        ? h("a", { href: "https://www.xiaoheihe.cn/app/bbs/link/" + record.postId, target: "_blank", rel: "noopener noreferrer" }, record.title || "帖子 " + record.postId)
        : record.title || null;
    }
    const typeNames = { browse: "浏览", start: "开始", done: "完成", error: "失败", sent: "已发送", accepted: "已受理", unknown: "结果未知", rejected: "已拒绝", skip: "跳过" };
    function historyList(records) {
      return records.length ? h("ul", { className: "hx-history" }, ...records.map((record, i) => h("li", { key: record.at + ":" + i },
        h("div", { className: "hx-note" }, time(record.at), " · ", typeNames[record.type] || record.type),
        h("div", null, record.message), postLink(record)))) : h("p", { className: "hx-note" }, "暂无记录，开启任务后会在这里显示。");
    }
    function Toggle({ label, value, onChange, disabled }) {
      return h("label", { className: "hx-toggle" }, h("input", { type: "checkbox", "aria-label": label, checked: value, disabled, onChange: (e) => onChange(e.target.checked) }), label);
    }
    function Field({ label, note, children }) {
      return h("label", { className: "hx-field" }, label, children, note && h("span", { className: "hx-note" }, note));
    }
    function QrLoginPanel({ onAuthenticated }) {
      const [qr, setQr] = useState(null);
      const [pending, setPending] = useState(false);
      const [error, setError] = useState("");
      const current = useRef(null);
      const active = useRef(false);
      const busy = useRef(false);
      const request = useRef(null);
      const revision = useRef(0);
      useEffect(() => {
        active.current = true;
        const timer = setInterval(async () => {
          const session = current.current;
          if (!session || !["waiting", "scanned"].includes(session.status) || busy.current) return;
          if (Date.now() >= session.expiresAt) {
            current.current = { ...session, status: "expired", image: null }; setQr(current.current); return;
          }
          busy.current = true;
          const token = revision.current;
          const controller = new AbortController(); request.current = controller;
          try {
            const next = await api("login", { action: "poll", sessionId: session.sessionId }, controller.signal);
            if (!active.current || revision.current !== token) return;
            current.current = next; setQr(next); setError("");
            if (next.status === "authenticated") {
              const account = await api("state", null, controller.signal);
              if (active.current && revision.current === token) onAuthenticated(account);
            }
          } catch (e) { if (active.current && token === revision.current && e.name !== "AbortError") setError(e.message); }
          finally { if (token === revision.current) busy.current = false; }
        }, 1500);
        return () => { active.current = false; revision.current++; clearInterval(timer); request.current?.abort(); };
      }, []);
      async function start() {
        if (pending) return;
        request.current?.abort();
        busy.current = true; setPending(true); setError("");
        const token = ++revision.current;
        const controller = new AbortController(); request.current = controller;
        try {
          const next = await api("login", { action: "start" }, controller.signal);
          if (active.current && revision.current === token) { current.current = next; setQr(next); }
        } catch (e) { if (active.current && token === revision.current && e.name !== "AbortError") setError(e.message); }
        finally { if (active.current && token === revision.current) { busy.current = false; setPending(false); } }
      }
      function cancel() {
        revision.current++; request.current?.abort(); busy.current = false; setPending(false);
        const session = current.current;
        current.current = null; setQr(null); setError("");
        if (session) api("login", { action: "cancel", sessionId: session.sessionId }).catch(() => {});
      }
      const messages = { waiting: "请使用小黑盒 App 扫码", scanned: "已扫码，请在手机上确认登录", authenticated: "扫码登录成功", expired: "二维码已过期，请刷新", requires_2fa: "账号需要额外验证，请在官网完成验证后使用 Cookie 备用登录" };
      return h("div", { className: "hx-details" },
        h("div", { className: "hx-row" }, h("button", { className: "hx-button", type: "button", disabled: pending, onClick: start }, pending ? "正在获取二维码…" : qr ? "刷新二维码" : "扫码登录"),
          qr && h("button", { className: "hx-button", type: "button", onClick: cancel }, "取消扫码")),
        error && h("div", { className: "hx-message hx-error", role: "alert" }, error),
        qr?.image && h("img", { src: qr.image, alt: "小黑盒 App 登录二维码", width: 256, height: 256, style: { maxWidth: "100%", height: "auto", alignSelf: "flex-start", borderRadius: 8 } }),
        qr && h("p", { className: "hx-note", role: "status" }, messages[qr.status] || "正在获取登录状态…"),
        h("p", { className: "hx-note" }, "使用小黑盒 App 扫码并确认，登录凭据由 DSH 宿主保存。二维码过期后可刷新。"));
    }
    function Panel() {
      const [status, setStatus] = useState(null);
      const [auth, setAuth] = useState(null);
      const [draft, setDraft] = useState(null);
      const [cookie, setCookie] = useState("");
      const [pending, setPending] = useState("");
      const [message, setMessage] = useState("");
      const [error, setError] = useState("");
      const [pollError, setPollError] = useState("");
      const [dirty, setDirty] = useState(false);
      const draftRef = useRef(null);
      const active = useRef(false);
      const action = useRef(false);
      const requests = useRef(new Set());
      const polling = useRef(false);
      function replaceDraft(value) { draftRef.current = value; setDraft(value); }
      function change(key, value) { replaceDraft({ ...draftRef.current, [key]: value }); setDirty(true); setMessage(""); }
      useEffect(() => {
        active.current = true;
        async function refresh() {
          if (action.current || polling.current) return;
          polling.current = true;
          const controller = new AbortController();
          requests.current.add(controller);
          try {
            const [nextStatus, nextAuth] = await Promise.all([
              api("automation", null, controller.signal), api("state", null, controller.signal),
            ]);
            if (!active.current || action.current) return;
            setStatus(nextStatus); setAuth(nextAuth); setPollError("");
            // Polling updates runtime status without replacing an unsaved form.
            if (!draftRef.current) replaceDraft(editable(nextStatus.config));
          } catch (e) { if (active.current && e.name !== "AbortError") setPollError(e.message); }
          finally { requests.current.delete(controller); polling.current = false; }
        }
        refresh();
        const timer = setInterval(refresh, 5000);
        return () => { active.current = false; clearInterval(timer); for (const controller of requests.current) controller.abort(); };
      }, []);
      async function perform(name, operation) {
        if (action.current) return;
        action.current = true;
        // Cancel older polls so an earlier snapshot cannot overwrite this action's result.
        for (const request of requests.current) request.abort();
        const controller = new AbortController();
        requests.current.add(controller);
        setPending(name); setMessage(""); setError("");
        try { await operation(controller.signal); }
        catch (e) { if (active.current && e.name !== "AbortError") setError(e.message); }
        finally { requests.current.delete(controller); action.current = false; if (active.current) setPending(""); }
      }
      function save(event) {
        event.preventDefault();
        return perform("save", async (signal) => {
          const next = await api("automation", { action: "configure", config: configFrom(draftRef.current) }, signal);
          if (!active.current) return;
          setStatus(next); replaceDraft(editable(next.config)); setDirty(false); setMessage("设置已保存");
        });
      }
      function stop() {
        return perform("stop", async (signal) => {
          const next = await api("automation", { action: "configure", config: { enabled: false } }, signal);
          if (!active.current) return;
          setStatus(next); replaceDraft({ ...draftRef.current, enabled: false });
          setMessage("已停止调度并请求取消当前生成；已提交的平台请求无法撤回。");
        });
      }
      function accountAction(login) {
        return perform("account", async (signal) => {
          const next = await api("state", login ? { action: "login", cookie } : { action: "logout" }, signal);
          if (!active.current) return;
          setAuth(next); setCookie(""); setMessage(login ? "账号信息已保存，请先运行一轮验证 Cookie。" : "已退出账号");
        });
      }
      const locked = !!pending || !!status?.busy;
      const number = (key, label, min, max) => h(Field, { label }, h("input", { className: "hx-input", type: "number", "aria-label": label, required: true, min, max, step: 1, value: draft[key], disabled: locked, onChange: (e) => change(key, e.target.value === "" ? "" : Number(e.target.value)) }));
      const text = (key, label, note) => h(Field, { label, note }, h("input", { className: "hx-input", type: "text", "aria-label": label, maxLength: key === "holidays" || key === "workdays" ? 5000 : 2000, value: draft[key], disabled: locked, onChange: (e) => change(key, e.target.value) }));
      const toggle = (key, label) => h(Toggle, { label, value: draft[key], disabled: locked, onChange: (value) => change(key, value) });
      return h("div", { className: "hx-page" },
        h("div", null, h("h2", null, "刷小黑盒"), h("p", { className: "hx-note" }, "定时读帖子，按需评论和回复。任务在 DSH 宿主后台运行。")),
        (error || pollError) && h("div", { className: "hx-message hx-error", role: "alert" }, error || pollError),
        message && h("div", { className: "hx-message", role: "status" }, message),
        h("section", { className: "hx-section" }, h("h3", null, "小黑盒账号"),
          !auth ? h("p", { className: "hx-note" }, "正在读取账号…") : h("div", { className: "hx-row" },
            h("span", { className: "hx-grow" }, auth.loggedIn ? "已保存 Cookie · 账号 " + (auth.heyboxId || "ID 未识别") : "尚未绑定账号"),
            auth.loggedIn && h("button", { className: "hx-button", disabled: !!pending, onClick: () => accountAction(false) }, "退出账号")),
          auth && h(QrLoginPanel, { key: String(auth.loggedIn) + ":" + auth.heyboxId, onAuthenticated: (next) => { if (active.current) { setAuth(next); setCookie(""); setMessage("扫码登录成功，账号信息已保存。"); } } }),
          h("details", null, h("summary", null, auth?.loggedIn ? "更新 Cookie（备用）" : "Cookie 登录（备用）"), h("div", { className: "hx-details" },
            h("p", { className: "hx-note" }, "在 ", h("a", { href: "https://www.xiaoheihe.cn", target: "_blank", rel: "noopener noreferrer" }, "小黑盒网页版"), " 登录，从开发者工具 Network 请求头复制 Cookie。内容只提交给 DSH 宿主保存。"),
            h(Field, { label: "Cookie" }, h("textarea", { className: "hx-input", "aria-label": "Cookie", rows: 3, value: cookie, maxLength: 16384, autoComplete: "off", spellCheck: false, disabled: !!pending, onChange: (e) => setCookie(e.target.value) })),
            h("button", { className: "hx-button", disabled: !!pending || !cookie.trim(), onClick: () => accountAction(true) }, "保存账号")))),
        !draft ? h("p", { className: "hx-note" }, "正在读取设置…") : h("form", { className: "hx-section", onSubmit: save },
          h("div", { className: "hx-row" }, h("div", { className: "hx-grow" }, toggle("enabled", "定时浏览总开关")),
            h("span", { className: "hx-note" }, dirty ? "有未保存的设置" : "设置已同步")),
          draft.enabled && h("div", { className: "hx-sub" },
            h("div", { className: "hx-grid" }, number("intervalMinutes", "执行间隔（分钟）", 1, 1440), number("postsPerRound", "每轮帖子数", 1, 10)),
            toggle("autoComment", "自动评论"),
            draft.autoComment && h("div", { className: "hx-sub" }, toggle("mentionAuthor", "评论时 @ 帖子作者"),
              h("p", { className: "hx-note" }, "@ 使用作者昵称纯文本，尚未验证是否触发通知。模型只在有合适内容时发言。"), number("dailyComments", "每日评论额度", 0, 100)),
            toggle("autoReply", "自动回复评论"),
            draft.autoReply && h("div", { className: "hx-sub" }, h("div", { className: "hx-grid" }, number("repliesPerRound", "每轮回复数", 1, 10), number("dailyReplies", "每日回复额度", 0, 100)),
              h("p", { className: "hx-note" }, "只回复能确认是回复自己评论的来信；无法核对关系时跳过。")),
            number("cooldownSeconds", "评论与回复最短间隔（秒）", 10, 3600),
            toggle("valleyOnly", "仅在谷时运行"),
            h("p", { className: "hx-note" }, "默认北京时间工作日 12:00–14:00、18:00–次日 09:00，周末全天。此开关约束整轮浏览与互动；时间窗口和节假日可在高级设置调整，不会自动查询模型价格。"),
            text("persona", "人设与兴趣", "用于生成相关评论；使用 DSH 已配置的 headless 模型。")),
          h("details", null, h("summary", null, "高级设置"), h("div", { className: "hx-details" },
            text("timeZone", "调度时区"), text("valleyWindows", "工作日谷时窗口", "JSON 分钟数组，默认 [[720,840],[1080,540]]，支持跨午夜。"),
            text("holidays", "节假日日期", "YYYY-MM-DD，多个日期用逗号分隔，当天全天为谷时。"), text("workdays", "周末补班日期", "YYYY-MM-DD，补班当天按工作日窗口执行。"),
            text("dshCommand", "DSH 命令或 JS 入口"), text("nodePath", "Node 可执行路径（可选）"), number("generationTimeoutSeconds", "生成超时（秒）", 10, 600))),
          h("div", { className: "hx-row" }, h("button", { className: "hx-button hx-primary", type: "submit", disabled: locked }, pending === "save" ? "保存中…" : "保存设置"),
            h("button", { className: "hx-button", type: "button", disabled: !!pending || !status?.config.enabled || status.busy || !auth?.loggedIn || dirty, onClick: () => perform("run", async (signal) => {
              const next = await api("automation", { action: "run" }, signal);
              if (active.current) { setStatus(next); setMessage("已请求执行一轮"); }
            }) }, "立即执行一轮"),
            h("button", { className: "hx-button", type: "button", disabled: !!pending || !(status?.config.enabled || status?.busy), onClick: stop }, "停止任务")),
          h("p", { className: "hx-note" }, "修改后保存生效；立即执行也需要总开关开启。运行中请先停止，等待本轮结束后修改设置。关闭浏览器不停止任务，退出 DSH 宿主后任务停止。")),
        status && h("section", { className: "hx-section" }, h("h3", null, "运行状态"),
          status.fault && h("div", { className: "hx-message hx-error", role: "alert" }, status.fault),
          h("div", { className: "hx-message", role: "status" }, status.busy ? "正在执行" : status.config.enabled ? "等待下一轮" : "已停止", " · 下次执行：", time(status.nextRunAt)),
          h("p", { className: "hx-note" }, "今日已用评论 ", status.usage.comment, " / ", status.config.dailyComments, "，回复 ", status.usage.reply, " / ", status.config.dailyReplies, "（按调度时区计数）")),
        status && h("section", null, h("h3", null, "最近运行记录"), h("p", { className: "hx-note" }, "最多显示最近 40 条事件，每 5 秒刷新。"), historyList(status.history)),
      );
    }
    function WatchTab() {
      const [status, setStatus] = useState(null);
      const [error, setError] = useState("");
      useEffect(() => {
        let active = true;
        let polling = false;
        const controller = new AbortController();
        async function refresh() {
          if (polling) return;
          polling = true;
          try { const next = await api("automation", null, controller.signal); if (active) { setStatus(next); setError(""); } }
          catch (e) { if (active && e.name !== "AbortError") setError(e.message); }
          finally { polling = false; }
        }
        refresh(); const timer = setInterval(refresh, 5000);
        return () => { active = false; clearInterval(timer); controller.abort(); };
      }, []);
      return h("div", { className: "hx-page hx-wide" }, h("h2", null, "刷过的帖子"),
        h("p", { className: "hx-note" }, "显示后台任务最近 40 条事件中的浏览记录，所有会话共享；不是完整浏览档案。点击标题前往小黑盒。"),
        error && h("div", { className: "hx-message hx-error", role: "alert" }, error),
        status ? historyList(status.history.filter((record) => record.type === "browse")) : h("p", { className: "hx-note" }, "正在读取记录…"));
    }
    return {
      inject: ["slots"],
      apply(ctx) {
        const style = document.createElement("style");
        style.setAttribute("data-plugin-css", "heybox-settings");
        style.textContent = CSS;
        document.head.appendChild(style);
        ctx.effect(() => () => style.remove());
        const slots = (typeof ctx.get === "function" ? ctx.get("slots") : undefined) || ctx.slots;
        if (!slots) return;
        slots.inject("settings.section", () => slots.register({ name: "settings.section", id: "heybox", order: 30, label: "刷小黑盒" }, () => h(Panel)));
        try {
          slots.inject("conversation.view", () => slots.register({ name: "conversation.view", id: "heybox-watched", order: 20, label: "刷过的帖子", scope: "session" }, () => h(WatchTab)));
        } catch { /* Older hosts may not expose conversation views. */ }
      },
    };
  },
});
