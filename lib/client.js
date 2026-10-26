/** DSH settings section and optional conversation view, following dsh-bili-scroll. */
window.__ModuleLoader__.load({
  id: "heybox",
  factory: (require) => {
    const React = require("react");
    const { useState, useEffect, useRef } = React;
    const h = React.createElement;
    const CSS = `
.hx-page{--hx-line:rgba(127,127,127,.2);--hx-fill:rgba(127,127,127,.055);--hx-muted:var(--dsw-alias-label-secondary,inherit);--hx-accent:#2678d5;display:flex;flex-direction:column;gap:22px;width:100%;max-width:820px;min-width:0;box-sizing:border-box;color:var(--dsw-alias-label-primary,inherit);font:inherit;padding:8px 4px 24px;line-height:1.6}
.hx-page *{box-sizing:border-box}.hx-page [hidden]{display:none!important}.hx-page h2,.hx-page h3,.hx-page p{margin:0}.hx-page h2{font-size:22px;font-weight:650;letter-spacing:-.5px}.hx-page h3{font-size:15px;font-weight:600}.hx-header{display:flex;align-items:center;justify-content:space-between;gap:16px}.hx-kicker{font-size:11px;font-weight:650;letter-spacing:1.6px;opacity:.5;margin-bottom:4px}.hx-note{font-size:12px;line-height:1.8;color:var(--hx-muted);opacity:.75}.hx-badge{display:inline-flex;align-items:center;gap:7px;flex:none;border:1px solid var(--hx-line);border-radius:99px;padding:5px 10px;font-size:12px;white-space:nowrap}.hx-badge:before{content:"";width:6px;height:6px;border-radius:50%;background:#9298a0}.hx-badge[data-active=true]:before{background:#27a583}
.hx-tabs{display:flex;gap:4px;padding:5px;border:1px solid var(--hx-line);border-radius:12px;background:var(--hx-fill);overflow-x:auto}.hx-tab{appearance:none;flex:1 0 auto;min-width:58px;white-space:nowrap;border:1px solid transparent;border-radius:8px;padding:8px 12px;font:inherit;font-size:13px;color:inherit;background:transparent;cursor:pointer;opacity:.65}.hx-tab[aria-selected=true]{background:var(--dsw-alias-background-primary,rgba(127,127,127,.13));border-color:var(--hx-line);box-shadow:0 1px 3px #0000000a;opacity:1;font-weight:600}.hx-form{display:flex;flex-direction:column;gap:20px;min-width:0}.hx-panel{display:flex;flex-direction:column;gap:20px;min-width:0}.hx-section{display:flex;flex-direction:column;gap:16px;padding:20px;border:1px solid var(--hx-line);border-radius:14px}.hx-section-head{display:flex;flex-direction:column;gap:4px}.hx-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.hx-grow{flex:1;min-width:140px}.hx-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.hx-field{display:flex;flex-direction:column;gap:7px;min-width:0;font-size:13px}.hx-input,.hx-button{appearance:none;font:inherit;font-size:13px;color:inherit;border:1px solid var(--hx-line);border-radius:8px;background:transparent;padding:9px 12px;line-height:1.6}.hx-input{display:block;width:100%;min-width:0;background:var(--hx-fill)}.hx-page textarea{resize:vertical}.hx-button{cursor:pointer;min-height:38px;font-weight:500;transition:transform 140ms cubic-bezier(.23,1,.32,1)}.hx-primary{background:var(--hx-accent);color:#fff;border-color:var(--hx-accent)}.hx-button:disabled,.hx-input:disabled{opacity:.45;cursor:default}.hx-page :focus-visible{outline:2px solid var(--hx-accent);outline-offset:3px}.hx-button:active:not(:disabled),.hx-tab:active{transform:scale(.97)}
.hx-toggle{display:flex;align-items:center;justify-content:space-between;gap:20px;position:relative;cursor:pointer;font-size:13px;line-height:1.7;min-height:28px}.hx-toggle-copy{display:flex;flex-direction:column;gap:3px}.hx-toggle input{appearance:none!important;position:absolute!important;right:0!important;width:40px!important;height:24px!important;margin:0!important;opacity:0;cursor:pointer}.hx-switch{display:block;flex:none;width:40px;height:24px;border:1px solid var(--hx-line);border-radius:99px;background:rgba(127,127,127,.2);pointer-events:none}.hx-switch:after{content:"";display:block;width:18px;height:18px;margin:2px;border-radius:50%;background:#fff;box-shadow:0 1px 3px #0002}.hx-toggle input:checked+.hx-switch{background:var(--hx-accent);border-color:var(--hx-accent)}.hx-toggle input:checked+.hx-switch:after{transform:translateX(16px)}.hx-toggle input:focus-visible+.hx-switch{outline:2px solid var(--hx-accent);outline-offset:3px}.hx-toggle:has(input:disabled){opacity:.5;cursor:default}.hx-divider{border:0;border-top:1px solid var(--hx-line);margin:0}.hx-message{font-size:13px;line-height:1.7;padding:11px 14px;border-radius:9px;background:var(--hx-fill);overflow-wrap:anywhere}.hx-error{color:var(--dsw-alias-status-error,#c54c3b)}.hx-footer{display:flex;flex-direction:column;gap:10px;border-top:1px solid var(--hx-line);padding-top:18px}.hx-save-state{font-size:12px;margin-left:auto;opacity:.6}.hx-save-state[data-dirty=true]{color:var(--hx-accent);opacity:1}.hx-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.hx-stat{padding:16px;border:1px solid var(--hx-line);border-radius:12px;background:linear-gradient(140deg,var(--hx-fill),transparent)}.hx-stat strong{display:block;font-size:24px;font-weight:600;line-height:1.4;font-variant-numeric:tabular-nums;letter-spacing:-.7px}.hx-stat small{font-size:12px;font-weight:400;letter-spacing:0;opacity:.5}.hx-stat .hx-stat-time{font-size:13px;letter-spacing:0;margin-top:8px;line-height:1.8}.hx-history{list-style:none;padding:0;margin:0;display:flex;flex-direction:column}.hx-history li{display:flex;align-items:flex-start;gap:14px;padding:14px 0;border-bottom:1px solid var(--hx-line);overflow-wrap:anywhere}.hx-history li:last-child{border-bottom:0}.hx-history-copy{flex:1;min-width:0}.hx-history-title{font-size:14px;font-weight:500;line-height:1.7}.hx-history .hx-note{margin-top:4px}.hx-history-index{font-size:12px;opacity:.35;min-width:22px;padding-top:3px;font-variant-numeric:tabular-nums}.hx-page a{color:inherit;text-underline-offset:3px}.hx-history-title a{text-decoration:none}.hx-empty{padding:30px 16px;text-align:center;border:1px dashed var(--hx-line);border-radius:12px}.hx-empty p{margin-top:6px}.hx-page summary{cursor:pointer;font-size:13px}.hx-details{display:flex;flex-direction:column;gap:14px;padding-top:14px}.hx-account{display:flex;align-items:center;gap:12px}.hx-account-icon{display:grid;place-items:center;width:42px;height:42px;border-radius:12px;background:var(--hx-fill);border:1px solid var(--hx-line);font-size:18px;font-weight:600}.hx-wide{max-width:920px;margin:0 auto;padding:28px clamp(18px,4vw,40px) 40px}.hx-watch-heading{display:flex;align-items:baseline;gap:10px}.hx-count{font-size:12px;opacity:.5}
.hx-comment-body{white-space:pre-wrap;overflow-wrap:anywhere;margin-top:10px!important;font-size:14px;line-height:1.85}.hx-quote{margin:12px 0 0;padding:8px 12px;border-left:2px solid var(--hx-line);background:var(--hx-fill);font-size:12px;white-space:pre-wrap;overflow-wrap:anywhere;color:var(--hx-muted)}.hx-install-log{margin:0;padding:14px;background:var(--hx-fill);border:1px solid var(--hx-line);border-radius:9px;font-size:12px;line-height:1.8;white-space:pre-wrap;overflow-wrap:anywhere;max-height:240px;overflow:auto}
@media(hover:hover) and (pointer:fine){.hx-button:hover:not(:disabled),.hx-tab:hover:not([aria-selected=true]){background:var(--hx-fill)}.hx-primary:hover:not(:disabled){background:#206bc0}.hx-history-title a:hover{text-decoration:underline}}
@media(max-width:520px){.hx-page{gap:18px}.hx-section{padding:16px}.hx-grid{grid-template-columns:1fr;gap:16px}.hx-tabs{gap:0;padding:4px}.hx-tab{padding:8px;min-width:46px}.hx-stats{gap:8px}.hx-stat{padding:12px 10px}.hx-stat strong{font-size:21px}.hx-stat .hx-stat-time{font-size:12px}.hx-save-state{width:100%;margin-left:0}.hx-footer .hx-button{flex-grow:1}.hx-header{align-items:flex-start}.hx-badge{margin-top:5px}.hx-wide{padding:22px 18px}}
@media(prefers-reduced-motion:reduce){.hx-button{transition:none}.hx-button:active:not(:disabled),.hx-tab:active{transform:none}}
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
      return { ...config, apiKey: "", holidays: config.holidays.join(", "), workdays: config.workdays.join(", ") };
    }
    function configFrom(draft) {
      const config = { ...draft };
      for (const key of ["holidays", "workdays"]) config[key] = draft[key].split(/[,，\s]+/).filter(Boolean);
      if (!config.apiKey) delete config.apiKey;
      return config;
    }
    function time(value) { return value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "—"; }
    function postLink(record) {
      return /^\d+$/.test(String(record.postId))
        ? h("a", { href: "https://www.xiaoheihe.cn/app/bbs/link/" + record.postId, target: "_blank", rel: "noopener noreferrer" }, record.title || "帖子 " + record.postId)
        : record.title || null;
    }
    const typeNames = { browse: "浏览", start: "开始", done: "完成", error: "失败", sent: "已发送", accepted: "已受理", unknown: "结果未知", rejected: "已拒绝", skip: "跳过" };
    function historyList(records, watched = false) {
      return records.length ? h("ul", { className: "hx-history" }, ...records.map((record, i) => h("li", { key: record.at + ":" + i },
        watched && h("span", { className: "hx-history-index", "aria-hidden": true }, String(i + 1).padStart(2, "0")),
        h("div", { className: "hx-history-copy" }, h("div", { className: "hx-history-title" }, watched ? postLink(record) || "帖子标题暂缺" : record.message),
          !watched && record.postId && h("div", { className: "hx-note" }, postLink(record)),
          h("div", { className: "hx-note" }, time(record.at), " · ", typeNames[record.type] || record.type)))))
        : h("div", { className: "hx-empty" }, h("h3", null, watched ? "还没有浏览记录" : "暂无运行记录"), h("p", { className: "hx-note" }, "开启任务后，最近的记录会显示在这里。"));
    }
    function Toggle({ label, note, value, onChange, disabled }) {
      return h("label", { className: "hx-toggle" }, h("span", { className: "hx-toggle-copy" }, h("span", null, label), note && h("span", { className: "hx-note" }, note)),
        h("input", { type: "checkbox", "aria-label": label, checked: value, disabled, onChange: (e) => onChange(e.target.checked) }), h("span", { className: "hx-switch", "aria-hidden": true }));
    }
    function interactionList(records, filter) {
      const selected = records.filter((record) => filter === "all" || record.kind === filter);
      const names = { sent: "已发送", accepted: "已受理，未返回评论 ID", unknown: "结果未知，请勿重复发送", rejected: "已拒绝" };
      return selected.length ? h("ul", { className: "hx-history" }, ...selected.map((record, i) => h("li", { key: record.at + ":" + i },
        h("div", { className: "hx-history-copy" },
          h("div", { className: "hx-row" }, h("span", { className: "hx-note" }, record.kind === "reply" ? "回复评论" : "评论帖子"), h("span", { className: "hx-note" }, names[record.status] || record.status)),
          h("div", { className: "hx-history-title" }, postLink(record)),
          record.incoming && h("blockquote", { className: "hx-quote" }, "对方：", record.incoming),
          h("p", { className: "hx-comment-body" }, record.displayText || record.text || "旧版记录未保存正文，升级后产生的内容会显示在这里。"),
          h("p", { className: "hx-note" }, time(record.at), record.commentId ? " · 评论 ID " + record.commentId : "")))))
        : h("div", { className: "hx-empty" }, h("h3", null, "暂无评论记录"), h("p", { className: "hx-note" }, "自动评论或回复发起后，可在这里查看正文与发送状态。"));
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
      const [tab, setTab] = useState("overview");
      const [recordFilter, setRecordFilter] = useState("all");
      const [dependencies, setDependencies] = useState(null);
      const [dependencyError, setDependencyError] = useState("");
      const [configJson, setConfigJson] = useState(null);
      const tabRefs = useRef({});
      const draftRef = useRef(null);
      const active = useRef(false);
      const action = useRef(false);
      const requests = useRef(new Set());
      const polling = useRef(false);
      function replaceDraft(value) { draftRef.current = value; setDraft(value); }
      function change(key, value) { replaceDraft({ ...draftRef.current, [key]: value }); setDirty(true); setMessage(""); setError(""); }
      function schedulePreset(preset) {
        const windows = preset === "valley" ? [[720, 840], [1080, 540]] : [[0, 360]];
        replaceDraft({ ...draftRef.current, valleyOnly: preset !== "all", ...(preset === "all" ? {} : {
          valleyWindows: windows, weekendWindows: preset === "valley" ? [[0, 1440]] : windows,
          holidayWindows: preset === "valley" ? [[0, 1440]] : windows,
        }) });
        setDirty(true); setMessage(""); setError("");
      }
      useEffect(() => {
        active.current = true;
        async function refresh() {
          if (action.current || polling.current) return;
          polling.current = true;
          const controller = new AbortController();
          requests.current.add(controller);
          try {
            const [nextStatus, nextAuth, nextDependencies] = await Promise.all([
              api("automation", null, controller.signal), api("state", null, controller.signal),
              api("dependencies", null, controller.signal).then((value) => ({ value }), (error) => ({ error })),
            ]);
            if (!active.current || action.current) return;
            setStatus(nextStatus); setAuth(nextAuth); setPollError("");
            if (nextDependencies.value) { setDependencies(nextDependencies.value); setDependencyError(""); }
            else if (nextDependencies.error.name !== "AbortError") setDependencyError(nextDependencies.error.message);
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
        const invalid = Array.from(event.currentTarget?.elements || []).find((field) => field.willValidate && !field.validity.valid);
        if (invalid) {
          setTab(invalid.closest("[role=tabpanel]").dataset.tab);
          setError(invalid.getAttribute("aria-label") + "：" + invalid.validationMessage);
          requestAnimationFrame(() => invalid.focus());
          return;
        }
        return perform("save", async (signal) => {
          const next = await api("automation", { action: "configure", config: configFrom(draftRef.current) }, signal);
          if (!active.current) return;
          setStatus(next); replaceDraft(editable(next.config)); setDirty(false); setMessage("设置已保存");
        });
      }
      function stop() {
        return perform("stop", async (signal) => {
          const next = await api("automation", { action: "configure", config: { enabled: false, autoReply: false } }, signal);
          if (!active.current) return;
          setStatus(next); replaceDraft({ ...draftRef.current, enabled: false, autoReply: false });
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
      const persona = (key, label, note) => h(Field, { label, note }, h("textarea", { className: "hx-input", "aria-label": label, rows: 4, maxLength: 2000, value: draft[key], disabled: locked, onChange: (e) => change(key, e.target.value) }));
      const toggle = (key, label, note) => h(Toggle, { label, note, value: draft[key], disabled: locked, onChange: (value) => change(key, value) });
      const select = (key, label, options) => h(Field, { label }, h("select", { className: "hx-input", "aria-label": label, value: draft[key], disabled: locked, onChange: (e) => change(key, e.target.value) },
        ...options.map(([value, title]) => h("option", { key: value, value }, title))));
      const clock = (minute) => String(Math.floor(minute % 1440 / 60)).padStart(2, "0") + ":" + String(minute % 60).padStart(2, "0");
      const windowSummary = (windows = [[0, 1440]]) => windows.length ? windows.map(([start, end]) =>
        start === 0 && end === 1440 ? "全天" : clock(start) + "–" + (end === 1440 ? "24:00" : end < start ? "次日 " + clock(end) : clock(end))).join("、") : "不运行";
      const windowsEditor = (key, title) => {
        const windows = draft[key] || [[0, 1440]];
        const update = (index, edge, value) => {
          if (!/^\d{2}:\d{2}$/.test(value)) return;
          const [hour, minute] = value.split(":").map(Number);
          const next = windows.map((window) => [...window]);
          next[index][edge] = edge === 1 && hour === 0 && minute === 0 ? 1440 : hour * 60 + minute;
          change(key, next);
        };
        return section(title, "可添加多段；结束时间早于开始时间表示跨午夜。00:00 → 00:00 表示全天；移除全部时间段表示当天不运行。",
          ...windows.map(([start, end], index) => h("div", { className: "hx-row", key: index },
            h(Field, { label: "开始" }, h("input", { className: "hx-input", type: "time", step: 60, required: true, "aria-label": title + "开始 " + (index + 1), value: clock(start), disabled: locked, onChange: (e) => update(index, 0, e.target.value) })),
            h("span", { "aria-hidden": true }, "→"),
            h(Field, { label: "结束" }, h("input", { className: "hx-input", type: "time", step: 60, required: true, "aria-label": title + "结束 " + (index + 1), value: clock(end), disabled: locked, onChange: (e) => update(index, 1, e.target.value) })),
            h("span", { className: "hx-note" }, start === 0 && (end === 1440 || end === 0) ? "全天" : end < start ? "跨午夜" : end === 1440 ? "至当天午夜" : ""),
            h("button", { className: "hx-button", type: "button", "aria-label": "移除" + title + " " + (index + 1), disabled: locked, onClick: () => change(key, windows.filter((_, i) => i !== index)) }, "移除"))),
          !windows.length && h("p", { className: "hx-note" }, "当天不运行"),
          h("div", { className: "hx-row" },
            h("button", { className: "hx-button", type: "button", disabled: locked || windows.length >= 10, onClick: () => change(key, [...windows, [540, 1080]]) }, "添加" + title),
            h("button", { className: "hx-button", type: "button", disabled: locked, onClick: () => change(key, [[0, 1440]]) }, title + "全天"),
            h("button", { className: "hx-button", type: "button", disabled: locked, onClick: () => change(key, []) }, title + "不运行")));
      };
      const tabs = [["overview", "概览"], ["account", "账号"], ["browse", "浏览"], ["interaction", "互动"], ["records", "评论记录"], ["valley", "运行时段"], ["advanced", "高级"]];
      const section = (title, note, ...children) => h("section", { className: "hx-section" }, h("div", { className: "hx-section-head" }, h("h3", null, title), note && h("p", { className: "hx-note" }, note)), ...children);
      // Keep panels mounted so QR polling and form edits survive tab changes.
      const panel = (id, ...children) => h("div", { role: "tabpanel", id: "hx-panel-" + id, "aria-labelledby": "hx-tab-" + id, "data-tab": id, hidden: tab !== id, tabIndex: 0, className: "hx-panel" }, ...children);
      const stateLabel = status?.busy ? "正在执行" : (status?.config.enabled || status?.config.autoReply) ? "等待调度检查" : "已停止";
      return h("div", { className: "hx-page" },
        h("header", { className: "hx-header" }, h("div", null, h("div", { className: "hx-kicker" }, "HEYBOX / AUTOMATION"), h("h2", null, "刷小黑盒"), h("p", { className: "hx-note" }, "按你的节奏，浏览与交流。")),
          h("span", { className: "hx-badge", "data-active": !!(status?.busy || status?.config.enabled || status?.config.autoReply), role: "status" }, status ? stateLabel : "连接中")),
        h("div", { className: "hx-tabs", role: "tablist", "aria-label": "小黑盒设置菜单" }, ...tabs.map(([id, label], index) => h("button", {
          key: id, ref: (node) => { tabRefs.current[id] = node; }, type: "button", role: "tab", id: "hx-tab-" + id, "aria-controls": "hx-panel-" + id,
          "aria-selected": tab === id, tabIndex: tab === id ? 0 : -1, className: "hx-tab", onClick: () => setTab(id),
          onKeyDown: (event) => {
            const offset = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
            if (!offset && !["Home", "End"].includes(event.key)) return;
            event.preventDefault();
            const next = tabs[event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + offset + tabs.length) % tabs.length][0];
            setTab(next); tabRefs.current[next]?.focus();
          },
        }, label))),
        (error || pollError) && h("div", { className: "hx-message hx-error", role: "alert" }, error || pollError),
        message && h("div", { className: "hx-message", role: "status" }, message),
        h("form", { className: "hx-form", onSubmit: save, noValidate: true },
          panel("overview", status ? h(React.Fragment, null,
            status.fault && h("div", { className: "hx-message hx-error", role: "alert" }, status.fault),
            status.replyPaused && h("div", { className: "hx-message hx-error", role: "alert" }, status.replyPaused),
            h("div", { className: "hx-stats" },
              h("div", { className: "hx-stat" }, h("p", { className: "hx-note" }, "今日评论"), h("strong", null, status.usage.comment, h("small", null, " / " + status.config.dailyComments))),
              h("div", { className: "hx-stat" }, h("p", { className: "hx-note" }, "今日回复"), h("strong", null, status.usage.reply, h("small", null, " / " + status.config.dailyReplies))),
              h("div", { className: "hx-stat" }, h("p", { className: "hx-note" }, "下次浏览检查"), h("strong", { className: "hx-stat-time" }, status.runningKind === "browse" ? "本轮结束后计算" : time(status.nextRunAt)),
                h("p", { className: "hx-note" }, "到点检查运行条件，符合条件才开始。时间按浏览器本地时区显示。"))),
            section("已生效的任务规则", "频率决定何时检查，运行时段决定能否开始。状态每 5 秒刷新。",
              dirty && h("p", { className: "hx-note" }, "有未保存的修改；此处仍显示已保存的规则。"),
              h("p", { className: "hx-note" }, "浏览检查间隔：" + status.config.intervalMinutes + " 分钟（从本轮结束后计时）；每轮最多浏览 " + status.config.postsPerRound + " 个新帖子。"),
              h("p", { className: "hx-note" }, "浏览运行时段：" + (status.config.valleyOnly ? "仅在自定义时段内开始任务" : "全天允许，不限制时段") + " · 调度时区：" + status.config.timeZone),
              status.config.valleyOnly && h(React.Fragment, null,
                h("p", { className: "hx-note" }, "工作日：" + windowSummary(status.config.valleyWindows)),
                h("p", { className: "hx-note" }, "周末：" + windowSummary(status.config.weekendWindows) + "；节假日：" + windowSummary(status.config.holidayWindows)),
                h("p", { className: "hx-note" }, "不在允许时段时跳过本次检查，间隔结束后再检查；不会在时段开始时额外触发。节假日和补班日期按运行时段页的设置判断。")),
              h("p", { className: "hx-note" }, "回复检查：" + (status.config.autoReply ? "每 " + status.config.replyIntervalSeconds + " 秒；" + (status.config.replyFollowSchedule ? "跟随浏览运行时段" : "全天检查") : "已关闭")),
              h("p", { className: "hx-note" }, "下次回复检查：" + (status.replyPaused ? "已暂停" : status.runningKind === "reply" ? "本轮结束后计算" : time(status.nextReplyAt)) + (status.replyFailures ? " · 连续失败，已延长间隔" : "")),
              h("p", { className: "hx-note" }, "自动评论" + (status.config.autoComment ? "开启" : "关闭") + " · 自动回复" + (status.config.autoReply ? "开启" : "关闭") + " · 每日额度按调度时区统计。"),
              h("div", { className: "hx-row" }, h("button", { className: "hx-button", type: "button", onClick: () => setTab("browse") }, "调整执行频率"), h("button", { className: "hx-button", type: "button", onClick: () => setTab("valley") }, "调整运行时段"), !auth?.loggedIn && h("button", { className: "hx-button", type: "button", onClick: () => setTab("account") }, "绑定账号"))),
            section("最近动态", "最近 40 条运行事件，所有会话共享。", historyList(status.history))) : h("p", { className: "hx-note" }, "正在读取运行状态…")),
          panel("account", section("小黑盒账号", "使用小黑盒 App 扫码，在手机上确认即可登录。",
            !auth ? h("p", { className: "hx-note" }, "正在读取账号…") : h("div", { className: "hx-account" }, h("span", { className: "hx-account-icon", "aria-hidden": true }, "盒"),
              h("div", { className: "hx-grow" }, h("h3", null, auth.loggedIn ? "账号已绑定" : "尚未绑定账号"), h("p", { className: "hx-note" }, auth.loggedIn ? "已保存 Cookie · 账号 " + (auth.heyboxId || "ID 未识别") : "绑定后即可开始自动浏览")),
              auth.loggedIn && h("button", { className: "hx-button", type: "button", disabled: !!pending, onClick: () => accountAction(false) }, "退出账号")),
            auth && h(QrLoginPanel, { key: String(auth.loggedIn) + ":" + auth.heyboxId, onAuthenticated: (next) => { if (active.current) { setAuth(next); setCookie(""); setMessage("扫码登录成功，账号信息已保存。"); } } })),
            section("备用登录", "扫码遇到问题时，可手动更新 Cookie。", h("details", null, h("summary", null, auth?.loggedIn ? "更新 Cookie" : "使用 Cookie 登录"), h("div", { className: "hx-details" },
              h("p", { className: "hx-note" }, "在 ", h("a", { href: "https://www.xiaoheihe.cn", target: "_blank", rel: "noopener noreferrer" }, "小黑盒网页版"), " 登录，从开发者工具 Network 请求头复制 Cookie，仅提交给 DSH 宿主保存。"),
              h(Field, { label: "Cookie" }, h("textarea", { className: "hx-input", "aria-label": "Cookie", rows: 3, value: cookie, maxLength: 16384, autoComplete: "off", spellCheck: false, disabled: !!pending, onChange: (e) => setCookie(e.target.value) })),
              h("div", null, h("button", { className: "hx-button", type: "button", disabled: !!pending || !cookie.trim(), onClick: () => accountAction(true) }, "保存账号")))))),
          panel("browse", draft ? section("执行频率与数量", "设置多久检查一次、每轮最多浏览多少个新帖子；允许开始任务的时间在「运行时段」中设置。",
            toggle("enabled", "定时浏览开关", "由 DSH 宿主在后台执行"), h("hr", { className: "hx-divider" }),
            h("div", { className: "hx-grid" }, number("intervalMinutes", "调度检查间隔（分钟）", 1, 1440), number("postsPerRound", "每轮最多浏览帖子数", 1, 10)),
            h("p", { className: "hx-note" }, "本轮结束或跳过后，等待上述间隔再检查。保存设置也会重新计时。例如每 30 分钟检查一次、仅允许 00:00–06:00，白天的检查会跳过，不刷帖子。"),
            h("p", { className: "hx-note" }, "关闭设置页或浏览器后任务继续；退出 DSH 宿主后停止。")) : h("p", { className: "hx-note" }, "正在读取设置…")),
          panel("interaction", draft && h(React.Fragment, null,
            section("评论帖子", "有合适内容时才发言，默认关闭。", toggle("autoComment", "自动评论"), toggle("mentionAuthor", "评论时添加 @ 提及", "按官方客户端样本生成带用户 ID 的提及链接；实际通知仍待平台验证。仅影响帖子评论。"),
              select("mentionTarget", "评论提及对象", [["author", "帖子作者"], ["custom", "自定义用户"], ["none", "不提及"]]),
              draft.mentionTarget === "custom" && h(React.Fragment, null,
                text("mentionName", "自定义提及昵称", "填写完整昵称，也支持 @昵称。由插件添加提及，无需在人格中设置。"),
                text("mentionUserId", "提及用户 ID", "必填：填写该用户的数字 ID，例如 12345678。必须与昵称属于同一账号；旧配置仅填昵称时会停止该条评论发送。")),
              number("dailyComments", "每日评论额度", 0, 100)),
            section("回复来信", "独立于浏览任务检查消息；只回复能确认是在回复自己的评论。开启后将在下一次调度检查时启动（通常 5 秒内）。", toggle("autoReply", "自动回复评论"),
              h("div", { className: "hx-grid" }, number("replyIntervalSeconds", "回复检查间隔（秒）", 30, 86400), number("repliesPerRound", "每轮最多处理来信数", 1, 10), number("dailyReplies", "每日回复额度", 0, 100)),
              toggle("replyFollowSchedule", "回复跟随浏览运行时段", "关闭时全天检查回复；不受定时浏览开关影响。"),
              h("p", { className: "hx-note" }, "默认每 180 秒检查。优先使用未读标记；没有已读标记时仅处理启用后的消息，时间不明则跳过；明确未读可能包含旧来信。模型可决定不回复，跳过也计入本轮处理数。"),
              h("p", { className: "hx-note" }, "回复与浏览串行执行，共用发送冷却；生成耗时、当前浏览任务和限流退避都会延迟回复。登录失效或人机验证会暂停检查，请处理后重新登录。")),
            section("发言人格", "DSH 和第三方 API 都使用这些人格设置。",
              persona("persona", "通用人设与兴趣", "用于帖子评论；回复人格留空时也使用此设置。"),
              persona("replyPersona", "回复人格", "只影响回复评论，可设置语气、立场与回答习惯；留空沿用通用人设。"),
              number("cooldownSeconds", "评论与回复最短间隔（秒）", 10, 3600)))),
          panel("records", section("评论与回复", "显示当前账号最近 100 条发送记录，每 5 秒刷新；已受理或结果未知不等于确认发布。",
            h("div", { className: "hx-row", role: "group", "aria-label": "评论记录类型" }, ...[["all", "全部"], ["comment", "帖子评论"], ["reply", "评论回复"]].map(([value, label]) =>
              h("button", { key: value, type: "button", className: "hx-button" + (recordFilter === value ? " hx-primary" : ""), "aria-pressed": recordFilter === value, onClick: () => setRecordFilter(value) }, label))),
            interactionList(status?.interactions || [], recordFilter))),
          panel("valley", draft && h(React.Fragment, null,
            section("允许运行时段", "这是浏览任务的时间限制。回复仅在开启「回复跟随浏览运行时段」时遵守这里的设置。",
              h("div", { className: "hx-row", role: "group", "aria-label": "时段快捷方案" }, ...[["all", "不限时段"], ["valley", "峰谷快捷方案"], ["bottom", "峰底快捷方案"]].map(([value, label]) =>
                h("button", { key: value, className: "hx-button", type: "button", disabled: locked, onClick: () => schedulePreset(value) }, label))),
              h("p", { className: "hx-note" }, "峰谷预设：工作日 12:00–14:00、18:00–次日 09:00，周末和节假日全天。峰底示例：每天 00:00–06:00。它们是可修改的本地预设，请按所用 API 的实际时段调整。"),
              toggle("valleyOnly", "限制任务开始时段", "关闭时全天允许，保留下方时间段；开启后限制浏览和评论；回复仅在开启跟随时段时受限，发送前也会检查。已开始的一轮浏览可能延续到时段外。"), text("timeZone", "调度时区"),
              h("p", { className: "hx-note" }, "选择快捷方案只修改表单，保存后生效。时段开始时不会立即触发；较短时段可能被较长的检查间隔错过，请在「浏览」中缩短间隔。")),
            windowsEditor("valleyWindows", "工作日时段"), windowsEditor("weekendWindows", "周末时段"), windowsEditor("holidayWindows", "节假日时段"),
            section("日历例外", "节假日使用节假日时段；周末补班使用工作日时段。同一天同时列入时，节假日优先。", text("holidays", "节假日日期", "YYYY-MM-DD，多个日期用逗号分隔。"), text("workdays", "周末补班日期", "YYYY-MM-DD，多个日期用逗号分隔。"), h("p", { className: "hx-note" }, "这是本地时间策略，不会自动查询模型价格。")))),
          panel("advanced", section("依赖与环境", "一键安装扫码所需的 qrcode；安装到当前 DSH 数据目录，无需重启。",
            dependencyError && h("p", { className: "hx-error", role: "alert" }, dependencyError),
            dependencies ? h(React.Fragment, null,
              h("div", { className: "hx-message" }, "Node " + dependencies.nodeVersion + (dependencies.nodeReady ? " · 可用" : " · 需要 Node 18+"), h("br"),
                "DSH 命令：" + (dependencies.dshReady ? "已找到" : "未找到，请检查下方命令和 Node 路径"), h("br"),
                "扫码依赖：" + (dependencies.qrReady ? "已就绪" : "未安装"), " · npm：" + (dependencies.npmReady ? "可用" : "未找到")),
              h("div", null, h("button", { className: "hx-button", type: "button", disabled: !!pending || dependencies.installing || !dependencies.npmReady, onClick: () => perform("dependencies", async (signal) => {
                const next = await api("dependencies", { action: "install" }, signal);
                if (active.current) { setDependencies(next); setMessage("已开始安装依赖，可在这里查看进度。网页关闭后安装仍会继续。"); }
              }) }, dependencies.installing ? "正在安装依赖…" : "一键安装依赖")),
              dependencies.error && h("p", { className: "hx-error", role: "alert" }, dependencies.error),
              dependencies.logs?.length > 0 && h("pre", { className: "hx-install-log", "aria-label": "依赖安装进度", role: "log" }, dependencies.logs.join("\n")))
              : h("p", { className: "hx-note" }, "正在检测依赖…"),
            h("p", { className: "hx-note" }, "此处检测已保存的命令路径。DSH 随宿主安装，模型连接需在 DSH 中配置。")),
            draft && section("模型来源", "第三方 API 使用兼容 Chat Completions 的接口。评论与回复均遵守互动页的人格设置。",
              select("generationProvider", "生成方式", [["dsh", "DSH 已配置模型"], ["external", "第三方 API"]]),
              draft.generationProvider === "external" && h(React.Fragment, null,
                text("apiBaseUrl", "API Base URL", "例如 https://api.example.com/v1；也可填写完整 /chat/completions 地址。本机服务支持 HTTP。"),
                text("apiModel", "模型名称"),
                h(Field, { label: "API Key", note: status?.apiKeyConfigured ? "已保存密钥，留空保留；填写新密钥后保存即可替换。" : "尚未保存密钥；本机无鉴权服务可留空。" },
                  h("input", { className: "hx-input", type: "password", "aria-label": "API Key", autoComplete: "new-password", maxLength: 4096, value: draft.apiKey, disabled: locked, onChange: (e) => change("apiKey", e.target.value) })),
                h("button", { className: "hx-button", type: "button", disabled: locked || !status?.apiKeyConfigured, onClick: () => perform("clear-key", async (signal) => {
                  const next = await api("automation", { action: "configure", config: { apiKey: "" } }, signal);
                  if (active.current) { setStatus(next); replaceDraft({ ...draftRef.current, apiKey: "" }); setMessage("已清除保存的 API Key，其他未保存设置仍保留。"); }
                }) }, "清除已保存密钥")),
              number("generationTimeoutSeconds", "生成超时（秒）", 10, 600)),
            draft && section("DSH 生成环境", "使用 DSH 模型时，自定义路径用于修复宿主的命令或 Node 环境。",
              text("dshCommand", "DSH 命令或 JS 入口"), text("nodePath", "Node 可执行路径（可选）")),
            draft && section("配置文件", "配置与浏览历史独立保存。可在这里编辑 JSON，或直接编辑服务器文件；文件修改在下一轮前读取。",
              h("p", { className: "hx-note" }, status?.configPath || "DSH_HOME/heybox/config.json"),
              h("button", { className: "hx-button", type: "button", disabled: locked, onClick: () => {
                const config = configFrom(draftRef.current); delete config.apiKey;
                setConfigJson(JSON.stringify(config, null, 2));
              } }, configJson === null ? "编辑配置 JSON" : "从当前表单重新载入 JSON"),
              configJson !== null && h(React.Fragment, null,
                h(Field, { label: "配置 JSON", note: "此快照不显示密钥。未提供 apiKey 时保留原密钥；显式设置 apiKey 为空字符串可清除。保存 JSON 后会同步表单，覆盖尚未保存的表单修改。" },
                  h("textarea", { className: "hx-input", "aria-label": "配置 JSON", rows: 18, spellCheck: false, maxLength: 32768, value: configJson, disabled: locked, onChange: (e) => setConfigJson(e.target.value) })),
                h("button", { className: "hx-button", type: "button", disabled: locked, onClick: () => perform("config-json", async (signal) => {
                  const next = await api("automation", { action: "configure", config: JSON.parse(configJson) }, signal);
                  if (active.current) { setStatus(next); replaceDraft(editable(next.config)); setConfigJson(null); setDirty(false); setMessage("配置文件已保存"); }
                }) }, "保存配置文件")))),
          draft && h("footer", { className: "hx-footer" },
            h("div", { className: "hx-row" }, h("button", { className: "hx-button hx-primary", type: "submit", disabled: locked }, pending === "save" ? "保存中…" : "保存设置"),
              h("button", { className: "hx-button", type: "button", disabled: !!pending || !status?.config.enabled || status.busy || !auth?.loggedIn || dirty, onClick: () => perform("run", async (signal) => {
                const next = await api("automation", { action: "run" }, signal);
                if (active.current) { setStatus(next); setMessage("已请求执行一轮"); }
              }) }, "立即执行一轮"),
              h("button", { className: "hx-button", type: "button", disabled: !!pending || !(status?.config.enabled || status?.config.autoReply || status?.busy), onClick: stop }, "停止全部任务"),
              h("span", { className: "hx-save-state", "data-dirty": dirty, role: "status" }, dirty ? "有未保存的设置" : "设置已同步")),
            h("p", { className: "hx-note" }, "保存全部菜单的修改。立即执行一轮用于浏览，需要开启浏览开关；自动回复独立计时。停止全部任务会同时关闭浏览和回复；运行中请先停止再修改设置。"))),
      );
    }

    function WatchTab() {
      const [status, setStatus] = useState(null);
      const [error, setError] = useState("");
      const [offset, setOffset] = useState(0);
      useEffect(() => {
        let active = true;
        let polling = false;
        const controller = new AbortController();
        async function refresh() {
          if (polling) return;
          polling = true;
          try { const next = await api("watched?offset=" + offset + "&limit=50", null, controller.signal); if (active) { setStatus(next); setError(""); } }
          catch (e) { if (active && e.name !== "AbortError") setError(e.message); }
          finally { polling = false; }
        }
        refresh(); const timer = setInterval(refresh, 5000);
        return () => { active = false; clearInterval(timer); controller.abort(); };
      }, [offset]);
      return h("div", { className: "hx-page hx-wide" }, h("header", { className: "hx-watch-heading" }, h("h2", null, "刷过的帖子"), status && h("span", { className: "hx-count" }, "共 " + status.total + " 帖")),
        h("p", { className: "hx-note" }, "当前账号的独立浏览档案，每页 50 帖，所有会话共享。旧版标题缺失时显示帖子 ID。点击标题前往小黑盒。"),
        error && h("div", { className: "hx-message hx-error", role: "alert" }, error),
        status ? historyList(status.records, true) : h("p", { className: "hx-note" }, "正在读取记录…"),
        status && h("div", { className: "hx-row", "aria-label": "浏览记录分页" },
          h("button", { className: "hx-button", disabled: offset === 0, onClick: () => { setStatus(null); setOffset(Math.max(0, offset - 50)); } }, "上一页"),
          h("span", { className: "hx-note" }, "第 " + (offset / 50 + 1) + " 页"),
          h("button", { className: "hx-button", disabled: offset + 50 >= status.total, onClick: () => { setStatus(null); setOffset(offset + 50); } }, "下一页")));
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
