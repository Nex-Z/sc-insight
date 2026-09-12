# 按主播自动录制

录像管理页输入主播名称或已收录的平台 ID，设置每段时长，勾选“上线自动录制”后启用。离线时也可登记。
每分钟通过公开页面检查主播状态：上线后开始录制，下线或转为非公开时停止并归档，保留开关等待下次上线。
查询超时不视为下线；录制错误保留 5 分钟退避。达到每段最长时长且仍在线时继续下一段。
默认按分辨率、帧率、码率依次选择最高可用画质。
“停止”同时停止当前任务与自动录制；“关闭自动录制”只关闭后续调度。
平台 ID 是 models.source_id，不是数据库主键。未收录的 ID 需先输入主播名称。

运行链路：公开页面 → 主清单 → 服务端还原分片 URL → HTTP 中转 → FFmpeg -c copy → MP4。
生产录制路径不使用 CDP、浏览器播放或录屏。开录时重新解析来源；清单请求失败后重新获取公开地址。
多路共用轻量 HTTP 服务，每路一个 FFmpeg，默认并发 2，通过 RECORDING_CONCURRENCY 调整（1–32）。

## 当前适配边界

已验证当前公开直播的 MOUFLON v2 地址格式。算法仅还原清单中的文件名，媒体字节保持不变。
使用公开播放器中提供的格式参数，且格式 ID 必须由当前主清单声明；不生成平台授权 token。
已知格式数据及公开来源记录在 server/public-format-keys.json。
上游更换不兼容格式时明确失败，需要更新适配；不执行下载的播放器代码作为生产逻辑。
不访问私密直播、不绕过登录，不处理 DRM；固定占位短片不会作为真实直播归档。
分段或网络故障恢复可能存在间隙，当前不承诺无缝拼接。

## API

POST /api/recording-target/resolve：{"target":"主播名称或已收录平台ID"}。
返回名称、平台 ID、解析状态及原因，不会开始录制。

POST /api/recordings/by-target：

```json
{"target":"主播名称或已收录平台ID","max_seconds":3600,"auto_record":true,"until_offline":true}
```

自动录制默认不分段（until_offline:true），不设置 FFmpeg 固定时长，下线或手动停止时归档。设为 false 可按 max_seconds 分段，时长 5–21600 秒。已有配置保持原模式，可在表单重新启用以更新。同一主播最多一个活跃任务。启用自动录制返回 HTTP 202 / 等待上线；状态确认在线后才创建任务。
POST /api/recordings/:id/stop：停止并关闭该主播的自动录制。
PATCH /api/recording-sources/:modelId：{"auto_record":false}，仅关闭后续调度。
PUT /api/recording-sources/:modelId 支持 type:"public" 配置按主播解析。

## 部署

安装 Node.js 24、PostgreSQL、FFmpeg / FFprobe，配置 .env，然后运行：

```sh
npm ci
npm run db:init
npm run build
npm start
```

Linux 使用 PATH 或 FFMPEG_PATH / FFPROBE_PATH 指定工具，无需安装浏览器供这条录制路径使用。
代码使用跨平台路径和进程 API，尚未执行 Linux 实机验收。

## 验证

- npm test：上线→开录→下线停止→重新上线、状态错误不误停、最高画质、目标匹配、MOUFLON 地址还原、错误格式拒绝、地址过期刷新、Range / Referer、取消与资源释放。
- npm run test:source:http：Mux 公开 HLS 测试夹具 → 纯 HTTP → FFmpeg → 可播放文件。
- npm run test:source:ui：隔离的 Edge 表单测试，录制 API 模拟。
- node server/auto-recording-check.js 主播名称：真实录制两段并检查自动续录，随后关闭自动录制。目标已有活跃录制时拒绝启动。

当前直播已完成纯 HTTP 实录，验证 H.264 720p + AAC；本地任务已验证归档、自动生成下一段、停止及 Range 下载。
报告保存在 artifacts/auto-recording-verification.json；测试结束后不会保留自动录制运行。

- node server/continuous-recording-check.js 主播名称：验证不分段录制超过配置时长仍保持同一任务，手动停止后归档并关闭测试配置。

## 主播搜索

主播管理与发现页输入关键词后，经本地 POST /api/models/search 调用官网 /api/front/v5/models/search/group/all。沿用 girls 分类，只展示 username 分组；请求最多 100 条，界面显示官网总匹配数，超过返回数量时需细化关键词。该接口不是承诺稳定的开放 API，上游变更或限流会显示错误，不回退成伪装的本地结果。

搜索结果保存主播身份以供关注、监控和录制；不覆盖已有关注、笔记和采样状态，不凭搜索结果触发录制。自动录制仍独立检查公开直播间。

验证：node --use-env-proxy server/model-search-ui-check.js（需要 3010 服务运行），使用隔离 HTTP 服务检查真实官网搜索、身份收录和详情入口。

## 站内直播与聊天

列表“看直播”和详情“站内直播”进入独立 #live/主播ID 页面，支持直接刷新和浏览器前进后退；桌面左侧播放器、右侧聊天室，手机上下排列。播放器，按需加载 hls.js，使用现有公开 HTTP 媒体转发，默认最高可用画质；不创建录制任务。公开聊天使用官网 initial-dynamic 正常返回的访客 WebSocket 凭据，订阅 newChatMessage 频道，并读取公开聊天历史。仅只读展示，不发送消息，不生成授权 token；凭据仅保留在服务端内存。

离开直播页或关闭页面时释放观看会话。最多 8 个并发观看会话，媒体请求停止 90 秒后自动清理。聊天断线和直播不可用均显示状态，可重新连接或跳转官网。聊天展示最近 150 条文字消息；礼物动画、发送消息和登录功能未接入。

验证：npm test；node server/live-ui-check.js 实测站内 HLS 播放进度、公开聊天订阅和关闭后媒体接口返回 404。

播放器就绪后调用自动播放；浏览器拒绝有声播放时改为静音重试。播放进度停滞 10 秒会尝试恢复加载并追赶直播位置，严重网络/媒体错误分别恢复加载或重建媒体管线；连续失败最多恢复 3 次。手动暂停不触发自动恢复。测试覆盖静音回退、停滞恢复、暂停保持与清理，真实直播 UI 检查无需手动启动播放。

发现主播与我的关注已分开：发现页仅点击“搜索官网”或表单回车提交后查询，在线状态和排序随本次提交生效；我的关注只显示 favorite 主播，支持本地筛选和直播入口。状态及人数沿用最近采样，过期明确标为待更新。交互测试：node server/directory-ui-check.js。
