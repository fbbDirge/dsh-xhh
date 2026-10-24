# DSH · 刷小黑盒

基于 DeepSeek Harness 的小黑盒后台浏览与互动插件。界面参考 [dsh-bili-scroll](https://github.com/c1overzz/dsh-bili-scroll)：在 DSH **设置 → 刷小黑盒** 配置任务，在会话的 **刷过的帖子** 标签查看最近浏览记录。不使用侧栏、悬浮胶囊或遮罩面板。

当前版本：0.5.0。需求分析见 [自动化设计](docs/automation-design.md)，实现和联调结果见 [开发记录](docs/development.md)。

## 功能

| 功能 | 说明 |
| --- | --- |
| 定时浏览 | 总开关、1–1440 分钟间隔、每轮 1–10 个未读推荐帖 |
| 自动评论 | 独立开关，依据帖子生成评论，可添加 `@作者昵称`；提及通知效果尚未验证 |
| 自动回复 | 独立开关，只处理能核对为回复自己评论的来信 |
| 谷时策略 | 可选工作日谷时、周末、节假日和补班日期；时区与窗口可配置 |
| 发送约束 | 每日评论 / 回复额度、共享冷却、账号去重、发送结果未知时不自动重试 |
| 运行记录 | 立即执行、停止、下次执行时间、今日额度和最近 40 条事件 |
| 会话标签 | “刷过的帖子”显示最近事件里的浏览记录，点击标题打开小黑盒；所有会话共享 |
| 账号配置 | 在设置页粘贴 Cookie，由 DSH 宿主持久化；浏览器不保存 Cookie 副本 |

总开关、自动评论和自动回复默认关闭，默认 30 分钟读 1 帖。自动浏览指读取正文，不保证增加平台浏览量。

## 安装

Node 版本需满足已安装 DSH 的要求，开发验证使用 Node 24：

```sh
dsh plugin --profile web add github:fbbDirge/dsh-xhh
```

重启 DSH Web 并刷新页面，打开 **设置 → 刷小黑盒**。本地开发也可安装仓库目录：

```sh
dsh plugin --profile web add /path/to/dsh-xhh
```

本插件沿用 `heybox` 包名与配置目录，与其他同名插件应二选一，避免重复挂载。由旧版升级时保留宿主已有的账号和任务配置；旧版的论坛侧栏、搜索、收藏等浏览界面已替换为后台任务配置页。

会话的“刷过的帖子”需要宿主支持 `conversation.view`；旧版宿主不支持时仍可在设置页查看最近运行记录。

## 使用

1. 打开 **设置 → 刷小黑盒 → 绑定账号**。在 [小黑盒网页版](https://www.xiaoheihe.cn) 登录，从开发者工具 Network 的请求头复制 Cookie，粘贴后保存。后台任务需要 Cookie 中能识别 `heybox_id`；保存账号不代表已验证登录有效性。
2. 开启“定时浏览总开关”，设置间隔和每轮帖子数，点击“保存设置”。先保持评论 / 回复关闭，用“立即执行一轮”验证读取。
3. 需要发言时开启“自动评论”或“自动回复”，设置额度、冷却和人设后保存。评论中的 `@作者昵称` 当前仅确认纯文本格式，不能保证作者收到通知。
4. 需要峰谷限制时开启“仅在谷时运行”。默认北京时间工作日 12:00–14:00、18:00–次日 09:00，周末全天；约束整轮浏览和互动。高级设置可修改时区、分钟窗口、节假日及补班日期。这是本地时间策略，不会查询供应商价格。
5. 点击“停止任务”停止调度并请求取消当前生成。已提交给平台的请求无法撤回。任务运行中需先停止，等待本轮结束后修改设置。

关闭设置页或浏览器不停止任务；DSH Web 宿主必须持续运行，退出宿主后任务停止。不创建系统定时任务。

界面每 5 秒刷新运行状态，不覆盖未保存的表单。会话标签只列出最近 40 条事件中的浏览记录，不是完整浏览档案。自动回复每轮最多检查最近 100 条回复消息，无法确认目标关系时跳过。

自动评论使用已配置的 DSH `headless` 模型，可先验证：

```sh
dsh --profile headless "只回复测试"
```

本机生成试跑曾返回 `HTTP_404: DeepSeek Messages request failed (404)`，需修复已有模型配置后重测。高级设置可指定 DSH 命令 / JS 入口和 Node 可执行路径，插件不修改全局 DSH 配置。目前没有真实账号发送验收结果。

## 数据与结构

账号 Cookie 保存于 `$DSH_HOME/heybox/state.json`；调度配置、额度和去重记录保存在 `$DSH_HOME/heybox/automation.json`。默认 `DSH_HOME` 为 `~/.dsh`。模型提示词不含 Cookie。

- `lib/client.js`：`settings.section` 设置页与可选 `conversation.view` 标签；使用宿主 React，无构建步骤。
- `lib/index.js`：主机签名、Cookie、`/heybox/state`、`/heybox/automation` 等路由；保留原数据接口兼容性。
- `lib/automation.js`：定时调度、互斥锁、持久化、额度、回复核对和发送。
- `lib/generator.js` / `lib/generation-guard.js`：DSH 结构化生成、取消、超时与工具禁用。
- `cordis.patch.yml`：插件挂载配置。
- `tests/`：签名、设置页 / 会话标签、调度及生成验证。

```sh
npm run check
npm test
```

## 来源与许可

小黑盒数据层来自 [plasta2steel/dsh-xiaoheihe](https://github.com/plasta2steel/dsh-xiaoheihe)，其接口与签名移植自 [WenfuRainbow/heybox](https://github.com/WenfuRainbow/heybox)。设置页入口和后台组织参考 [c1overzz/dsh-bili-scroll](https://github.com/c1overzz/dsh-bili-scroll)。保留原 MIT 许可证与致谢。

非官方项目，平台接口可能变动；数据版权归小黑盒所有。MIT，见 [LICENSE](LICENSE)。
