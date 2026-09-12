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
