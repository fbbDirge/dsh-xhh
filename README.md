<p align="center">
  <img src="https://img.shields.io/badge/version-0.4.0-blue" alt="version" />
  <img src="https://img.shields.io/badge/license-MIT-green" alt="license" />
  <img src="https://img.shields.io/badge/platform-DSH%20Web-blueviolet" alt="platform" />
  <img src="https://img.shields.io/badge/type-web%20client%20plugin-ff69b4" alt="type" />
</p>

<h1 align="center">🎮 HeyBox · 小黑盒论坛分区</h1>

<p align="center">
  <b>在 DeepSeek Harness Web 会话右侧开一个小黑盒(xiaoheihe.cn)论坛分区。</b><br/>
  形态与交互移植自 <a href="https://github.com/WenfuRainbow/heybox">WenfuRainbow/heybox</a>(VSCode 小黑盒插件)
</p>

---

## 简介

这个插件把heybox(VSCode 版)的「小黑盒论坛浏览」搬进 DSH Web 的右侧分栏 —— 让 DeepSeek 干活时,
旁边挂着一个小黑盒。小黑盒的账号态与接口都需要 Cookie 与 hkey 签名,无法从网页直连。

## 功能

本分支在 `plasta2steel/dsh-xiaoheihe` v0.3.12 上增加后台自动化。需求设计见 [docs/automation-design.md](docs/automation-design.md)，开发结果和联调边界见 [docs/development.md](docs/development.md)。

| 模块 | 说明 |
|---|---|
| **定时浏览** | 总开关、1–1440 分钟间隔、每轮 1–10 帖、立即执行、停止、状态和历史 |
| **自动互动** | 独立评论 / 回复开关；评论带 `@作者昵称`（通知未验证）；回复校验父评论关系 |
| **谷时与额度** | 可选北京时间谷时、每日评论 / 回复额度、共享冷却、持久化去重和超时防重发 |
| 📌 **推荐** | 热门推荐信息流,滚动到底部「加载更多推荐」 |
| 📁 **板块** | 热门板块分类(数码硬件 / 盒友杂谈 / Steam…),点板块展开帖子,支持分页加载 |
| ⭐ **收藏** | 本机收藏 + 服务端同步(调 `/bbs/app/link/favour`),列表点 ★ 取消 |
| 🔍 **搜索** | 全站帖子搜索、分页「加载更多」、返回列表;粘贴链接或输入帖子 ID 可直接开帖 |
| 📄 **帖子详情** | 标题/作者/话题标签/正文(JSON 富文本块:图文),图片缩放滑块(5–100%,记忆)、悬停原图预览 |
| 💬 **评论** | 按楼层组的主评 + 子评论缩进、楼层号、IP 属地、折叠提示;自动分页拉取并去重(上限 700 条,不足时注明) |
| 🔔 **消息** | 登录后每 3 分钟检查回复/点赞,铃铛显示未读数,列表可跳转、全部已读 |
| 🔑 **登录** | 粘贴浏览器 Cookie(只发给主机,存 `$DSH_HOME/heybox/state.json`,不下发浏览器) |
| ◐ **主题** | 跟随 DSH(默认)/ 强制暗色 / 强制亮色,面板内切换 |
| ⬌ **分区** | 右缘贴会话列的空档,不挡聊天与输入框;可拖宽(340–780px)、Esc/「»」收起;窄窗自动收成胶囊 |

## 数据来源

完全对齐 heybox 的 `src/api/client.ts` + `signature.ts`:

- 接口:`api.xiaoheihe.cn`,`/bbs/app/feeds`(推荐)、`/bbs/app/topic/categories`(板块)、
  `/bbs/app/topic/feeds`(板块帖子)、`/bbs/app/link/tree`(帖子树/评论)、
  `/bbs/app/api/general/search/v1/web`(搜索)、`/bbs/app/user/message`(消息)、
  `/bbs/app/link/favour`(收藏)
- 每个请求携带公共参数(`os_type=web` / `x_client_type=web` / `device_id` …)与
  `hkey / _time / nonce` 签名 —— 全部在 dsh web 进程内生成,**浏览器看不到也不持有 Cookie**。
- 图片/头像经主机 `/heybox/img` 白名单代理(`*.xiaoheihe.cn`、`*.max-c.com`)。

## 安装

**从本仓库安装**（Node 版本需满足已安装 DSH 的要求；开发验证使用 Node 24）

```bash
dsh plugin --profile web add github:fbbDirge/dsh-xhh
```

装完**重启 dsh web** 并刷新页面,右侧即出现分区。

本地开发时也可执行 `dsh plugin --profile web add /path/to/dsh-xhh`。原上游 GitHub 安装命令不会安装本分支的自动化功能。本插件与已有同名 `heybox` 插件应二选一，避免挂载两份。

## 使用

1. 右侧出现「小黑盒 · HeyBox」分区(空间不足时先点胶囊展开)。
2. 点「登录」→ 浏览器打开 [xiaoheihe.cn](https://www.xiaoheihe.cn) 并登录 →
   F12 → Network → 任一请求头里复制 `Cookie` → 粘贴。
   Cookie 需含 `heybox_id=` / `x_xhh_tokenid=` / `user_pkey=` 之一,过期重新粘贴即可。
3. 切「推荐 / 板块 / 收藏」浏览;点帖子看正文与评论;🔍 搜索;🔔 看消息。
4. 点击头部「定时」，配置间隔和每轮数量，开启总开关并保存。默认所有运行 / 发言开关均关闭，默认间隔 30 分钟、每轮 1 帖。
5. 需要发言时再开启「自动评论」或「自动回复」。评论默认添加 `@当前帖子作者昵称`；当前仅确认纯文本格式，不能保证作者收到提及通知。
6. 可点「立即执行一轮」，总开关仍需开启。点「停止任务」会停止调度并取消生成；已发往平台的请求无法撤回。

后台必须保持 DSH Web 宿主运行，关闭浏览器不会停止，退出 DSH 后不运行。自动浏览是读取正文，不保证增加平台浏览量。自动回复每轮最多检查最近 100 条回复消息，无法证明是回复自己评论的来信会跳过。

自动评论使用已配置的 DSH `headless` 模型。先验证 `dsh --profile headless "只回复测试"` 可正常输出。本机试跑时模型接口返回 HTTP 404，需修正 DSH 的模型配置后再启用真实生成。可在高级设置指定 DSH JS 入口和 Node 可执行路径；插件未修改全局 DSH 配置。

## 开发

```bash
npm run check   # node --check
npm test        # 原有检查 + 设置交互 + 调度/回复/子进程测试
```

结构:

- `lib/index.js` — 主机半:签名 + 公共参数 + Cookie 态、`/heybox/rpc`、`/heybox/state`、`/heybox/img`、`/heybox/health`
- `lib/client.js` — 浏览器半:右侧分栏 UI(`shell.overlay` 席位,无构建步骤)
- `lib/automation.js` — 定时调度、持久化记录、额度、回复校验和统一发送
- `lib/generator.js` / `lib/generation-guard.js` — DSH 结构化生成、取消与工具禁用
- `cordis.patch.yml` — bundle 挂载行
- `tests/` — 单测与 smoke
- `docs/reference-readme.md` — heybox(VSCode 原版)README 摘录

## 致谢与免责

非官方项目,接口与交互移植自 [WenfuRainbow/heybox](https://github.com/WenfuRainbow/heybox)(MIT),
仅供学习交流;数据版权归小黑盒所有。

底座来自 [plasta2steel/dsh-xiaoheihe](https://github.com/plasta2steel/dsh-xiaoheihe)，后台组织方式参考 [c1overzz/dsh-bili-scroll](https://github.com/c1overzz/dsh-bili-scroll)，保留原 MIT 许可证。

## License

MIT
