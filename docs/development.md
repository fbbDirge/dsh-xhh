# v0.7.0 开发与验收记录

日期：2026-10-24。

## v0.7.0 Tab 设置与界面优化

- 设置页改为「概览 / 账号 / 浏览 / 互动 / 峰谷 / 高级」六个顶部 Tab，使用紧凑分组、双列字段、自定义开关及公共操作栏，去掉长表单的多层缩进。
- 概览展示运行状态、下次执行、今日评论 / 回复额度和最近动态；浏览记录改成带序号、标题和时间的紧凑列表，增加内容边距并去掉重复的「已读取帖子」。
- 切换 Tab 保留全部表单和扫码组件；统一保存全部菜单，隐藏菜单的原生校验失败时自动切换并聚焦对应字段。支持 ARIA tablist / tab / tabpanel、方向键 / Home / End 切换及焦点样式。
- 继续使用 DSH 主题与现有设置 / 会话 slots，适配窄屏和深色界面，无新增运行依赖；升级沿用账号和自动化配置。
- 验证：`npm run check`、`npm test`（客户端冒烟 + 21 项后台测试）通过。真实 React + Chromium 搭配模拟宿主验证六个 Tab、跨菜单编辑 / 保存 / 校验、键盘切换、停止任务、浏览记录及 390px 全菜单无溢出，桌面 / 窄屏 / 深色截图已检查。扫码跨 Tab 保留二维码和草稿，确认回执仍为模拟验证。

## v0.6.0 扫码登录

- 在「设置 → 刷小黑盒」加入扫码登录，保留 Cookie 登录作为备用。支持等待扫码、已扫码待手机确认、成功、过期、刷新和取消；额外二步验证提示在官网完成后使用备用方式。
- 宿主签名请求官方 `/account/get_qrcode_url/`、`/account/qr_state/`，必要时回退 `/account/restore_login`；保留响应 Cookie，在宿主合成账号 Cookie。二维码在本地编码为 PNG，不发送到第三方图片服务。
- 临时会话仅在内存，单宿主同时保留一份；轮询最短 1.5 秒，避免并发。刷新、取消、手动登录及退出后，旧轮询响应不能覆盖账号。
- 扫码成功后以临时文件原子替换账号文件，权限 `0600`；写入失败不报告登录成功。浏览器只收到状态和二维码，不收到 pkey / Cookie。
- 真实官方接口探测：成功生成有效期 120 秒的二维码 PNG，状态查询返回 `error: wait`；未使用用户账号扫码、未发送帖子或评论。
- 新增 6 项登录测试（含宿主路由），结合原 15 项后台测试全部通过。覆盖状态流转、过期、二步验证、取消 / 刷新竞态、缺失凭据、恢复登录、跨站请求拒绝、凭据不返回浏览器和文件权限。
- 真实 React + Chromium 搭配模拟宿主确认回执：等待扫码 → 已扫码 → 登录成功、账号显示更新、桌面和 390px 窄屏均通过。真实手机扫码确认、凭据有效性仍待用户联调。
- 静态证据与实测边界见 [qr-login.md](qr-login.md)。

## v0.5.0 界面调整

- 按 `dsh-bili-scroll` 的真实入口契约注册 `settings.section`：「设置 → 刷小黑盒」，取代原论坛侧栏。没有悬浮胶囊、拖拽宽度或遮罩。
- 可选 `conversation.view`：「刷过的帖子」，显示最近 40 条事件中的浏览记录，记录跨会话共享；旧宿主不支持时不影响设置页。
- 账号绑定、总开关、间隔 / 数量、评论 / 回复、谷时、人设、高级配置和运行记录放在同一设置页。总开关开启后展开日常配置，评论和回复仍默认关闭。
- 保留原包名、宿主接口和持久化目录；升级沿用已有配置。移除旧版搜索、板块、收藏、消息和帖子阅读侧栏界面，平台帖子通过链接打开。
- 状态轮询不覆盖未保存表单；保存错误保留展示；离开页面取消请求并清理计时器；Cookie 提交成功后清空输入。

## 已实现

- 后台定时器：5 秒检查一次到期时间；间隔 1–1440 分钟、每轮 1–10 个未读推荐帖，保存后按新间隔计时。长任务结束后再计算下一轮，不重叠、不补跑积压任务。
- 总开关、独立评论 / 回复开关、手动执行、停止、最近记录、下次执行时间和当天额度；离开设置页仍运行，停止宿主则退出。
- 评论默认 `@帖子作者昵称 正文`，缺少可靠作者信息则不发送。回复携带来信评论 ID 与根评论 ID，并通过帖子树核对父评论或平台返回的被回复用户。
- 工作日谷时、周末、指定节假日与补班日期；Asia/Shanghai 时区，不依赖机器本地时区。窗口是配置策略，不会查询或承诺供应商价格。
- DSH `headless` 结构化决策、强制工具执行禁用、生成超时、取消进程组、输出大小限制与正文校验；Cookie 由宿主持有，不放入模型提示词。
- 每账号持久化去重 / 额度 / 冷却，发请求前保存“结果未知”记录，收到回执再更新；超时、重启不会自动重发；写盘失败时停止发送。
- 原子文件替换、进程锁、多实例互斥；失效 PID 锁可恢复。损坏状态文件停止自动化，保留文件供检查。

## 使用与数据

安装命令：

```sh
dsh plugin --profile web add github:fbbDirge/dsh-xhh
```

重启 DSH Web 后，进入「设置 → 刷小黑盒」并绑定账号。先保存只读模式并手动运行，确认能读到帖子；模型端点正常后再启用评论和回复。

- `$DSH_HOME/heybox/state.json`：底座的登录信息（含 Cookie）。
- `$DSH_HOME/heybox/automation.json`：配置、账号互动状态、额度和历史；不包含 Cookie。
- `$DSH_HOME/heybox/automation.lock`：正在运行的任务 PID。确认没有活动宿主后才手动处理异常锁。
- `$DSH_HOME/heybox/generation.patch.yml`：由插件生成的 DSH overlay，只用于禁用生成任务的工具执行。
- 默认 DSH_HOME 为 `~/.dsh`。DSH 自身还会按其机制持久化生成会话。

接口：

```text
GET  /heybox/automation
POST /heybox/automation {"action":"configure","config":{"enabled":true,"intervalMinutes":30,"postsPerRound":2}}
POST /heybox/automation {"action":"run"}
POST /heybox/automation {"action":"configure","config":{"enabled":false}}
```

POST 使用 `Content-Type: application/json`。运行中只接受关闭总开关；其余设置在任务结束后修改。高级配置例子：`valleyWindows: [[720,840],[1080,540]]`、`holidays: ["2026-10-01"]`、`workdays: ["2026-10-24"]`，分钟范围 0–1439。

默认调用 PATH 中的 `dsh`；识别 Node shebang 后用宿主 Node 执行，避免 PATH 指向过旧 Node。也可设置 `nodePath` 为 Node 的绝对路径，同时把 `dshCommand` 填为 DSH JS 入口绝对路径。当前仅支持有内置 `tools.guard` 与 `headlessStartup` 的 DSH，缺少依赖时不会绕过生成保护。

## 验证结果

- `npm run check`：无 BOM、所有模块语法检查通过。
- v0.5.0 `npm test`：原有签名 / URL / Cookie 测试、客户端设置页 / 会话标签注册、保存、刷新保留编辑、错误展示、停止、账号提交和卸载清理测试通过；15 项新增后台与生成测试通过。
- v0.5.0 使用真实 React 和 Chromium、模拟 DSH slots / 宿主接口完成浏览器验证：保存数量与互动开关、停止、切换浏览记录标签均通过；桌面、390px 窄屏和深色布局已截图检查，无横向溢出或浏览器脚本错误。临时验证依赖未加入插件，未访问平台发送接口。
- 覆盖：定时到期、批量 / 不重叠、重启去重、每日预算、模糊发送回执、停止 / 换号、父评论校验、北京时间谷时边界、只读不调模型、损坏状态、子进程参数和取消。
- 在本机可用 Node 24 的 DSH 中加载 overlay，注册一个探针工具并尝试执行，返回 `HeyBox generation is text-only; tools are disabled.`，证明 guard 在真实工具运行时生效；未调用小黑盒发送接口。
- 实际 DSH 生成试跑：启动成功，但现有模型配置返回 `HTTP_404: DeepSeek Messages request failed (404)`。需修复模型端点后重测真实生成；没有修改用户全局模型或凭据。
- 尚无小黑盒登录凭据，真实评论、回复、公开可见性与 @ 通知均未验证。UI 已提示 @ 仅为昵称文本。设置页采用 DSH 主题变量及正常文档布局。组件与接口验证使用模拟宿主，不等同于真实 DSH 宿主与平台账号的端到端验收。

## 接口证据与参考

平台公开 Web 资源于 2026-10-24 静态检查：

- [主入口](https://static.max-c.com/static/heybox/webapp/@heybox-spa/website/app/index-BcnLlQNw.js) 指向帖子模块。
- [帖子模块](https://static.max-c.com/static/heybox/webapp/@heybox-spa/website/app/index-DZNUuPXv.js) 的评论处理读取编辑器纯文本，提交 `is_cy/link_id/reply_id/root_id/text`，普通评论的两个回复 ID 为 `-1`。未找到结构化 @ 提及字段；这个静态观察不能证明昵称文本会通知作者。
- 使用 reverse-engineer-anything / REA 6.7.0 对 5 个相关前端文件做静态解析，Evidence ID 和摘要保存在 `api-evidence.json`；静态分析不等于实际运行验证。
- [heibox-comment-bot](https://github.com/2646617098/heibox-comment-bot)、[xhhRobot](https://github.com/SomeOvO/xhhRobot)、[xiaoheihe-cli](https://github.com/AaronZ345/xiaoheihe-cli) 用于交叉核对评论发送字段与消息字段，仅参考接口契约，未复制第三方实现代码。

接口版本可能变动，尤其作者 ID、评论关系和回执结构应以真实账号返回值再次核对。
