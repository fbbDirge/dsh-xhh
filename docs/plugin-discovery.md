# DSH 插件发现与发布

核对日期：2026-10-24；官方仓库源码提交 `22ddee3792402c3e70ec5f86a63c3e3e895a2f60`。

## 官方当前机制

官方的 [自定义插件索引说明](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/experimental/plugin-market-bundle/README.zh.md) 明确写道：

> 目前没有官方插件索引；发现标签页只列出用户添加的索引源。

因此没有查到可直接申请的“官方插件库收录”流程，也不能把 GitHub 仓库可安装描述为已获官方审核或推荐。[官方 README](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/README.zh.md#社区与支持) 建议为插件仓库添加 `dsh-plugin` 话题，便于被发现，并提供 [GitHub Discussions](https://github.com/deepseek-ai/deepseek-harness/discussions) 社区入口。

## 本插件准备情况

- 已有公开源码、MIT 许可、README、版本、测试、`dsh.bundle.patch` 和 Web client 声明，可通过 `github:fbbDirge/dsh-xhh` 安装。
- package.json 已补齐主页和问题反馈链接；`keywords` 已包含 `dsh-plugin`。npm keywords 与 GitHub 仓库 Topics 是不同设置，后者需单独添加。
- 推荐仓库 Topics：`dsh-plugin`、`deepseek-harness`、`xiaoheihe`。本机 gh 未登录，未修改远程 Topics。
- 没有发布 npm 包。现包名 `heybox` 沿用底座，发布前需确认 npm 名称归属；如改包名，需单独制定已有安装的迁移方案。

## 可执行的后续步骤

1. 在仓库首页 About 的 Topics 中添加 `dsh-plugin`，保留明确的非官方声明。
2. 发布带版本和验收范围的 GitHub Release，展示设置、扫码、评论记录及浏览档案，注明真实账号验收范围。
3. 若要出现在“发现”页，按官方 [索引格式](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/util/plugin-market-index/README.zh.md) 制作或申请加入社区索引。索引可引用固定 Git 提交，不必先发布 npm；提交前使用官方 `parseMarketIndex` 校验，用户需要自行添加该索引源。
4. 在官方社区介绍插件并询问是否有新的推荐 / 展示入口。发布社区消息需单独授权，本次仅准备说明，没有代发。

自定义索引不会让插件变成官方插件；也不应由插件静默修改用户的索引源。

## awesome-dsh-plugin 社区收录

已按用户提供的 [contributing.md](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/contributing.md) 核对。这是社区维护的列表，合并后可供相关市场展示，不代表 DeepSeek 官方审核或背书。

投稿文件已备好：[fbbDirge__dsh-xhh.yml](submission/fbbDirge__dsh-xhh.yml)。在对方仓库发起 PR，新增 `data/plugins/fbbDirge__dsh-xhh.yml`，内容使用此文件；无需编辑对方自动生成的 README。本插件归入 `fun`，中英文描述与实际行为相符，未宣称原生 @ 通知已验证。

2026-10-24 查询仓库元数据时：创建时间为 `2026-10-24T09:22:05Z`，Topics 为空。提交前需完成：

1. 在 GitHub 仓库 About 中添加 Topic `dsh-plugin`；package.json keywords 不等同于 Topic。
2. 等待仓库满一天，即北京时间 **2026-10-25 17:22:05** 后提交；指南的 CI 会检查仓库年龄。
3. 保持 `dsh.bundle.patch` 指向实际存在的 `cordis.patch.yml`，代码可安装、功能可用；本仓库已有对应声明、MIT 许可和测试。
4. 将 YAML 文件提交到对方仓库，等待 CI 与维护者源码审阅；CI 通过是前提，不等同于保证收录。

截图和 npm 发布为可选项。截图可在本仓库根目录添加 `screenshots.json`，指向已提交的 1–8 张图片；当前没有伪造截图或发布 npm。此次仅准备投稿文件与流程，没有向社区提交 PR；本机 gh 尚未登录。
