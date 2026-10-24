/**
 * heybox — browser half(小黑盒论坛分区).
 *
 * 右侧可伸缩分区里的一个小黑盒客户端,形态照搬 WenfuRainbow/heybox
 * (VSCode 扩展)的交互:
 *
 *   - 「推荐」信息流(分页)、「板块」分类树(展开加载帖子)、「收藏」(本地 + 服务端同步)
 *   - 全站帖子搜索(分页 / 返回)
 *   - 帖子详情:正文(JSON 富文本块 img/text)+ 按楼层评论组(主评 + 嵌套子评)、
 *     折叠评论提示、自动分页拉评论(去重)、图片缩放滑块 + 悬停原图预览
 *   - Cookie 登录(粘贴,只发主机侧存储)、登出;登录后每 3 分钟轮询消息,铃铛徽标,
 *     可查看并跳转
 *   - 主题:跟随 DSH(auto)/ 强制暗 / 亮(面板内重定义 CSS 变量)
 *
 * 数据全部走主机语义 RPC(POST /heybox/rpc),hkey 签名与 Cookie 不在浏览器。
 * 布局沿用旧版「右侧贴会话、绝不挡聊天与输入框、窄窗自动收胶囊、可拖宽」。
 *
 * @module heybox/client
 */
window.__ModuleLoader__.load({
  id: "heybox",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    const React = require("react");
    const { useState, useEffect, useRef, useCallback } = React;
    const h = React.createElement;

    // ---------------------------------------------------------------------
    // 存储与工具
    // ---------------------------------------------------------------------
    function lsGet(key, fb) {
      try {
        const raw = localStorage.getItem(key);
        if (raw == null) return fb;
        return JSON.parse(raw);
      } catch {
        return fb;
      }
    }
    function lsSet(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {
        /* ignore */
      }
    }
    function esc(s) {
      return String(s == null ? "" : s);
    }
    function hostOf(url) {
      try {
        return new URL(url).host;
      } catch {
        return "";
      }
    }
    /** 相对时间,照抄 heybox htmlRenderer.formatTs。 */
    function fmtTs(ts) {
      if (!ts) return "";
      const diff = Math.floor(Date.now() / 1000) - ts;
      if (diff < 60) return "刚刚";
      if (diff < 3600) return Math.floor(diff / 60) + "分钟前";
      if (diff < 86400) return Math.floor(diff / 3600) + "小时前";
      const now = new Date();
      const d = new Date(ts * 1000);
      const dayDiff = Math.floor(diff / 86400);
      if (dayDiff < 7) return dayDiff + "天前";
      if (dayDiff < 30) return Math.floor(dayDiff / 7) + "周前";
      const monthDiff = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
      if (monthDiff < 12) return monthDiff + "个月前";
      return d.getFullYear() + "年" + (d.getMonth() + 1) + "月" + d.getDate() + "日";
    }
    /** 图片统一走主机 /heybox/img 代理(防外链防盗)。 */
    function imgOf(u) {
      if (!u) return "";
      return "/heybox/img?u=" + encodeURIComponent(u);
    }
    /**
     * 原图地址:预览 URL 带 CDN 压缩指令(如 imageMogr2 …/thumbnail/850x1450>),
     * 去掉 thumbnail 缩放段即回到该文件的原始尺寸(实测 187KB → 319KB @1280px)。
     */
    function originOf(u) {
      if (!u) return u;
      const qi = u.indexOf("?");
      if (qi < 0) return u;
      const base = u.slice(0, qi);
      const q = u.slice(qi + 1).replace(/thumbnail\/[^/\s&]*/gi, "").replace(/^\?/, "");
      if (q === u.slice(qi + 1)) return u; // 没有可去的缩放指令
      return q.trim() ? base + "?" + q : base;
    }
    const lv = (u) => (u && u.level_info && u.level_info.status === 1 ? "Lv." + u.level_info.level : "");
    const levelCls = (u) => (u && u.level_info && u.level_info.status === 1 ? u.level_info.level || 0 : 0);

    // ---------------------------------------------------------------------
    // 主题令牌(DSH tokens + 强制主题覆盖)
    // ---------------------------------------------------------------------
    const BASE = {
      label: "var(--dsw-alias-label-primary, #1f2328)",
      label2: "var(--dsw-alias-label-secondary, #57606a)",
      label3: "var(--dsw-alias-label-tertiary, #8a919c)",
      bg: "var(--dsw-alias-bg-base, #ffffff)",
      bgSoft: "var(--dsw-alias-bg-subtle, rgba(31,35,40,.04))",
      hover: "var(--dsw-alias-interactive-bg-hover, rgba(31,35,40,.08))",
      border: "var(--dsw-alias-border-l1, rgba(31,35,40,.1))",
      border2: "var(--dsw-alias-border-l2, rgba(31,35,40,.16))",
      brand: "var(--dsw-alias-brand-primary, #4f6ef2)",
      warn: "var(--dsw-alias-state-warn-primary, #bf8700)",
      err: "var(--dsw-alias-state-error-primary, #cf222e)",
      shadow: "0 18px 50px rgba(20,22,28,.18), 0 2px 8px rgba(20,22,28,.08)",
    };
    const DARK = {
      label: "#e6e6e6", label2: "#b3b3b3", label3: "#8b8b8b", bg: "#1f1f1f",
      bgSoft: "rgba(255,255,255,.06)", hover: "rgba(255,255,255,.1)",
      border: "rgba(255,255,255,.1)", border2: "rgba(255,255,255,.2)",
      brand: "#5b8cff", warn: "#e0a83e", err: "#ff7b72",
      shadow: "0 18px 50px rgba(0,0,0,.55), 0 2px 8px rgba(0,0,0,.4)",
    };
    const LIGHT = {
      label: "#24292f", label2: "#57606a", label3: "#8a919c", bg: "#ffffff",
      bgSoft: "rgba(31,35,40,.045)", hover: "rgba(31,35,40,.08)",
      border: "rgba(31,35,40,.1)", border2: "rgba(31,35,40,.16)",
      brand: "#3b5bdb", warn: "#b47d00", err: "#cf222e",
      shadow: "0 18px 50px rgba(20,22,28,.14), 0 2px 8px rgba(20,22,28,.07)",
    };

    const CSS = `
      .hx2{box-sizing:border-box;position:fixed;display:flex;flex-direction:column;
        background:${BASE.bg};color:${BASE.label};border:1px solid ${BASE.border2};
        border-radius:14px;box-shadow:${BASE.shadow};overflow:hidden;
        font-family:var(--dsw-font-family,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'PingFang SC','Microsoft YaHei',sans-serif);
        z-index:2147480000}
      /* 强制主题:只在面板子树内覆盖 DSH 设计令牌,全部子规则自动跟随 */
      .hx2[data-theme=dark]{--dsw-alias-label-primary:#e6e6e6;--dsw-alias-label-secondary:#b3b3b3;
        --dsw-alias-label-tertiary:#8a8f98;--dsw-alias-label-caption:#8a8f98;--dsw-alias-bg-base:#202020;
        --dsw-alias-bg-subtle:rgba(255,255,255,.055);--dsw-alias-border-l1:rgba(255,255,255,.09);
        --dsw-alias-border-l2:rgba(255,255,255,.18);--dsw-alias-border-l3:rgba(255,255,255,.32);
        --dsw-alias-interactive-bg-hover:rgba(255,255,255,.12);
        --dsw-alias-brand-primary:#7aa2ff;--dsw-alias-brand-soft:rgba(122,162,255,.16);
        --dsw-alias-state-warn-primary:#e6b45e;--dsw-alias-state-error-primary:#ff8378}
      .hx2[data-theme=light]{--dsw-alias-label-primary:#24292f;--dsw-alias-label-secondary:#57606a;
        --dsw-alias-label-tertiary:#8a919c;--dsw-alias-label-caption:#8a919c;--dsw-alias-bg-base:#ffffff;
        --dsw-alias-bg-subtle:rgba(31,35,40,.045);--dsw-alias-border-l1:rgba(31,35,40,.1);
        --dsw-alias-border-l2:rgba(31,35,40,.16);--dsw-alias-border-l3:rgba(31,35,40,.3);
        --dsw-alias-interactive-bg-hover:rgba(31,35,40,.08);
        --dsw-alias-brand-primary:#3b5bdb;--dsw-alias-brand-soft:rgba(59,91,219,.1);
        --dsw-alias-state-warn-primary:#b47d00;--dsw-alias-state-error-primary:#cf222e}
      .hx2 button{font-family:inherit}
      .hx2 .tk{color:${BASE.label2}} .hx2 .tk2{color:${BASE.label3}}
      .hx2[data-theme=dark] .tk{color:${DARK.label2}} .hx2[data-theme=dark] .tk2{color:${DARK.label3}}
      .hx2[data-theme=light] .tk{color:${LIGHT.label2}} .hx2[data-theme=light] .tk2{color:${LIGHT.label3}}
      .hx2-head{flex:none;border-bottom:1px solid ${BASE.border}}
      .hx2-row{display:flex;align-items:center;gap:4px;padding:6px 8px}
      .hx2-logo{display:flex;align-items:center;gap:6px;font-size:13.5px;font-weight:800;letter-spacing:.2px;flex:none}
      .hx2-logo .hb{color:${BASE.brand}}
      .hx2-grow{flex:1;min-width:0}
      .hx2-btn{box-sizing:border-box;height:26px;min-width:26px;padding:0 8px;border:0;border-radius:8px;
        background:transparent;color:${BASE.label3};font-size:12px;cursor:pointer;display:inline-flex;
        align-items:center;justify-content:center;gap:4px;white-space:nowrap;
        transition:background-color .12s,color .12s}
      .hx2-btn:hover{background:${BASE.hover};color:${BASE.label}}
      .hx2-btn:disabled{opacity:.4;cursor:default}
      .hx2-btn[data-on]{color:${BASE.brand}}
      .hx2-chip{box-sizing:border-box;height:24px;padding:0 9px;border:1px solid ${BASE.border};
        border-radius:999px;background:transparent;color:${BASE.label3};font-size:11px;cursor:pointer;
        display:inline-flex;align-items:center;gap:3px;transition:all .12s}
      .hx2-chip:hover{color:${BASE.label2};border-color:${BASE.border2}}
      .hx2-seg{box-sizing:border-box;height:28px;display:inline-flex;border:1px solid ${BASE.border};
        border-radius:14px;overflow:hidden;flex:none}
      .hx2-seg>button{box-sizing:border-box;height:100%;padding:0 11px;border:0;background:transparent;
        color:${BASE.label2};font-size:12px;cursor:pointer;transition:all .12s}
      .hx2-seg>button:hover{background:${BASE.hover};color:${BASE.label}}
      .hx2-seg>button[data-on]{background:${BASE.hover};color:${BASE.label};font-weight:600}
      .hx2-bell{position:relative}
      .hx2-bell .cnt{position:absolute;top:-3px;right:-3px;min-width:15px;height:15px;border-radius:8px;
        background:${BASE.err};color:#fff;font-size:10px;line-height:15px;text-align:center;padding:0 3px;
        font-weight:700}
      .hx2-body{flex:1;min-height:0;position:relative;display:flex;flex-direction:column;overflow:hidden}
      .hx2-scroll{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain}
      .hx2-scroll::-webkit-scrollbar{width:8px}
      .hx2-scroll::-webkit-scrollbar-thumb{background:${BASE.border2};border-radius:4px}
      .hx2-loading{padding:30px 0;text-align:center;color:${BASE.label3};font-size:12px}
      .hx2-empty{padding:26px 16px;text-align:center;color:${BASE.label3};font-size:12.5px;line-height:1.8}
      .hx2-tip{font-size:11px;color:${BASE.label3};padding:8px 14px;border-top:1px solid ${BASE.border}}
      .hx2-more{display:block;width:calc(100% - 24px);margin:4px 12px 14px;box-sizing:border-box;height:30px;
        border:1px dashed ${BASE.border2};border-radius:10px;background:transparent;color:${BASE.label3};
        font-size:12px;cursor:pointer}
      .hx2-more:hover:not(:disabled){background:${BASE.hover};color:${BASE.label2}}
      .hx2-more:disabled{opacity:.5}
      .hx2-sec{display:flex;align-items:center;gap:6px;padding:9px 12px 5px;font-size:12px;font-weight:700;
        color:${BASE.label2}}
      .hx2-sec .x{font-size:10px;color:${BASE.label3};font-weight:400}
      .hx2-board{border:0;border-bottom:1px solid ${BASE.border};background:transparent;width:100%;
        display:flex;align-items:center;gap:8px;padding:9px 12px;cursor:pointer;text-align:left;
        color:${BASE.label};transition:background-color .12s}
      .hx2-board:hover{background:${BASE.hover}}
      .hx2-board .nm{font-size:13px;font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .hx2-board .dt{font-size:11px;color:${BASE.label3};flex:none}
      .hx2-board .ar{margin-left:auto;font-size:10px;color:${BASE.label3}}
      .hx2-post{border:0;border-bottom:1px solid ${BASE.border};background:transparent;width:100%;
        padding:9px 12px;cursor:pointer;text-align:left;color:${BASE.label};display:flex;flex-direction:column;
        gap:3px;transition:background-color .12s}
      .hx2-post:hover{background:${BASE.hover}}
      .hx2-tt{font-size:13px;line-height:1.45;font-weight:600;color:${BASE.label}}
      .hx2-ds{font-size:12px;line-height:1.5;color:${BASE.label2};display:-webkit-box;
        -webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
      .hx2-mt{display:flex;align-items:center;gap:8px;font-size:11px;color:${BASE.label3};flex-wrap:wrap}
      .hx2-post .tg{color:${BASE.brand};background:var(--dsw-alias-brand-soft, rgba(79,110,242,.1));
        padding:1px 6px;border-radius:999px;font-size:10px}
      .hx2-pill{box-sizing:border-box;position:fixed;z-index:2147480000;display:inline-flex;align-items:center;
        gap:6px;height:32px;padding:0 13px;border-radius:999px;border:1px solid ${BASE.border2};
        background:${BASE.bg};color:${BASE.label2};font-size:12.5px;font-weight:600;cursor:pointer;
        box-shadow:${BASE.shadow}}
      .hx2-pill:hover{background:${BASE.hover};color:${BASE.label}}
      .hx2-pill .dot{width:7px;height:7px;border-radius:50%;background:${BASE.brand}}
      .hx2-grip{position:absolute;left:0;top:0;bottom:0;width:6px;cursor:col-resize;z-index:8}
      .hx2-grip:hover,.hx2-grip:active{background:${BASE.hover}}
      /* 详情页 */
      .hx2-detail{position:absolute;inset:0;display:flex;flex-direction:column;background:${BASE.bg}}
      .hx2-dbar{flex:none;display:flex;align-items:center;gap:6px;padding:7px 10px;border-bottom:1px solid ${BASE.border}}
      .hx2-dtl{flex:1;min-height:0;overflow-y:auto;padding:14px 16px 20px}
      .hx2-dtl h1{font-size:17px;font-weight:700;line-height:1.45;margin:2px 0 8px}
      .hx2-dmeta{font-size:11.5px;color:${BASE.label3};display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-bottom:8px}
      .hx2-avatar{width:26px;height:26px;border-radius:50%;object-fit:cover;flex:none;background:${BASE.bgSoft}}
      .hx2-tags{font-size:11px;color:${BASE.label3};margin-bottom:10px}
      .hx2-tags .t{color:${BASE.brand};margin-right:6px}
      .hx2-scale{display:flex;align-items:center;gap:8px;font-size:11px;color:${BASE.label3};
        padding:6px 12px;border-bottom:1px solid ${BASE.border};flex:none;background:${BASE.bg}}
      .hx2-scale input[type=range]{flex:1;max-width:150px;accent-color:${BASE.brand}}
      .hx2-content{font-size:13.5px;line-height:1.8;margin:10px 0 18px;word-break:break-word}
      .hx2-content p{margin:4px 0;white-space:pre-wrap}
      .hx2-content img,.hx2-cimg{display:block;max-width:calc(100% * var(--hx2-scale, .4));border-radius:6px;
        margin:6px 0;transition:max-width .15s;cursor:zoom-in}
      .hx2-csec{font-size:13px;font-weight:700;margin:6px 0 10px;display:flex;gap:6px;align-items:center}
      .hx2-cg{padding:7px 0}
      .hx2-cm{display:flex;gap:9px;padding:7px 0;color:${BASE.label}}
      .hx2-cm.sub{margin-left:44px}
      .hx2-lv{font-size:10.5px;color:${BASE.label3};font-weight:400}
      .hx2-chd{display:flex;align-items:center;gap:6px;font-size:12.5px;font-weight:600;flex-wrap:wrap}
      .hx2-flr{font-size:10px;color:${BASE.label3};background:${BASE.bgSoft};padding:0 5px;border-radius:3px;
        font-weight:400}
      .hx2-rpl{font-size:11.5px;color:${BASE.label3}}
      .hx2-rpl::before{content:"↳ "}
      .hx2-cmeta{font-size:10.5px;color:${BASE.label3};display:flex;gap:7px;margin:2px 0}
      .hx2-submore{margin:2px 0 6px 44px}
      .hx2-repcnt{margin:0 0 2px 44px;font-size:10.5px;color:${BASE.label3}}
      /* 大图查看器(覆盖在面板内容之上) */
      .hx2-view{position:absolute;inset:0;z-index:40;background:rgba(8,10,14,.86);
        backdrop-filter:blur(2px);display:flex;align-items:center;justify-content:center}
      .hx2-view-stage{width:100%;height:100%;position:relative;overflow:hidden;
        display:flex;align-items:center;justify-content:center;cursor:grab;touch-action:none}
      .hx2-view-stage:active{cursor:grabbing}
      .hx2-view-img{display:block;max-width:100%;max-height:100%;object-fit:contain;
        user-select:none;-webkit-user-drag:none;will-change:transform;border-radius:2px}
      .hx2-view-hud{position:absolute;left:50%;bottom:12px;transform:translateX(-50%);
        display:flex;align-items:center;gap:10px;padding:6px 12px;border-radius:999px;
        background:rgba(30,34,42,.72);color:#e8eaee;font-size:11px;white-space:nowrap}
      .hx2-view-btn{box-sizing:border-box;height:22px;padding:0 10px;border:1px solid rgba(255,255,255,.35);
        border-radius:999px;background:transparent;color:#fff;font-size:11px;cursor:pointer}
      .hx2-view-btn:hover{background:rgba(255,255,255,.14)}
      .hx2-subexp{box-sizing:border-box;height:24px;padding:0 10px;border:1px dashed ${BASE.border2};
        border-radius:999px;background:transparent;color:${BASE.label3};font-size:11px;cursor:pointer;
        transition:color .12s,background-color .12s,border-color .12s}
      .hx2-subexp:hover:not(:disabled){color:${BASE.brand};border-color:${BASE.brand}}
      .hx2-subexp:disabled{opacity:.5;cursor:default}
      .hx2-suball{margin:0 0 6px 44px;font-size:10.5px;color:${BASE.label3};opacity:.8}
      .hx2-ct{font-size:12.5px;line-height:1.7;margin:3px 0;white-space:pre-wrap;word-break:break-word}
      .hx2-foot{font-size:11px;color:${BASE.label3};text-align:center;padding:12px 0 4px}
      .hx2-prev{position:fixed;z-index:2147480001;pointer-events:none;display:none;border:1px solid ${BASE.border2};
        border-radius:8px;background:${BASE.bg};box-shadow:${BASE.shadow};overflow:hidden}
      .hx2-prev img{display:block;max-width:min(46vw,560px);max-height:70vh}
      /* 登录弹层 */
      .hx2-modal{position:absolute;inset:0;background:rgba(10,12,16,.55);z-index:9;display:flex;
        align-items:center;justify-content:center;padding:18px;backdrop-filter:blur(3px)}
      .hx2-login{box-sizing:border-box;width:100%;max-width:340px;background:${BASE.bg};color:${BASE.label};
        border:1px solid ${BASE.border2};border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:10px}
      .hx2-login h3{margin:0;font-size:14px}
      .hx2-login textarea{box-sizing:border-box;width:100%;height:92px;resize:vertical;border:1px solid ${BASE.border2};
        border-radius:10px;background:${BASE.bgSoft};color:${BASE.label};font-size:11px;padding:8px;line-height:1.5}
      .hx2-login .hint{font-size:11px;color:${BASE.label3};line-height:1.7}
      .hx2-login .acts{display:flex;gap:8px;justify-content:flex-end}
      .hx2-primary{box-sizing:border-box;height:28px;padding:0 14px;border:0;border-radius:14px;cursor:pointer;
        background:${BASE.brand};color:#fff;font-size:12px;font-weight:600}
      .hx2-ghost{box-sizing:border-box;height:28px;padding:0 12px;border:1px solid ${BASE.border2};border-radius:14px;
        background:transparent;color:${BASE.label2};cursor:pointer;font-size:12px}
      .hx2-toast{position:absolute;left:8px;right:8px;top:8px;z-index:12;display:flex;flex-direction:column;gap:5px;
        pointer-events:none}
      .hx2-toast>div{pointer-events:auto;padding:8px 12px;border-radius:10px;background:${BASE.label};
        color:${BASE.bg};font-size:12px;box-shadow:${BASE.shadow}}
      .hx2-toast[data-err]>div{background:${BASE.err};color:#fff}
      /* 消息抽屉 */
      .hx2-msg{position:absolute;inset:0;z-index:10;background:${BASE.bg};display:flex;flex-direction:column}
      .hx2-msg .list{flex:1;overflow-y:auto}
      .hx2-mi{display:flex;gap:9px;padding:10px 12px;border-bottom:1px solid ${BASE.border}}
      .hx2-mi .bd{min-width:0}
      .hx2-mi .who{font-size:12px;font-weight:600}
      .hx2-mi .txt{font-size:12px;color:${BASE.label2};line-height:1.6;word-break:break-word}
      .hx2-mi .lt{font-size:11px;color:${BASE.brand};margin-top:3px}
      @keyframes hx2pop{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
      .hx2-toast>div,.hx2-login{animation:hx2pop .15s ease}
      @media (prefers-reduced-motion:reduce){.hx2-btn,.hx2-chip,.hx2-post,.hx2-board{transition:none}}
    `;

    // ---------------------------------------------------------------------
    // 几何:贴会话右侧、不挡内容(照旧版逻辑)
    // ---------------------------------------------------------------------
    function measureFit(prefWidth) {
      const hasDom =
        typeof window !== "undefined" &&
        typeof document !== "undefined" &&
        typeof document.querySelector === "function" &&
        Number.isFinite(window.innerWidth);
      if (!hasDom) return { fit: false, found: false, left: 0, top: 40, width: prefWidth || 460, vw: 1280, vh: 800 };
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      // 独立桌面窗口:整窗停靠
      if (typeof window !== "undefined" && window.__HEYBOX_APP__) {
        return { fit: true, found: true, left: 0, top: 0, width: Math.max(320, vw - 12), vw, vh };
      }
      let rect = null;
      let chatW = 748;
      const scroll = document.querySelector("[data-conversation-scroll]");
      if (scroll && scroll.getBoundingClientRect) {
        rect = scroll.getBoundingClientRect();
        if (rect.width > 0) {
          try {
            const v = getComputedStyle(scroll).getPropertyValue("--dsh-chat-content-width").trim();
            if (v && /px$/.test(v)) chatW = parseFloat(v) || 748;
          } catch {
            /* keep default */
          }
        } else rect = null;
      }
      let found = !!rect;
      if (!rect) {
        const col = document.querySelector('[class*="sidebarCol"]');
        const sb = col && col.getBoundingClientRect ? col.getBoundingClientRect().width : 264;
        found = !!col;
        rect = { left: Math.max(0, sb), right: vw, top: 40, width: Math.max(0, vw - sb) };
      }
      const cx = rect.left + rect.width / 2;
      const convRight = rect.right;
      const minLeft = cx + chatW / 2 + 24;
      const avail = convRight - 12 - minLeft;
      const width = Math.min(prefWidth, Math.max(0, avail));
      const fit = avail >= 300;
      const top = Math.max(8, rect.top || 40) + 4;
      return { fit, found, left: convRight - 12 - width, top, width, vw, vh };
    }

    // ---------------------------------------------------------------------
    // 展示组件(模块级:稳定身份,避免整树重挂载)
    // ---------------------------------------------------------------------
    function PostRow({ p, onOpen, extra }) {
      return h(
        "div",
        {
          className: "hx2-post",
          role: "button",
          tabIndex: 0,
          onClick: onOpen,
          onKeyDown: (e) => { if (e.key === "Enter" && onOpen) onOpen(); },
        },
        h("span", { className: "hx2-tt" }, p.title || (p.description || "").slice(0, 40) || "无标题"),
        p.description ? h("span", { className: "hx2-ds" }, p.description) : null,
        h("span", { className: "hx2-mt" },
          h("span", null, "💬 " + (p.comment_num || 0)),
          h("span", null, fmtTs(p.create_at)),
          p.user && p.user.username ? h("span", null, p.user.username) : null,
          (p.topics || []).slice(0, 2).map((t) => h("span", { key: t.topic_id, className: "hx2-tg" }, t.name)),
          extra || null,
        ),
      );
    }

    function CommentBlock({ c, sub, onImg }) {
      const name = (c.user && c.user.username) || "匿名";
      const openImg = onImg || null;
      const ava =
        c.user && c.user.avatar
          ? h("img", { className: "hx2-avatar", src: imgOf(c.user.avatar), alt: name, onError: (e) => (e.currentTarget.style.display = "none") })
          : h("span", { className: "hx2-avatar", style: { display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12, background: "transparent" } }, name[0] || "?");
      return h("div", { className: "hx2-cm" + (sub ? " sub" : "") },
        ava,
        h("div", { style: { flex: 1, minWidth: 0 } },
          h("div", { className: "hx2-chd" },
            h("span", null, name),
            lv(c.user) ? h("span", { className: "hx2-lv" }, lv(c.user)) : null,
            h("span", { className: "hx2-flr" }, "#" + (c.floor_num || 0)),
            c.replyuser ? h("span", { className: "hx2-rpl" }, c.replyuser.username) : null,
          ),
          h("div", { className: "hx2-cmeta" },
            h("span", null, fmtTs(c.create_at)),
            c.ip_location ? h("span", null, c.ip_location) : null,
            c.up ? h("span", null, "👍 " + c.up) : null,
          ),
          h("div", { className: "hx2-ct" }, c.text || ""),
          (c.imgs || []).map((im, i) => {
            const src = imgOf(im.url);
            return h("img", {
              key: i,
              className: "hx2-cimg",
              src,
              alt: "",
              loading: "lazy",
              title: "点击查看大图",
              onClick: openImg ? () => openImg(im.url) : undefined, // 传原始地址,查看器内部再决定预览/原图
              onError: (e) => (e.currentTarget.style.display = "none"),
            });
          }),
        ),
      );
    }

    /**
     * 一组评论(1 主评 + 子回复)。
     * 树接口每组最多下发 2 条子评;真实回复总数在主评 child_num。多于 2 条时
     * 收进「展开更多回复」:点一次经 /bbs/app/comment/sub/comments 拉 ≤10 条,
     * 用响应 lastval 作游标续页,直到 has_more 结束或数量凑齐。
     */
    function CommentThread({ item, onErr, onImg }) {
      const [subs, setSubs] = useState(item.subs || []);
      const [cursor, setCursor] = useState(null);
      const [loading, setLoading] = useState(false);
      const [stopped, setStopped] = useState(false);
      const total = item.total || (item.subs ? item.subs.length : 0);
      const shown = subs.length;
      const remaining = Math.max(0, total - shown);

      const loadMore = async () => {
        if (loading || !item.main || !item.main.commentid) return;
        setLoading(true);
        try {
          const res = await API.subComments(item.main.commentid, cursor);
          const list = ((res && res.comments) || []).filter((c) => c && c.commentid);
          setSubs((prev) => {
            const seen = new Set(prev.map((x) => x.commentid));
            return [...prev, ...list.filter((x) => !seen.has(x.commentid))];
          });
          if (res && res.has_more && list.length > 0) {
            setCursor(res.lastval ? String(res.lastval) : null);
          } else {
            setStopped(true);
          }
        } catch (e) {
          onErr(e, "子评论加载失败");
        } finally {
          setLoading(false);
        }
      };

      const needMore = !stopped && remaining > 0;
      const doneAll = stopped && remaining <= 0 && total > 0;

      return h("div", { className: "hx2-cg" },
        h(CommentBlock, { c: item.main, sub: false, onImg }),
        total > 0 ? h("div", { className: "hx2-repcnt" }, "↩ 共 " + total + " 条回复") : null,
        subs.map((s) => h(CommentBlock, { key: s.commentid, c: s, sub: true, onImg })),
        needMore
          ? h("div", { className: "hx2-submore" },
              h("button", { className: "hx2-subexp", onClick: loadMore, disabled: loading },
                loading ? "加载中…" : "展开更多回复"),
            )
          : null,
        doneAll
          ? h("div", { className: "hx2-suball" }, "— 已展开全部 " + total + " 条回复 —")
          : null,
      );
    }

    /** 帖子正文:JSON 富文本块(img/text)→ 元素数组;纯文本 → 单段。onImg 用于点图看大图。 */
    function contentBlocks(text, onImg) {
      if (!text) return null;
      let blocks = null;
      try {
        const j = JSON.parse(text);
        if (Array.isArray(j)) blocks = j;
      } catch {
        /* plain text */
      }
      if (!blocks) return h("p", null, text);
      return blocks
        .map((b, i) => {
          if (b && b.type === "img" && b.url) {
            const src = imgOf(b.url);
            return h("img", {
              key: i,
              src,
              alt: "帖子图片",
              loading: "lazy",
              title: "点击查看大图",
              onClick: onImg ? () => onImg(b.url) : undefined, // 传原始地址,查看器内部再决定预览/原图
              onError: (e) => (e.currentTarget.style.display = "none"),
            });
          }
          if (b && b.type === "text" && b.text) return h("p", { key: i }, b.text);
          return null;
        })
        .filter(Boolean);
    }

    /**
     * 点开图片的大图查看器:尺寸不超出面板;滚轮/双指(ctrl+wheel)以指针为锚缩放,
     * 按住拖动平移;再次点图、点空白、Esc 关闭;双击恢复 100%。
     */
    function ViewerImg({ url, onClose }) {
      const stageRef = useRef(null);
      const [s, setS] = useState(1);
      const [ox, setOx] = useState(50); // transformOrigin %
      const [oy, setOy] = useState(50);
      const [pan, setPan] = useState({ x: 0, y: 0 });
      const drag = useRef(null);
      const suppress = useRef(false);

      const reset = () => { setS(1); setOx(50); setOy(50); setPan({ x: 0, y: 0 }); };

      // 滚轮缩放(含触控板双指:浏览器会以 ctrlKey 的 wheel 表达)
      useEffect(() => {
        const el = stageRef.current;
        if (!el) return undefined;
        const onWheel = (e) => {
          e.preventDefault();
          const r = el.getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * 100;
          const py = ((e.clientY - r.top) / r.height) * 100;
          const f = Math.exp(-e.deltaY * 0.002);
          setS((v) => Math.min(16, Math.max(0.25, v * f)));
          setOx(Math.min(100, Math.max(0, px)));
          setOy(Math.min(100, Math.max(0, py)));
          setPan({ x: 0, y: 0 }); // 重新锚定时清掉平移,避免叠加漂移
        };
        el.addEventListener("wheel", onWheel, { passive: false });
        return () => el.removeEventListener("wheel", onWheel);
      }, []);

      // Esc 关闭(捕获阶段抢先,避免外层 Esc 收起面板)
      useEffect(() => {
        const onKey = (e) => {
          if (e.key === "Escape") {
            e.stopImmediatePropagation();
            e.stopPropagation();
            onClose();
          }
        };
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
      }, [onClose]);

      const onPointerDown = (e) => {
        if (e.target && e.target.closest && (e.target.closest("button") || e.target.closest(".hx2-view-hud"))) return;
        drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y, moved: 0 };
        suppress.current = false;
        e.currentTarget.setPointerCapture(e.pointerId);
      };
      const onPointerMove = (e) => {
        const d = drag.current;
        if (!d) return;
        const mx = e.clientX - d.x;
        const my = e.clientY - d.y;
        d.moved = Math.max(d.moved, Math.abs(mx) + Math.abs(my));
        if (d.moved > 4) {
          suppress.current = true; // 这次是拖动,不当作点击关闭
          if (s > 1) {
            setPan({ x: d.px + mx, y: d.py + my });
          }
        }
      };
      const onPointerUp = () => {
        drag.current = null;
      };
      // 按钮/HUD 等交互控件:不启动拖动捕获,也不当作"点空白关闭"
      const isCtrl = (t) => !!(t && t.closest && (t.closest("button") || t.closest(".hx2-view-hud")));
      const onClick = (e) => {
        if (isCtrl(e.target)) return;
        if (suppress.current) {
          suppress.current = false;
          return;
        }
        onClose();
      };

      // 原图切换:url 为上游原始地址;默认直接显示高清原图(有压缩指令时),可一键切回预览
      const [hi, setHi] = useState(true);
      const origin = originOf(url);
      const shownUrl = hi && origin !== url ? imgOf(origin) : imgOf(url);
      const toggleOrigin = () => {
        if (origin === url) return; // 本来就无缩放指令,无需切换
        setHi((v) => !v);
        reset();
      };

      return h("div", { className: "hx2-view" },
        h("div", {
          className: "hx2-view-stage",
          ref: stageRef,
          onClick,
          onDoubleClick: (e) => { e.stopPropagation(); reset(); },
          onPointerDown,
          onPointerMove,
          onPointerUp,
          onPointerCancel: onPointerUp,
        },
          h("img", {
            className: "hx2-view-img",
            src: shownUrl,
            alt: "",
            draggable: false,
            style: {
              transform: "translate(" + pan.x + "px," + pan.y + "px) scale(" + s + ")",
              transformOrigin: ox + "% " + oy + "%",
            },
          }),
          h("div", { className: "hx2-view-hud" },
            h("span", null, Math.round(s * 100) + "%"),
            h("button", { className: "hx2-view-btn", onClick: (e) => { e.stopPropagation(); reset(); } }, "100%"),
            origin !== url
              ? h("button", { className: "hx2-view-btn", onClick: (e) => { e.stopPropagation(); toggleOrigin(); } },
                  hi ? "回到预览" : "查看原图")
              : null,
            h("span", null, "滚轮/双指缩放 · 拖动平移 · 点按或 Esc 关闭"),
          ),
        ),
      );
    }

    // ---------------------------------------------------------------------
    // 主机语义 RPC
    // ---------------------------------------------------------------------
    async function rpc(path, params, opts) {
      const o = opts || {};
      const body = { path, params: params || {}, method: o.method || "GET" };
      if (o.form) body.form = o.form;
      const r = await fetch("/heybox/rpc", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30000),
      });
      let j = null;
      try {
        j = await r.json();
      } catch {
        throw new Error("主机返回异常(" + r.status + ")");
      }
      if (j && j.ok) return j.result;
      if (j && j.code === "relogin") {
        const e = new Error(j.msg || "登录已过期");
        e.relogin = true;
        throw e;
      }
      throw new Error((j && (j.msg || j.error)) || "请求失败");
    }

    // ---- 端点(与 heybox src/api/client.ts 对齐) ----
    const API = {
      feed: (offset, pull) =>
        rpc("/bbs/app/feeds", { offset: String(offset || 0), pull: String(pull == null ? "0" : pull), dw: "800" }),
      categories: () => rpc("/bbs/app/topic/categories", {}),
      topicFeeds: (topicId, offset) =>
        rpc("/bbs/app/topic/feeds", { topic_id: String(topicId), offset: String(offset), limit: "30" }),
      tree: (linkId, offset, limit) =>
        rpc("/bbs/app/link/tree", { link_id: String(linkId), offset: String(offset), limit: String(limit || 100) }),
      // 更多子回复:接口忽略 offset,用响应里的 lastval(上页末条评论 id)做游标,每页 10 条
      subComments: (rootId, cursor) => {
        const p = { root_comment_id: String(rootId), limit: "10" };
        if (cursor) p.lastval = String(cursor);
        return rpc("/bbs/app/comment/sub/comments", p);
      },
      search: (q, opts) =>
        rpc("/bbs/app/api/general/search/v1/web", {
          q,
          search_type: "link",
          // 实测:该接口忽略 page,认 offset 分页;limit 内部还有折算(100 约回 64)
          offset: String((opts && opts.offset) || 0),
          limit: String((opts && opts.limit) || 100),
        }),
      messages: (listType, offset) =>
        rpc("/bbs/app/user/message", { list_type: String(listType), offset: String(offset || 0), limit: "10", no_more: "false" }),
      favour: (linkId) => rpc("/bbs/app/link/favour", { link_id: String(linkId) }, { method: "POST", form: { link_id: String(linkId) } }),
    };

    // ---------------------------------------------------------------------
    // 主组件
    // ---------------------------------------------------------------------
    function Heybox() {
      const storedPanel = () => lsGet("heybox:v2:panel", {});
      const [open, setOpen] = useState(() => storedPanel().open !== false);
      const [width, setWidth] = useState(() => storedPanel().width || 460);
      const [theme, setTheme] = useState(() => storedPanel().theme || "auto");
      const [force, setForce] = useState(false);

      const [auth, setAuth] = useState({ loggedIn: false, deviceId: "", heyboxId: null, ready: false });
      const [loginOpen, setLoginOpen] = useState(false);
      const [cookieDraft, setCookieDraft] = useState("");
      const [loginBusy, setLoginBusy] = useState(false);
      const [autoOpen, setAutoOpen] = useState(false);
      const [autoState, setAutoState] = useState(null);
      const [autoDraft, setAutoDraft] = useState(null);
      const [autoBusy, setAutoBusy] = useState(false);
      const [autoError, setAutoError] = useState("");

      const [tab, setTab] = useState("feed"); // feed | boards | favs
      const [detail, setDetail] = useState(null); // {linkId, title}
      const [viewImg, setViewImg] = useState(null); // 大图查看器的图片地址(null=关闭)
      const [toasts, setToasts] = useState([]);
      const toastSeq = useRef(0);

      // feed
      const [feed, setFeed] = useState({ items: [], offset: 0, loading: false, loaded: false, noMore: false, error: "" });
      // boards
      const [boards, setBoards] = useState([]); // TopicChild[]
      const [boardPosts, setBoardPosts] = useState({}); // topic_id -> items[]
      const [boardOff, setBoardOff] = useState({}); // topic_id -> offset
      const [boardLoading, setBoardLoading] = useState({});
      const [expanded, setExpanded] = useState(() => new Set(lsGet("heybox:v2:expanded", [])));
      // favs
      const [favs, setFavs] = useState(() => lsGet("heybox:v2:favs", []));
      // search
      const [searchOpen, setSearchOpen] = useState(false);
      const [searchQ, setSearchQ] = useState("");
      const [searchMode, setSearchMode] = useState(false);
      const [searchRes, setSearchRes] = useState({ items: [], offset: 0, loading: false, done: false });
      // messages
      const [msgs, setMsgs] = useState([]); // merged newest first
      const [seen, setSeen] = useState(() => new Set(lsGet("heybox:v2:seen", [])));
      const [msgPanel, setMsgPanel] = useState(false);
      const notifOn = useRef(false);

      const panelRef = useRef(null);
      const listScrollRef = useRef(null); // 列表滚动容器(推荐/板块/收藏/搜索共用)
      const dtlScrollRef = useRef(null); // 详情正文滚动容器
      const keepList = useRef({ k: null, top: 0 }); // 进详情前保存的列表位置
      const listPos = useRef({}); // 各列表视图的持续滚动位置:key -> scrollTop(收起重开恢复用)
      const readPos = useRef({}); // linkid -> 上次阅读位置(本会话内)
      const [scale, setScale] = useState(() => {
        const v = Number(lsGet("heybox:v2:scale", 40));
        return v >= 5 && v <= 100 ? v : 40;
      });
      const [fit, setFit] = useState({ fit: false, found: false, left: 0, top: 40, width: 460 });
      const widthLive = useRef(width);
      widthLive.current = width;
      const authRef = useRef(auth);
      authRef.current = auth;
      const seenRef = useRef(seen);
      seenRef.current = seen;
      const detailRef = useRef(detail);
      detailRef.current = detail;

      const toast = useCallback((text, isErr) => {
        const id = ++toastSeq.current;
        setToasts((t) => [...t.slice(-2), { id, text, isErr }]);
        setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
      }, []);

      useEffect(() => {
        lsSet("heybox:v2:panel", { open, width, theme });
      }, [open, width, theme]);

      const markRelogin = useCallback(() => {
        setAuth((a) => ({ ...a, loggedIn: false }));
        setDetail(null);
        toast("Cookie 已过期或无效,请重新登录", true);
      }, [toast]);

      /** 统一错误处理 */
      const runErr = useCallback(
        (e, label) => {
          if (e && e.relogin) markRelogin();
          else toast((label ? label + ": " : "") + (e && e.message ? e.message : String(e)), true);
        },
        [toast, markRelogin],
      );

      const autoRequest = async (payload) => {
        const r = await fetch("/heybox/automation", payload ? {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
        } : { cache: "no-store" });
        const j = await r.json();
        if (!j.ok) throw new Error(j.error || "自动化请求失败");
        return j;
      };
      useEffect(() => {
        if (!autoOpen) return;
        let alive = true;
        const refresh = async () => {
          try {
            const j = await autoRequest();
            if (alive) { setAutoState(j); setAutoDraft((d) => d || j.config); setAutoError(""); }
          } catch (e) { if (alive) setAutoError(e.message); }
        };
        refresh();
        const timer = setInterval(refresh, 3000);
        return () => { alive = false; clearInterval(timer); };
      }, [autoOpen]);
      const autoAction = async (action, config) => {
        setAutoBusy(true); setAutoError("");
        try {
          const j = await autoRequest({ action, config });
          setAutoState(j);
          if (action === "configure") setAutoDraft(j.config);
          toast(action === "run" ? "已启动一轮任务" : "自动化设置已保存");
        } catch (e) { setAutoError(e.message); }
        finally { setAutoBusy(false); }
      };

      // ---- 初始:读账号态;登录后拉推荐/板块/消息 ----
      useEffect(() => {
        let alive = true;
        (async () => {
          try {
            const r = await fetch("/heybox/state", { cache: "no-store" });
            const j = await r.json();
            if (!alive) return;
            setAuth({ loggedIn: !!j.loggedIn, deviceId: j.deviceId || "", heyboxId: j.heyboxId || null, ready: true });
          } catch {
            if (alive) setAuth((a) => ({ ...a, ready: true }));
          }
        })();
        return () => { alive = false; };
      }, []);

      useEffect(() => {
        if (!auth.loggedIn || !auth.ready) return;
        loadFeed(true);
        API.categories()
          .then((r) => setBoards((r && r.latest_hot_topics && r.latest_hot_topics.children) || []))
          .catch((e) => runErr(e, "板块加载失败"));
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [auth.loggedIn, auth.ready]);

      // ---- feed ----
      const loadFeed = useCallback(
        async (reset) => {
          setFeed((f) => ({ ...f, loading: true, error: "" }));
          try {
            const offset = reset ? 0 : feed.offset;
            const res = await API.feed(offset);
            const items = ((res && res.links) || []).filter((p) => p && p.linkid);
            if (reset) {
              setFeed({ items, offset: items.length, loading: false, loaded: true, noMore: items.length === 0, error: "" });
            } else if (items.length === 0) {
              // 已到末尾:标记 noMore,避免滚轮反复请求
              setFeed((f) => ({ ...f, loading: false, noMore: true }));
            } else {
              setFeed((f) => {
                const merged = dedupeByLinkid([...f.items, ...items]);
                const added = merged.length - f.items.length;
                return { items: merged, offset: f.offset + added, loading: false, loaded: true, noMore: added === 0, error: "" };
              });
            }
          } catch (e) {
            runErr(e, "推荐加载失败");
            setFeed((f) => ({ ...f, loading: false, error: e && e.message ? e.message : String(e) }));
          }
        },
        [feed.offset, runErr],
      );
      function dedupeByLinkid(list) {
        const seenIds = new Set();
        return list.filter((p) => (seenIds.has(p.linkid) ? false : (seenIds.add(p.linkid), true)));
      }

      // ---- boards ----
      const toggleBoard = async (topic) => {
        const tid = topic.topic_id;
        const nextExp = new Set(expanded);
        if (nextExp.has(tid)) {
          nextExp.delete(tid);
        } else {
          nextExp.add(tid);
          if (!boardPosts[tid]) await loadBoardPosts(tid);
        }
        setExpanded(nextExp);
        lsSet("heybox:v2:expanded", [...nextExp]);
      };
      const loadBoardPosts = async (tid) => {
        if (boardLoading[tid]) return;
        setBoardLoading((b) => ({ ...b, [tid]: true }));
        try {
          const off = boardOff[tid] || 0;
          const res = await API.topicFeeds(tid, off);
          const items = ((res && res.links) || []).filter((p) => p && p.linkid);
          setBoardPosts((m) => ({ ...m, [tid]: dedupeByLinkid([...(m[tid] || []), ...items]) }));
          setBoardOff((m) => ({ ...m, [tid]: off + items.length }));
        } catch (e) {
          runErr(e, "帖子加载失败");
        } finally {
          setBoardLoading((b) => ({ ...b, [tid]: false }));
        }
      };

      // ---- search ----
      const openSearch = () => {
        setSearchOpen(true);
        setSearchQ("");
      };
      const closeSearch = () => {
        setSearchOpen(false);
        setSearchQ("");
        setSearchMode(false);
        setSearchRes({ items: [], offset: 0, loading: false, done: false });
      };
      const runSearch = async (q) => {
        if (!q || !q.trim()) return;
        // 链接/纯数字 → 直接开帖
        const m = q.trim().match(/\/link\/([a-zA-Z0-9]+)/);
        if (m) return openDetail(m[1], q.trim());
        if (/^\d{6,}$/.test(q.trim())) return openDetail(q.trim(), "");
        setSearchMode(true);
        setSearchQ(q.trim());
        setSearchRes((s) => ({ ...s, items: [], offset: 0, loading: true, done: false }));
        try {
          const res = await API.search(q.trim(), { offset: 0 });
          const rawN = ((res && res.items) || []).length;
          const items = ((res && res.items) || []).map((it) => it.info).filter((p) => p && p.linkid);
          setSearchRes({ items, offset: rawN, loading: false, done: rawN === 0 });
        } catch (e) {
          runErr(e, "搜索失败");
          setSearchRes((s) => ({ ...s, loading: false }));
        }
      };
      const moreSearch = async () => {
        if (searchRes.loading || searchRes.done) return;
        setSearchRes((s) => ({ ...s, loading: true }));
        try {
          const res = await API.search(searchQ, { offset: searchRes.offset });
          const rawN = ((res && res.items) || []).length;
          const fresh = ((res && res.items) || []).map((it) => it.info).filter((p) => p && p.linkid);
          setSearchRes((s) => {
            let merged = dedupeByLinkid([...s.items, ...fresh]);
            const added = merged.length - s.items.length;
            let done = rawN === 0 || added === 0;
            if (merged.length >= 600) {
              merged = merged.slice(0, 600);
              done = true;
            }
            return {
              items: merged,
              offset: s.offset + rawN, // 按服务器返回的原始条数前进,避免重拿/漏拿
              loading: false,
              done,
            };
          });
        } catch (e) {
          runErr(e, "搜索加载失败");
          setSearchRes((s) => ({ ...s, loading: false }));
        }
      };

      // ---- refresh:换一批/重新拉取 ----
      const refreshFeed = async () => {
        if (feed.loading) return;
        setFeed((f) => ({ ...f, loading: true }));
        try {
          // pull=1 拉最新一批(与默认 pull=0 内容不同),整批替换列表
          const res = await API.feed(0, "1");
          const items = ((res && res.links) || []).filter((p) => p && p.linkid);
          setFeed({ items, offset: items.length, loading: false, loaded: true, noMore: items.length === 0, error: "" });
          toast(items.length ? "已刷新,为你换了一批帖子" : "没有更多新内容");
        } catch (e) {
          runErr(e, "刷新失败");
          setFeed((f) => ({ ...f, loading: false }));
        }
      };
      const refreshBoards = async () => {
        try {
          const res = await API.categories();
          const cs = (res && res.latest_hot_topics && res.latest_hot_topics.children) || [];
          setBoards(cs);
          setBoardPosts({});
          setBoardOff({});
          setExpanded(new Set());
          lsSet("heybox:v2:expanded", []);
          toast("板块已刷新");
        } catch (e) {
          runErr(e, "刷新失败");
        }
      };
      const doRefresh = () => {
        if (!auth.loggedIn) { toast("请先登录", true); return; }
        if (searchMode) {
          if (searchQ) runSearch(searchQ);
          return;
        }
        if (tab === "feed") refreshFeed();
        else if (tab === "boards") refreshBoards();
        else toast("收藏为本地数据,无需刷新");
      };

      // ---- favourites ----
      const saveFavs = (next) => {
        setFavs(next);
        lsSet("heybox:v2:favs", next);
      };
      const isFav = (linkid) => favs.some((f) => f.linkid === linkid);
      const toggleFav = async (post) => {
        const was = isFav(post.linkid);
        const next = was ? favs.filter((f) => f.linkid !== post.linkid) : [{ linkid: post.linkid, title: post.title, description: post.description || "", comment_num: post.comment_num || 0, create_at: post.create_at || 0, topics: post.topics || [] }, ...favs].slice(0, 200);
        saveFavs(next);
        try {
          await API.favour(post.linkid);
          toast(was ? "已取消收藏(已同步服务端)" : "已收藏(已同步服务端)");
        } catch (e) {
          saveFavs(was ? [...favs, post] : favs.filter((f) => f.linkid !== post.linkid));
          runErr(e, "收藏失败");
        }
      };

      // ---- detail:打开帖子 + 拉全评论(去重) ----
      const openDetail = async (linkId, fromText) => {
        // 进详情前记住当前列表的滚动位置,返回时恢复。
        const lEl = listScrollRef.current;
        if (lEl) keepList.current = { k: currentListKey(), top: lEl.scrollTop };
        setDetail({ linkId, title: fromText || "帖子", loading: true });
        try {
          const first = await API.tree(linkId, 0, 100);
          if (!first || !first.link) throw new Error("未获取到帖子内容");
          // 组模型:树接口对每个主评最多带 2 条子评;真实回复数在主评的 child_num,
          // 更多子评由评论区组件按 lastval 游标分页拉取。
          const toItem = (g) => {
            const c = (g && g.comment) || [];
            const main = c[0];
            if (!main) return null;
            return { id: main.commentid, main, subs: c.slice(1) || [], total: main.child_num || 0 };
          };
          let items = ((first.comments) || []).map(toItem).filter(Boolean);
          const seenIds = new Set(items.map((it) => it.id));
          const total = first.link.comment_num || 0;
          let foldedTips = first.folded_comment_tips || "";
          let stopEmpty = 0;
          let offset = items.length;
          const MAXC = 700; // 单帖最多拉 700 条根评论,避免刷爆
          while (offset < total && offset < MAXC && stopEmpty < 3) {
            try {
              const r = await API.tree(linkId, offset, 100);
              const gs = (r && r.comments) || [];
              if (gs.length === 0) { stopEmpty++; offset += 100; continue; }
              let added = 0;
              for (const g of gs) {
                const it = toItem(g);
                if (it && !seenIds.has(it.id)) {
                  seenIds.add(it.id);
                  items.push(it);
                  added++;
                }
              }
              if (added === 0) stopEmpty++;
              else stopEmpty = 0;
              offset += gs.length;
            } catch {
              break;
            }
          }
          if (first.folded_comment_tips) foldedTips = first.folded_comment_tips;
          const loadedCount = items.reduce((s, it) => s + 1 + (it.subs ? it.subs.length : 0), 0);
          const note =
            loadedCount >= total || stopEmpty >= 3
              ? null
              : "共 " + total + " 条评论,当前显示 " + loadedCount + " 条";
          setDetail({
            linkId,
            title: first.link.title || "帖子",
            link: first.link,
            comments: items,
            foldedTips,
            note,
            loading: false,
          });
        } catch (e) {
          runErr(e, "帖子加载失败");
          setDetail((d) => (d ? { ...d, loading: false } : null));
        }
      };
      const closeDetail = () => setDetail(null);

      /** 当前列表视图的键(用于保存/恢复各自的滚动位置)。 */
      const currentListKey = () => (searchMode ? "search:" + searchQ : tab);

      // 返回列表时恢复之前的位置(等列表重新挂载后再设)。
      useEffect(() => {
        if (detail !== null) return undefined;
        const want = keepList.current;
        if (!want.k) return undefined;
        keepList.current = { k: null, top: 0 };
        const id = requestAnimationFrame(() => {
          const el = listScrollRef.current;
          if (el) el.scrollTop = want.top;
        });
        return () => cancelAnimationFrame(id);
      }, [detail]);

      // 面板重新打开(含空间不足后强制展开)时,恢复上次浏览位置。
      useEffect(() => {
        if (!open) return undefined;
        const id = requestAnimationFrame(() => {
          const d = detailRef.current;
          if (d && !d.loading) {
            const el = dtlScrollRef.current;
            if (el) el.scrollTop = readPos.current[d.linkId] || 0;
          } else {
            const el = listScrollRef.current;
            if (el) {
              const k = currentListKey();
              if (listPos.current[k]) el.scrollTop = listPos.current[k];
            }
          }
        });
        return () => cancelAnimationFrame(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [open, force]);

      // 详情阅读位置:滚动时按帖保存;加载完成后按帖恢复(新帖无记录 → 从顶部)。
      const saveReadPos = () => {
        const d = detailRef.current;
        const el = dtlScrollRef.current;
        if (d && d.linkId && el && !d.loading) readPos.current[d.linkId] = el.scrollTop;
      };
      useEffect(() => {
        if (!detail || detail.loading || !detail.linkId) return undefined;
        const id = requestAnimationFrame(() => {
          const el = dtlScrollRef.current;
          if (!el) return;
          // 看过 → 回到上次位置;新帖 → 0(显式设定,杜绝复用旧滚动位置的误跳)
          el.scrollTop = readPos.current[detail.linkId] || 0;
        });
        return () => cancelAnimationFrame(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [detail && detail.loading, detail && detail.linkId]);

      // 滚到底自动加载下一页:推荐流 / 搜索结果都适用。
      const onListScroll = (e) => {
        const el = e.currentTarget;
        // 持续记录当前列表滚动位置(收起重开时恢复用)
        listPos.current[currentListKey()] = el.scrollTop;
        const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 160;
        if (!nearBottom) return;
        if (searchMode) {
          if (!searchRes.loading && !searchRes.done && searchRes.items.length > 0) moreSearch();
          return;
        }
        if (tab === "feed" && !feed.loading && !feed.noMore && feed.items.length > 0) {
          loadFeed(false);
        }
      };

      // ---- 消息 ----
      const pollOnce = useCallback(async () => {
        try {
          const replies = await API.messages(0, 0);
          const likes = await API.messages(1, 0);
          const all = [...((replies && replies.messages) || []), ...((likes && likes.messages) || [])];
          const unseen = all.filter((m) => !seenRef.current.has(m.message_id));
          if (unseen.length) {
            setMsgs((old) => dedupeMsg([...unseen, ...old]).slice(0, 40));
          } else if (all.length) {
            setMsgs((old) => (old.length ? old : dedupeMsg(all).slice(0, 40)));
          }
        } catch (e) {
          if (e && e.relogin) markRelogin();
        }
      }, [markRelogin]);
      function dedupeMsg(list) {
        const s = new Set();
        return list.filter((m) => (s.has(m.message_id) ? false : (s.add(m.message_id), true)));
      }
      const markAllRead = () => {
        const ids = new Set(msgs.map((m) => m.message_id));
        const next = new Set([...seenRef.current, ...ids]);
        setSeen(next);
        lsSet("heybox:v2:seen", [...next]);
      };
      const clickMsg = async (m) => {
        const linkId = (m.link && m.link.linkid) || m.link_id || m.linkid;
        const next = new Set(seenRef.current);
        next.add(m.message_id);
        setSeen(next);
        lsSet("heybox:v2:seen", [...next]);
        setMsgPanel(false);
        if (linkId) openDetail(String(linkId), m.link_title || "");
      };
      useEffect(() => {
        if (!auth.loggedIn) return;
        pollOnce();
        notifOn.current = true;
        const iv = setInterval(pollOnce, 3 * 60 * 1000);
        return () => {
          notifOn.current = false;
          clearInterval(iv);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [auth.loggedIn]);

      const unread = msgs.filter((m) => !seen.has(m.message_id)).length;

      // ---- 几何 watcher(照旧) ----
      useEffect(() => {
        const tick = () => setFit(measureFit(widthLive.current));
        tick();
        let ro = null;
        try {
          const el = document.querySelector("[data-conversation-scroll]");
          if (el) {
            ro = new ResizeObserver(tick);
            ro.observe(el);
          }
        } catch {
          /* ignore */
        }
        window.addEventListener("resize", tick);
        const iv = setInterval(tick, 1200);
        return () => {
          if (ro) ro.disconnect();
          window.removeEventListener("resize", tick);
          clearInterval(iv);
        };
      }, []);
      useEffect(() => {
        setFit(measureFit(width));
      }, [width, open]);

      // Esc:收起分区(不在输入框内时)
      useEffect(() => {
        const onKey = (e) => {
          if (e.key !== "Escape") return;
          const t = e.target;
          if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
          if (msgPanel) setMsgPanel(false);
          else setOpen(false);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
      }, [msgPanel]);

      // 拖宽
      const startDrag = (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        const sx = e.clientX;
        const sw = width;
        const mv = (ev) => setWidth(Math.min(780, Math.max(340, sw + sx - ev.clientX)));
        const up = () => {
          window.removeEventListener("pointermove", mv);
          window.removeEventListener("pointerup", up);
        };
        window.addEventListener("pointermove", mv);
        window.addEventListener("pointerup", up);
      };

      // 登录/登出
      const doLogin = async () => {
        const c = cookieDraft.trim();
        if (!c || !(c.includes("heybox_id=") || c.includes("x_xhh_tokenid=") || c.includes("user_pkey="))) {
          toast("Cookie 无效:需要包含 heybox_id 或 x_xhh_tokenid", true);
          return;
        }
        setLoginBusy(true);
        try {
          const r = await fetch("/heybox/state", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: "login", cookie: c }),
          });
          const j = await r.json();
          if (!j.ok) throw new Error(j.error || "登录失败");
          setAuth({ loggedIn: true, deviceId: j.deviceId || "", heyboxId: j.heyboxId || null, ready: true });
          setLoginOpen(false);
          setCookieDraft("");
          toast("登录成功");
        } catch (e) {
          toast((e && e.message) || "登录失败", true);
        } finally {
          setLoginBusy(false);
        }
      };
      const doLogout = async () => {
        try {
          await fetch("/heybox/state", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: "logout" }),
          });
        } catch {
          /* ignore */
        }
        setAuth((a) => ({ ...a, loggedIn: false }));
        setMsgs([]);
        setDetail(null);
        toast("已退出登录");
      };

      // 主题(强制主题通过 [data-theme] 覆盖令牌实现)
      const themeNext = { auto: "dark", dark: "light", light: "auto" };
      const themeLabel = { auto: "跟随", dark: "暗色", light: "亮色" };
      const inner = BASE;

      // 搜索行
      const searchBar = searchOpen
        ? h("div", { className: "hx2-row", style: { paddingTop: 4, paddingBottom: 8 } },
            h("input", {
              style: addrStyle(inner),
              placeholder: "搜索帖子 / 粘贴链接 或 输入帖子ID",
              autoFocus: true,
              value: searchQ,
              onChange: (e) => setSearchQ(e.target.value),
              onKeyDown: (e) => {
                if (e.key === "Enter") runSearch(searchQ);
                if (e.key === "Escape") { setSearchOpen(false); setSearchQ(""); }
              },
            }),
            h("button", { className: "hx2-btn hx2-primary-btn", onClick: () => runSearch(searchQ), style: { flex: "none" } }, "搜索"),
            h("button", { className: "hx2-btn", onClick: closeSearch, title: "关闭搜索" }, "✕"),
          )
        : null;

      // 列表主体
      let listEl = null;
      let listTitle = null;
      if (searchMode) {
        listTitle = h("div", { className: "hx2-sec" },
          h("button", { className: "hx2-btn", onClick: () => { setSearchMode(false); }, title: "返回" }, "← 返回"),
          h("span", null, "搜索: " + searchQ),
        );
        listEl = h("div", null,
          searchRes.items.map((p) => h(PostRow, { key: p.linkid, p, onOpen: () => openDetail(String(p.linkid), p.title || "") })),
          searchRes.loading ? h("div", { className: "hx2-loading" }, "加载中…") : null,
          !searchRes.loading && searchRes.done && searchRes.items.length === 0
            ? h("div", { className: "hx2-empty" }, "没有找到相关帖子")
            : null,
          searchRes.items.length > 0 && !searchRes.done
            ? h("button", { className: "hx2-more", onClick: moreSearch, disabled: searchRes.loading }, "加载更多搜索结果…")
            : null,
          searchRes.done && searchRes.items.length > 0
            ? h("div", { className: "hx2-foot" }, "共 " + searchRes.items.length + " 条 · 已全部加载")
            : null,
        );
      } else if (tab === "feed") {
        listEl = h("div", null,
          h("div", { className: "hx2-sec" }, "📌 推荐", h("span", { className: "x" }, "热门推荐信息流 · 滚到底自动加载")),
          feed.loaded && feed.items.length === 0 && !feed.loading
            ? h("div", { className: "hx2-empty" }, "暂无推荐内容")
            : feed.items.map((p) => h(PostRow, { key: p.linkid, p, onOpen: () => openDetail(String(p.linkid), p.title || "") })),
          feed.loading && feed.items.length === 0 ? h("div", { className: "hx2-loading" }, "加载中…") : null,
          feed.loading && feed.items.length > 0 ? h("div", { className: "hx2-loading", style: { padding: "10px 0 18px" } }, "加载中…") : null,
          feed.noMore && feed.items.length > 0 ? h("div", { className: "hx2-foot" }, "— 已经到底啦 —") : null,
        );
      } else if (tab === "boards") {
        listTitle = h("div", { className: "hx2-sec" }, "📁 板块", h("span", { className: "x" }, "点击展开查看帖子"));
        listEl = h("div", null,
          boards.length === 0 ? h("div", { className: "hx2-empty" }, "加载板块中…") : null,
          boards.map((t) => {
            const tid = t.topic_id;
            const posts = boardPosts[tid] || [];
            const isOpen = expanded.has(tid);
            return h("div", { key: tid },
              h("button", { className: "hx2-board", onClick: () => toggleBoard(t) },
                h("span", { className: "nm" }, t.name),
                t.hot && t.hot.desc ? h("span", { className: "dt" }, t.hot.desc) : null,
                h("span", { className: "ar" }, isOpen ? "▼" : "▶"),
              ),
              isOpen
                ? h("div", null,
                    posts.map((p) => h(PostRow, { key: p.linkid, p, onOpen: () => openDetail(String(p.linkid), p.title || "") })),
                    boardLoading[tid] && posts.length === 0 ? h("div", { className: "hx2-loading" }, "加载中…") : null,
                    posts.length > 0
                      ? h("button", { className: "hx2-more", disabled: !!boardLoading[tid], onClick: () => loadBoardPosts(tid) },
                          "加载更多帖子…")
                      : null,
                  )
                : null,
            );
          }),
        );
      } else {
        // favs
        listEl = h("div", null,
          h("div", { className: "hx2-sec" }, "⭐ 收藏", h("span", { className: "x" }, "右键未实现 · 点★切换")),
          favs.length === 0
            ? h("div", { className: "hx2-empty" }, "暂无收藏 — 在帖子详情/列表点 ☆ 收藏")
            : favs.map((p) =>
                h(PostRow, {
                  key: p.linkid,
                  p,
                  onOpen: () => openDetail(String(p.linkid), p.title || ""),
                  extra: h("button", {
                    style: { border: 0, background: "transparent", color: "#e3a008", cursor: "pointer", padding: 0, fontSize: 13, lineHeight: 1 },
                    title: "取消收藏",
                    onClick: (e) => {
                      e.stopPropagation();
                      toggleFav(p);
                    },
                  }, "★"),
                }),
              ),
        );
      }

      // ---- main panel content ----
      let content = null;
      if (!auth.ready) {
        content = h("div", { className: "hx2-empty" }, "加载中…");
      } else if (!auth.loggedIn) {
        content = h("div", { className: "hx2-empty" },
          "小黑盒论坛需要登录后使用\n(所有接口都要求 Cookie)",
          h("div", { style: { marginTop: 12 } },
            h("button", { className: "hx2-primary", onClick: () => setLoginOpen(true) }, "🔑 粘贴 Cookie 登录"),
          ),
          h("div", { className: "hx2-tip" }, "浏览器打开 xiaoheihe.cn 并登录 → F12 → Network → 复制请求头里的 Cookie"),
        );
      } else if (detail) {
        const link = detail.link;
        // key=linkId:切换帖子时强制重建整棵详情树,绝不复用上一个帖的滚动容器。
        content = h("div", { key: "detail-" + detail.linkId, className: "hx2-detail" },
          h("div", { className: "hx2-dbar" },
            h("button", { className: "hx2-btn", onClick: closeDetail, title: "返回" }, "←"),
            h("span", { className: "hx2-grow", style: { fontSize: 12, color: inner.label2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, detail.title),
            h("button", {
              className: "hx2-btn",
              title: isFav(Number(detail.linkId)) ? "取消收藏" : "收藏",
              onClick: () => {
                const p = { linkid: Number(detail.linkId), title: link ? link.title : "", description: (link && link.description) || "", comment_num: (link && link.comment_num) || 0, create_at: (link && link.create_at) || 0, topics: (link && link.topics) || [] };
                toggleFav(p);
              },
            }, isFav(Number(detail.linkId)) ? "★" : "☆"),
            h("button", { className: "hx2-btn", title: "分享链接", onClick: () => { navigator.clipboard && navigator.clipboard.writeText("https://www.xiaoheihe.cn/app/bbs/link/" + detail.linkId); toast("已复制分享链接"); } }, "⧉"),
            h("button", { className: "hx2-btn", title: "在浏览器打开", onClick: () => window.open("https://www.xiaoheihe.cn/app/bbs/link/" + detail.linkId, "_blank", "noopener") }, "↗"),
          ),
          detail.loading || !link
            ? h("div", { className: "hx2-loading", style: { padding: 40 } }, "加载帖子中…")
            : h("div", { ref: dtlScrollRef, className: "hx2-dtl", onScroll: saveReadPos },
                h("div", { className: "hx2-scale" },
                  h("label", { htmlFor: "hx2-scale", style: { flex: "none" } }, "图片"),
                  h("input", {
                    id: "hx2-scale",
                    type: "range",
                    min: "5",
                    max: "100",
                    value: scale,
                    onChange: (e) => {
                      const v = Number(e.target.value);
                      setScale(v);
                      lsSet("heybox:v2:scale", v);
                      if (panelRef.current) panelRef.current.style.setProperty("--hx2-scale", (v / 100).toFixed(2));
                    },
                  }),
                  h("span", { style: { flex: "none" } }, scale + "%"),
                ),
                h("h1", null, link.title || "无标题"),
                h("div", { className: "hx2-dmeta" },
                  link.user && link.user.avatar
                    ? h("img", { className: "hx2-avatar", src: imgOf(link.user.avatar), onError: (e) => (e.currentTarget.style.display = "none") })
                    : null,
                  h("span", null, (link.user && link.user.username) || "匿名"),
                  lv(link.user) ? h("span", { className: "hx2-lv" }, lv(link.user)) : null,
                  h("span", null, fmtTs(link.create_at)),
                  link.ip_location ? h("span", null, link.ip_location) : null,
                  h("span", null, "👍 " + (link.up || 0)),
                  h("span", null, "💬 " + (link.comment_num || 0)),
                  isFav(Number(detail.linkId)) ? h("span", null, "★ 已收藏") : null,
                ),
                (link.topics || []).length
                  ? h("div", { className: "hx2-tags" }, (link.topics || []).map((t) => h("span", { key: t.topic_id, className: "t" }, "#" + t.name)))
                  : null,
                h("div", { className: "hx2-content" }, contentBlocks(link.text || link.description || "", (src) => setViewImg(src))),
                h("div", { className: "hx2-csec" }, "💬 评论 (" + (link.comment_num || 0) + ")"),
                detail.foldedTips ? h("p", { className: "hx2-tip", style: { color: inner.label3, fontSize: 11 } }, "评论已被折叠: " + detail.foldedTips) : null,
                detail.comments && detail.comments.length
                  ? h("div", null,
                      detail.comments.map((it) =>
                        h(CommentThread, { key: it.id, item: it, onErr: runErr, onImg: (src) => setViewImg(src) }),
                      ),
                    )
                  : h("p", { className: "hx2-tip" }, "暂无评论"),
                h("div", { className: "hx2-foot" }, detail.note || (link.comment_num ? link.comment_num + " 条评论" : "")),
              ),
        );
      } else {
        content = h("div", { key: "list", ref: listScrollRef, className: "hx2-scroll", onScroll: onListScroll }, listTitle, listEl);
      }

      const modal =
        loginOpen && !auth.loggedIn
          ? h("div", { className: "hx2-modal" },
              h("div", { className: "hx2-login" },
                h("h3", null, "🔑 小黑盒登录"),
                h("textarea", { placeholder: "粘贴浏览器里的 Cookie…", value: cookieDraft, onChange: (e) => setCookieDraft(e.target.value) }),
                h("div", { className: "hint" },
                  "浏览器访问 xiaoheihe.cn 并登录 → F12 → Network → 点任一请求 → 复制 Request Headers 里的 Cookie。\n需要包含 heybox_id / x_xhh_tokenid / user_pkey。Cookie 只保存在本机 dsh 进程,不会上传。",
                ),
                h("div", { className: "acts" },
                  h("button", { className: "hx2-ghost", onClick: () => setLoginOpen(false) }, "取消"),
                  h("button", { className: "hx2-primary", disabled: loginBusy, onClick: doLogin }, loginBusy ? "登录中…" : "登录"),
                ),
              ),
            )
          : null;

      // 消息抽屉
      const msgLayer =
        msgPanel && auth.loggedIn
          ? h("div", { className: "hx2-msg" },
              h("div", { className: "hx2-dbar" },
                h("span", { style: { fontWeight: 700, fontSize: 13 } }, "🔔 消息"),
                h("span", { className: "hx2-grow" }),
                h("button", { className: "hx2-btn", onClick: markAllRead }, "全部已读"),
                h("button", { className: "hx2-btn", onClick: () => setMsgPanel(false) }, "✕"),
              ),
              h("div", { className: "hx2-scroll" },
                msgs.length === 0 ? h("div", { className: "hx2-empty" }, "暂无消息") : null,
                msgs.slice(0, 30).map((m) => {
                  const who = (m.user_a && (m.user_a.nickname || m.user_a.username)) || "未知用户";
                  const txt0 = m.text || m.comment_a_text || "新消息";
                  const linkId = (m.link && m.link.linkid) || m.link_id || m.linkid;
                  return h("button", {
                    key: m.message_id,
                    className: "hx2-mi",
                    style: { display: "flex", width: "100%", textAlign: "left", border: 0, borderBottom: "1px solid " + inner.border, background: "transparent", color: inner.label, cursor: "pointer", padding: "10px 12px" },
                    onClick: () => clickMsg(m),
                  },
                    h("span", { style: { flex: "none", fontSize: 13 } }, m.message_type === "1" ? "❤️" : "💬"),
                    h("span", { className: "hx2-grow" },
                      h("span", { style: { display: "block", fontSize: 12, fontWeight: 600 } }, who),
                      h("span", { style: { display: "block", fontSize: 12, color: inner.label2, lineHeight: 1.6, wordBreak: "break-word" } }, txt0.length > 80 ? txt0.slice(0, 80) + "…" : txt0),
                      linkId ? h("span", { style: { display: "block", fontSize: 11, color: inner.brand, marginTop: 2 } }, (m.link && m.link.title) || "查看帖子 →") : null,
                      h("span", { style: { display: "block", fontSize: 10, color: inner.label3, marginTop: 2 } }, fmtTs(m.create_at)),
                    ),
                  );
                }),
              ),
            )
          : null;

      // 头部
      const autoField = (label, key, type, min, max) => h("label", { style: { display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between", margin: "12px 0", fontSize: 12 } },
        label,
        h("input", {
          type, min, max, "aria-label": label, disabled: autoBusy || autoState?.busy,
          ...(type === "checkbox" ? { checked: !!autoDraft?.[key], onChange: (e) => setAutoDraft((d) => ({ ...d, [key]: e.target.checked })) }
            : { value: autoDraft?.[key] ?? "", onChange: (e) => setAutoDraft((d) => ({ ...d, [key]: type === "number" ? Number(e.target.value) : e.target.value })) }),
          style: type === "checkbox" ? { accentColor: inner.brand } : { width: type === "number" ? 84 : "58%", maxWidth: "65%", padding: 6, color: inner.label, background: inner.bg, border: "1px solid " + inner.border, borderRadius: 5 },
        }),
      );
      const autoLayer = autoOpen ? h("div", { className: "hx2-msg", role: "region", "aria-label": "自动化设置" },
        h("div", { className: "hx2-dbar" },
          h("strong", null, "定时浏览与互动"), h("span", { className: "hx2-grow" }),
          h("button", { className: "hx2-btn", onClick: () => setAutoOpen(false), "aria-label": "关闭自动化设置" }, "✕")),
        h("div", { className: "hx2-scroll", style: { padding: 14 } },
          autoError ? h("p", { role: "alert", style: { color: inner.err, fontSize: 12 } }, autoError) : null,
          autoState?.fault ? h("p", { role: "alert" }, autoState.fault) : null,
          !autoDraft ? h("p", null, "加载设置…") : h("div", null,
            h("p", { style: { fontSize: 12, color: inner.label2, lineHeight: 1.7 } }, "后台运行需保持 DSH 宿主开启。浏览指读取帖子正文；开启评论后才发言。@ 使用作者昵称文本，提及通知尚未验证。"),
            autoField("定时浏览总开关", "enabled", "checkbox"),
            autoField("执行间隔（分钟）", "intervalMinutes", "number", 1, 1440),
            autoField("每轮帖子数", "postsPerRound", "number", 1, 10),
            autoField("自动评论", "autoComment", "checkbox"),
            autoField("评论 @ 帖子作者", "mentionAuthor", "checkbox"),
            autoField("自动回复自己的评论", "autoReply", "checkbox"),
            autoField("每轮回复数", "repliesPerRound", "number", 1, 10),
            autoField("每日评论上限", "dailyComments", "number", 0, 100),
            autoField("每日回复上限", "dailyReplies", "number", 0, 100),
            autoField("发送间隔（秒）", "cooldownSeconds", "number", 10, 3600),
            autoField("仅谷时运行", "valleyOnly", "checkbox"),
            h("p", { style: { fontSize: 11, color: inner.label3, lineHeight: 1.7 } }, "谷时为本地策略：北京时间工作日 12–14、18–次日 9 点，周末全天。并非供应商价格保证。高级窗口与节假日可通过配置 API 调整。"),
            autoField("人设 / 兴趣", "persona", "text"),
            h("details", null, h("summary", { style: { cursor: "pointer", fontSize: 12 } }, "DSH 启动设置"),
              autoField("DSH 可执行文件", "dshCommand", "text"),
              autoField("Node 路径（可留空）", "nodePath", "text"),
              autoField("生成超时（秒）", "generationTimeoutSeconds", "number", 10, 600),
              h("p", { style: { fontSize: 11, color: inner.label3 } }, "指定 Node 时，DSH 路径应填 JS 入口绝对路径。使用已配置的 headless 模型。")),
            h("div", { style: { display: "flex", flexWrap: "wrap", gap: 8, margin: "16px 0" } },
              h("button", { className: "hx2-primary", disabled: autoBusy || autoState?.busy, onClick: () => autoAction("configure", autoDraft) }, "保存设置"),
              h("button", { className: "hx2-ghost", disabled: autoBusy || autoState?.busy || !autoState?.config.enabled || !auth.loggedIn, onClick: () => autoAction("run") }, "立即执行一轮"),
              h("button", { className: "hx2-ghost", disabled: autoBusy || (!autoState?.config.enabled && !autoState?.busy), onClick: () => autoAction("configure", { enabled: false }) }, "停止任务")),
            h("p", { style: { fontSize: 12, lineHeight: 1.8 } },
              "状态：", autoState?.busy ? "运行中" : autoState?.config.enabled ? "等待执行" : "已关闭", h("br"),
              "下次执行：", autoState?.nextRunAt ? new Date(autoState.nextRunAt).toLocaleString() : "—", h("br"),
              "今日额度占用：评论 ", autoState?.usage.comment || 0, " / 回复 ", autoState?.usage.reply || 0),
            h("h4", { style: { fontSize: 12 } }, "最近运行记录"),
            ...(autoState?.history || []).map((row, i) => h("div", { key: i, style: { padding: "8px 0", fontSize: 11, lineHeight: 1.6, borderBottom: "1px solid " + inner.border, wordBreak: "break-word" } },
              h("span", { style: { color: inner.label3 } }, new Date(row.at).toLocaleString(), " · ", row.type),
              h("div", null, row.message, row.postId ? " · 帖子 " + row.postId : ""), row.title ? h("div", null, row.title) : null)),
          )),
      ) : null;
      const head = h("div", { className: "hx2-head" },
        h("div", { className: "hx2-row" },
          h("span", { className: "hx2-logo" }, "小黑盒 ", h("span", { className: "hb" }, "· HeyBox")),
          h("span", { className: "hx2-grow" }),
          h("button", { className: "hx2-btn", title: "定时浏览与互动设置", onClick: () => { setAutoOpen((v) => !v); setMsgPanel(false); } }, "定时"),
          auth.loggedIn
            ? h("button", {
                className: "hx2-btn hx2-bell",
                title: unread ? unread + " 条新消息" : "消息(每3分钟检查)",
                onClick: () => setMsgPanel((v) => !v),
              }, "🔔", unread > 0 ? h("span", { className: "cnt" }, unread) : null)
            : null,
          h("button", {
            className: "hx2-chip",
            title: "主题:跟随 DSH / 强制暗色 / 强制亮色",
            onClick: () => setTheme(themeNext[theme]),
          }, "◐ " + themeLabel[theme]),
          auth.loggedIn
            ? h("button", { className: "hx2-btn", title: "退出登录", onClick: doLogout }, "👤", auth.heyboxId ? String(auth.heyboxId).slice(0, 4) : "")
            : h("button", { className: "hx2-btn", style: { color: inner.err }, onClick: () => setLoginOpen(true) }, "登录"),
          h("button", { className: "hx2-btn", title: "收起(Esc)", onClick: () => setOpen(false) }, "»"),
        ),
        h("div", { className: "hx2-row", style: { paddingTop: 2, paddingBottom: 7 } },
          h("div", { className: "hx2-seg" },
            h("button", { "data-on": tab === "feed" || undefined, onClick: () => { setTab("feed"); setSearchMode(false); } }, "📌 推荐"),
            h("button", { "data-on": tab === "boards" || undefined, onClick: () => { setTab("boards"); setSearchMode(false); } }, "📁 板块"),
            h("button", { "data-on": tab === "favs" || undefined, onClick: () => { setTab("favs"); setSearchMode(false); } }, "⭐ 收藏"),
          ),
          h("span", { className: "hx2-grow" }),
          h("button", { className: "hx2-btn", "data-on": searchOpen || undefined, title: "搜索帖子", onClick: searchOpen ? closeSearch : openSearch }, "🔍"),
          h("button", { className: "hx2-btn", title: "刷新(换一批)", onClick: doRefresh }, "↻"),
        ),
        searchBar,
      );

      const toastLayer = h("div", { className: "hx2-toast", "data-err": undefined },
        toasts.map((t) => h("div", { key: t.id }, t.text)),
      );

      // 预览图(悬停放大)
      const prevRef = useRef(null);
      const hoverImg = (e) => {
        if (viewImg) return; // 大图查看器打开时,不再叠加悬停预览
        const img = e.target;
        if (img.tagName !== "IMG") return;
        const pv = prevRef.current;
        if (!pv) return;
        const rect = img.getBoundingClientRect();
        pv.innerHTML = "";
        const c = document.createElement("img");
        c.src = img.src;
        c.onerror = () => { pv.style.display = "none"; };
        pv.appendChild(c);
        pv.style.display = "block";
        let x = rect.right + 10;
        let y = rect.top;
        if (x + 380 > window.innerWidth) x = rect.left - 390;
        if (y + 260 > window.innerHeight) y = window.innerHeight - 270;
        pv.style.left = Math.max(4, x) + "px";
        pv.style.top = Math.max(4, y) + "px";
      };
      const hideHover = () => {
        if (prevRef.current) prevRef.current.style.display = "none";
      };

      const isApp = typeof window !== "undefined" && !!window.__HEYBOX_APP__;
      const showPanel = open && ((fit.fit && fit.found) || force);
      const viewerLayer = viewImg
        ? h(ViewerImg, { key: viewImg, url: viewImg, onClose: () => setViewImg(null) })
        : null;
      const bodyWrap = h("div",
        { className: "hx2-body", onMouseOver: hoverImg, onMouseOut: hideHover },
        content,
        msgLayer,
        autoLayer,
        modal,
        toastLayer,
        viewerLayer,
        h("div", { ref: prevRef, className: "hx2-prev" }),
      );
      const panel = showPanel
        ? h("div", {
            ref: panelRef,
            className: "hx2",
            "data-theme": theme === "auto" ? undefined : theme,
            style: isApp
              ? { left: 0, top: 0, right: 0, bottom: 0, width: "100%", "--hx2-scale": (scale / 100).toFixed(2) }
              : {
                  left: Math.max(8, fit.left) + "px",
                  top: fit.top + "px",
                  bottom: "10px",
                  width: Math.max(320, Math.min(width, fit.fit ? fit.width : fit.vw - fit.left - 20)) + "px",
                  "--hx2-scale": (scale / 100).toFixed(2),
                },
            onMouseOver: (e) => { if (!e.target.closest(".hx2-cimg,.hx2-content img")) hideHover(); },
          },
            h("div", { className: "hx2-grip", onPointerDown: startDrag, title: "拖动调整宽度" }),
            head,
            bodyWrap,
          )
        : null;

      const topPill = Math.max(10, Math.min(fit.top || 40, 120));
      const closedPill = !open
        ? h("button", { className: "hx2-pill", style: { right: "12px", top: topPill + "px" }, onClick: () => setOpen(true), title: "打开小黑盒" },
            h("span", { className: "dot" }), "小黑盒" + (unread ? " · " + unread : ""))
        : null;
      const crampedPill = open && !((fit.fit && fit.found) || force)
        ? h("button", { className: "hx2-pill", style: { right: "12px", top: topPill + "px" }, onClick: () => setForce(true), title: "空间不足 — 点击强制展开" },
            h("span", { className: "dot" }), "小黑盒 · 空间不足,点此展开")
        : null;

      return h("div", { style: { display: "contents" } },
        panel,
        crampedPill,
        closedPill,
      );
    }
    function addrStyle(inner) {
      return {
        boxSizing: "border-box", flex: 1, minWidth: 0, height: 26, padding: "0 10px",
        border: "1px solid " + inner.border, borderRadius: 10, background: inner.bgSoft,
        color: inner.label, fontSize: 12, outline: "none", fontFamily: "inherit",
      };
    }

    // ---------------------------------------------------------------------
    // 插件定义
    // ---------------------------------------------------------------------
    exports.name = "heybox";
    exports.inject = ["slots"];

    exports.apply = function (ctx) {
      ctx.effect(() => {
        const style = document.createElement("style");
        style.setAttribute("data-plugin", "heybox");
        style.setAttribute("data-plugin-css", "heybox/heybox.css");
        style.textContent = CSS;
        document.head.append(style);
        return () => style.remove();
      }, "heybox: styles");

      // 独立桌面模式(window.__HEYBOX_APP__):直挂 #__heybox_root,不走 DSH slots。
      if (typeof window !== "undefined" && window.__HEYBOX_APP__) {
        let RD = null;
        try {
          RD = require("react-dom/client");
        } catch (e) {
          /* DSH 运行时不提供,正常走 slots */
        }
        const host = (typeof document !== "undefined" && document.getElementById) ? document.getElementById("__heybox_root") : null;
        if (RD && host) {
          try {
            if (!host.__heyboxRoot) host.__heyboxRoot = RD.createRoot(host);
            host.__heyboxRoot.render(React.createElement(Heybox, {}));
          } catch (e) {
            if (typeof console !== "undefined") console.error("[heybox] standalone mount failed:", e);
          }
        }
        return;
      }

      const slots = ctx.get("slots");
      if (slots === undefined) return;
      slots.inject("shell.overlay", () =>
        slots.register(
          { name: "shell.overlay", id: "heybox", order: 115 },
          (props) => React.createElement(Heybox, props),
        ),
      );
    };

    return module.exports;
  },
});
