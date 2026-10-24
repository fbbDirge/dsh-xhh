# 发帖、定时发布与搜图调研

核对日期：2026-10-25。只检查代码，没有上传图片或发布真实帖子。

## 已有能力

| 项目 | 发布新帖 | 图片上传 | 定时发布新帖 | 关键词搜图 |
| --- | --- | --- | --- | --- |
| 当前 dsh-xhh | 未实现 | 未实现，只有平台图片读取代理 | 未实现，现有调度用于浏览和互动 | 未实现 |
| dsh-bili-scroll | 当前移除了上传视频、发动态和专栏工具 | 没有可复用的小黑盒上传实现 | 有浏览任务调度，没有新帖发布调度 | 搜视频和读取视频画面，不是图片搜索 |
| dsh-xiaoheihe / WenfuRainbow/heybox | 未发现新帖发布入口 | 读取帖子图片，不是上传 | 未发现 | 未发现 |
| heibox-comment-bot / xhhRobot | 评论或回复，不是新帖 | 未发现所需的新帖图片上传流程 | 自动评论或回复，不是定时发帖 | 未发现 |
| xiaoheihe-cli | 有文章、图文、视频发布代码及草稿模式 | 有本地图片检查和 COS 上传流程 | 未发现发布时刻配置或持久化发帖队列 | 搜索类型为帖子、用户、游戏、社区，没有图片搜索 |

这里的“有”指存在源码实现，不代表本插件已接入，也不代表此次使用真实账号验收通过。

## 可参考的发布协议

[xiaoheihe-cli service.py](https://github.com/AaronZ345/xiaoheihe-cli/blob/954fb4753fb1a879572239f2a54b520a91dc814d/xhh_operator/service.py) 的 write_post / _submit_post：

- 提交到 `/bbs/app/api/link/post`，携带 title、text、post_type、link_tag、draft、view_limit、original、words_count 等字段。
- text 为内容块 JSON，图片块包含 type=img、url、width、height；还支持社区和话题选择。
- draft=1 保存草稿，draft=0 发布；该参考还使用 workshop_params，需要核对签名参数，不能只复制字段到现有评论接口。
- 发布后读取返回帖子核对标题、正文和图片；接受请求不等于公开可见。

[media.py](https://github.com/AaronZ345/xiaoheihe-cli/blob/954fb4753fb1a879572239f2a54b520a91dc814d/xhh_operator/media.py) 的上传流程：

1. 验证本地图片格式、大小及宽高。
2. `/bbs/app/api/qcloud/cos/upload/info/v2` 获取对象 key、bucket 和 region。
3. `/bbs/app/api/qcloud/cos/upload/token/v2` 获取临时上传凭据。
4. 使用 COS 签名 PUT 上传文件；不向存储服务发送小黑盒登录 Cookie。
5. `/bbs/app/api/qcloud/cos/upload/callback/v2` 确认上传并取得 preview_urls。
6. 把图片 URL 和宽高加入帖子内容块再提交。

参考的上传结果不明时停止而不重传，适合沿用现有插件的持久化发送意图与去重策略。

## 建议的插件入口

新增顶部「发帖」菜单，保留现有设置页入口，不使用侧栏。

- 编辑：标题、正文、社区、话题、本地图片与图片顺序；可保存本地草稿、预览和明确发布。
- 配图：默认关键词可填写“大肥鱼”，关键词可改；搜索后展示缩略图及来源，选择图片加入草稿。本地图片上传作为独立入口。
- 搜图来源：需要新增图片搜索提供方，不能把现有平台图片代理当成搜索接口。可配置提供方端点和密钥；尚未配置时提示配置或使用本地图片，不伪造搜索结果。
- 自动配图：作为独立开关，允许指定关键词、图片数量及已选择的来源；定时前准备并缓存图片，避免发布时临时搜不到或换成另一张图片。
- 图片上传：由宿主读取选中的图片并上传到小黑盒存储，不直接把第三方原图链接当作上传完成。限制格式、实际解码尺寸、大小及下载地址；第三方搜图及下载请求不携带小黑盒 Cookie。

“大肥鱼”暂作为用户可修改的关键词，不假定它指真实鱼、表情包或某个角色。搜索结果是否符合需求需要在图片预览中判断。

## 发帖时间与浏览时间分开

- 「浏览」继续配置浏览检查间隔，「运行时段」继续限制浏览及评论互动。
- 「发帖」单独设置立即发布、指定日期时间、每天或每周的时间点，以及发布时区；使用持久化任务，不随网页关闭丢失。
- 默认按指定发布时刻处理，不隐式继承浏览的峰谷设置。若需要时段限制，显式提供「发帖也受运行时段限制」开关，并展示具体延后规则。
- 显示下一次计划发布时间；若禁止当前时段，计算并展示调整后的时间，不把“检查时间”当作“发布时间”。
- 每个任务记录 job ID、绑定账号、计划时间、内容快照、图片、状态和帖子 ID；到期前保存发送意图。结果不明时停止，不自动重复发布。
- 重启后过期任务默认标记为错过，避免集中补发；界面允许用户重新安排。周期任务按日期和时间槽去重。
- 发帖记录独立于浏览档案；不修改旧评论和帖子，不读写 B 站插件目录。

## 开发顺序与验收

1. 本地草稿、图片选择和预览。
2. 图片上传、平台草稿保存及读取核对。
3. 发布新帖、帖子 ID 回执和读取核对。
4. 持久化单次 / 周期发布计划，验证时区、重启、过期与结果不明不重发。
5. 图片搜索提供方、候选图片选择与可选自动配图。

模拟测试必须覆盖上传中断、发布超时、停止任务、切换账号和进程重启，真实上传和公开发布另行联调。不能用已有评论测试宣称发帖链路已通过。

## 其他参考版本

- [dsh-bili-scroll README](https://github.com/c1overzz/dsh-bili-scroll/blob/5be5f6d57c47c7e79ad9bc4ce39457b68a160dfa/README.md)：当前任务工具范围明确排除上传视频和发动态。
- [dsh-xiaoheihe](https://github.com/plasta2steel/dsh-xiaoheihe/tree/32bc17d707397af48368db759548806763bca6aa)。
- [WenfuRainbow/heybox](https://github.com/WenfuRainbow/heybox/tree/afbe8a5f0629aafcd7e17d1c56eeec84ff4dd1bf)。
- [heibox-comment-bot](https://github.com/2646617098/heibox-comment-bot)、[xhhRobot](https://github.com/SomeOvO/xhhRobot)：交叉检查其评论 / 回复定位。
