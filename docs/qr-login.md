# 小黑盒扫码登录实现依据

日期：2026-10-24，版本：0.6.0。

## 官方公开实现

网页入口 [xiaoheihe.cn](https://www.xiaoheihe.cn/) 加载的[主模块](https://static.max-c.com/static/heybox/webapp/@heybox-spa/website/app/index-BcnLlQNw.js) 中，登录服务 `u6e` 的 `createQrLoginSession` 静态实现表明：

1. `GET /account/get_qrcode_url/`，参数 `app=web`，取得 `result.qr_url` 与 `expire`。
2. 从二维码 URL 提取 `qr`，请求 `GET /account/qr_state/`，参数 `qr` 与 `app=web`。
3. `result.error=wait` 继续等待；`ready` 表示已扫码；`ok` 表示手机确认；其他值按过期处理。默认轮询 1500ms。
4. 登录结果通过 `profile.heybox_id` 或 `account_detail.userid` 识别账号，并要求 `pkey`。官网同步 `heybox_id/user_heybox_id` 与 `pkey/user_pkey` 到 Cookie。
5. 确认回执缺少有效登录结果时，官网会回退 `/account/restore_login`；`need_google_check` 表示需要额外二步验证。

使用 REA 6.7.0 `analyze-javascript-application` 重新检查了已有 5 个官方模块，Evidence ID：`ev_1d8945ce6edb09fb3783b13ae2cfb7d4dffc9a779ce06ce2cadece1dade8a578`，根摘要 `6c01d291a586a984cbc41df957b780b2181fb628d27624ccd5360cf3f649c3e5`。本次输入和之前评论接口分析相同，因此证据身份相同；文件身份见 `api-evidence.json`。上述状态与字段来自对主模块登录服务的静态阅读，不把它当作扫码成功运行证据。未复制官网实现代码。

## 运行观察

- 使用当前宿主签名参数对官方生成接口发起未登录请求：`status=ok`，返回官方 `https://api.xiaoheihe.cn/account/qr_login/` URL，`expire=120`（相对秒数）。
- 用返回的 qr 查询状态：`status=ok`，`result.error=wait`。
- 再通过插件 `/heybox/login` 路由验证：生成有效 PNG、剩余约 120 秒、轮询等待；随后取消。临时目录已清理，未保存或公开 qr 会话密钥。
- 未扫码确认、未取得用户真实凭据。真实确认结果、账号有效性和需额外验证的账号仍需要 App 联调。完整流程使用模拟官方回执做自动测试。

## 插件实现

`POST /heybox/login`，JSON 请求体：

```json
{"action":"start"}
{"action":"poll","sessionId":"宿主返回的随机会话 ID"}
{"action":"cancel","sessionId":"宿主返回的随机会话 ID"}
```

只允许同源 JSON 请求（携带 Origin 时校验宿主），响应禁止缓存。会话随机 ID、状态、二维码 PNG 与到期时间可返回浏览器；平台返回的 Cookie 和 pkey 只在宿主处理。二维码使用 `qrcode` 的本地编码能力。会话不包含已登录账号 Cookie，防止用旧账号凭据误判新扫码账号。

一个宿主同时只有一个扫码会话。刷新使旧会话失效；取消带会话 ID，不能误取消别的设置页刚生成的新二维码。临时网络错误允许继续查询；到期不再查询。退出账号或手动 Cookie 登录会取消扫码会话。扫码登录仅绑定账号，不会自动开启任务或互动开关。
