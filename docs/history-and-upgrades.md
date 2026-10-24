# 两个浏览插件的历史隔离与升级

核对日期：2026-10-24。B 站源码参考 `c1overzz/dsh-bili-scroll` 提交 `5be5f6d57c47c7e79ad9bc4ce39457b68a160dfa`（2.1.0）。

## 数据与界面互不共用

| 项目 | 刷小黑盒 | 刷 B 站 |
| --- | --- | --- |
| 数据目录 | `$DSH_HOME/heybox` | `$DSH_HOME/bili-duty` |
| 浏览来源 | `automation.json` 中当前账号的 `watched` | `seen.md` |
| 浏览接口 | `/heybox/watched` | `/api/bili-duty/watched` |
| 会话标签 ID | `heybox-watched` | `bili-watched` |

小黑盒不会读取、写入或删除 B 站的历史、日报、凭据或插件源码。高级菜单的一键安装只在 `heybox/dependencies` 安装扫码依赖，不重装其他插件。两个标签使用独立 ID，不会互相替换注册项。

小黑盒 v0.9.0 起将浏览档案与最近运行日志分开保存。运行日志仍滚动保留 200 条、显示 40 条，浏览档案按账号持久化，界面每页 50 帖。生成失败导致帖子下轮可重试时，已读档案仍保留。升级从旧版 `seen` 恢复帖子 ID 和时间，并尽可能从尚存的运行日志恢复标题；已经被旧版日志轮转丢弃的标题无法找回。

## B 站界面变空的独立原因

上游 2.1.0 的 `parseSeenTable()` 仍跳过非 `|` 开头的行。如果模型写入：

```text
- 2026-10-24 · BV1dsn86FEKB · 标题 · 挑中（值得看）
```

文件存在但接口可能返回 0 条。重装包会替换 `index.js` 中的手工补丁；这与小黑盒数据无关。上游还会把 30 天前的表格归档到 `seen/YYYY-MM.md`，目前卡片接口只读取主 `seen.md`，因此不能把它视为所有月份的完整历史。

仓库提供显式维护工具 `scripts/bili-compat.mjs`，插件本身不会自动执行它。支持已核对的源码结构：兼容表格和日期 / BV / 标题 / 状态列表；B 站元数据请求携带本机登录 SESSDATA，图片 CDN 不携带；仅把旧 `PERSONA_LIMIT = 6000` 提高到 8000，保留新版的 40000 上限。未知源码结构会拒绝修改。

先停止宿主里的 B 站任务，定位**当前实际加载的包目录**，再执行：

```sh
# 默认仅检测，不写文件。
node scripts/bili-compat.mjs /actual/dsh-bili-scroll/index.js

# 语法检查通过后原子替换，原文件备份到插件目录外。
node scripts/bili-compat.mjs /actual/dsh-bili-scroll/index.js \
  --apply --backup-dir=/root/.dsh/maintenance/bili-backups
```

之后重启实际的 DSH Web 服务，在已登录宿主的浏览器 Network 中检查 `/api/bili-duty/watched` 的 `total` 和卡片封面；不要为了测试发评论。工具不接触 `seen.md`、日报和凭据文件。重复执行已打补丁的源码不会追加修改。该工具的适配范围与下文线上 2.0.2 的人工维护操作不同，不要直接用它覆盖已经带有其他手工补丁的源码。

## 防止重装覆盖的维护方式

推荐把 B 站修复保存在用户维护的源码副本 / fork，记录基于哪个上游提交修复，检查通过后以本地路径安装：

```sh
dsh plugin --profile web add /srv/dsh-plugins/dsh-bili-scroll
```

保留包名与数据目录。先备份 profile 和 `$DSH_HOME/bili-duty`，检查安装变更后再重启。后续更新这个维护副本、重新应用补丁并跑解析检查；不要再用上游原包重装它，否则仍会覆盖修复。另一种方式是在每次上游重装后手动运行本维护工具，但这不是自动保留补丁的保证。长期最好把兼容解析合入上游；本次没有代用户向上游发布 Issue / PR。

小黑盒升级前也先备份 `$DSH_HOME/heybox` 与 profile，只更新小黑盒包。不要删除整个 `$DSH_HOME`、批量重装所有插件，或在两个插件之间复用数据目录。

## 本次线上部署与验证

2026-10-24 已通过 SSH 22 端口完成部署。此前连接在认证前关闭，使用独立 SSH 参数后成功登录；没有修改用户的 SSH 配置。

- 小黑盒从 0.7.0 更新至 0.9.0，运行代码提交为 `c16c9f6`；服务器语法检查与 30 项测试通过。
- B 站保留线上 2.0.2 及现有列表解析、8000 字人设补丁，仅移除图片 CDN 请求中的登录 Cookie，元数据 API 请求仍按需携带 Cookie。
- Web profile 依赖已改为 `heybox: link:/srv/dsh-plugins/dsh-xhh` 和 `dsh-bili-scroll: link:/srv/dsh-plugins/dsh-bili-scroll`，两个包各有独立维护目录。
- 小黑盒浏览接口返回 50 条，旧 `seen` 已持久迁移至 `watched`；B 站接口仍返回 27 条。初查小黑盒曾为 45 条，停止服务备份时已为 50 条，迁移核对以备份中的 50 条为准。
- B 站 `seen.md`、当日日报、配置、登录凭据 SHA-256 与升级前一致；小黑盒原有配置与账号文件保留，定时浏览总开关保持开启。
- B 站封面实测 HTTP 200、`image/jpeg`、470270 字节；小黑盒依赖检查的扫码、Node、npm、DSH 均就绪。
- `dsh-web.service` 已重启并处于 active；验收没有手动触发浏览、评论或回复。

维护版 B 站另有 `MAINTENANCE.json` 标记与升级保护：点击原有“一键升级”会显示维护提示并停止直接安装上游包，已通过接口验证。否则它会把 profile 的本地链接改回上游包，再次丢失补丁。该保护只存在于这台服务器的 B 站维护副本，小黑盒插件不会修改 B 站代码。具有服务器权限的人仍可主动改回上游安装，不能将此描述为任何操作下都不会覆盖。

本次完整备份位于 `/root/.dsh/maintenance/backups/20261024-130946/profile-and-state.tgz`，含 Web profile 与两个插件完整数据；同目录 `bili-maintained-source.tgz` 保存修复后的 B 站源码。备份包含登录凭据，目录和文件仅限 root 访问，不要上传仓库。最新备份目录记录在 `/root/.dsh/maintenance/latest-backup`；B 站维护说明在 `/srv/dsh-plugins/dsh-bili-scroll/MAINTENANCE.md`。

后续只更新小黑盒时，在 `/srv/dsh-plugins/dsh-xhh` 执行 `git pull --ff-only`、`npm ci --ignore-scripts`、`npm run check`、`npm test`，确认任务空闲后重启 `dsh-web.service`。本地链接会加载新代码，无需重新安装 B 站。B 站上游更新应先合并到独立维护副本，验证列表解析、封面和升级保护后再重启。
