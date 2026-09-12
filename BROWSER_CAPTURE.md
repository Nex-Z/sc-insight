# Browser Media Capture

独立于任何网站适配器。实现位于 `server/browser-capture.js`，通过 Playwright 的浏览器网络事件读取已经产生的请求和响应，不扫描页面源码中的隐藏播放地址，不读取其他浏览器配置文件或 Cookie 数据库。

## 使用

1. 安装依赖，运行 `npm run db:init`，启动 `npm start`。本机需有 FFmpeg / FFprobe，以及 Edge、Chrome 或 `npx playwright install chromium` 安装的 Chromium。
2. 打开 `http://127.0.0.1:3010/#recordings`，在 Browser Media Capture 面板选择浏览器并点击“连接 / 打开浏览器”。
3. 优先连接指定的本机 CDP 地址（默认 `http://127.0.0.1:9222`）。没有可连接的调试浏览器时，会打开可见的独立窗口，配置文件保存在被 Git 忽略的 `storage/browser-profiles/<browser>`。请在该窗口正常访问、登录并播放你有权访问的页面。
4. 在面板选择对应页面，选择推荐流或手动选择其他候选，设置 5 秒至 6 小时的录制时长，点击录制。录制不依赖主播档案；文件进入现有录像目录、队列和归档系统。
5. 录制过程中可以停止，归档后可以播放。刷新页面会自动清理旧候选；“刷新页面并重新检测”会触发一次正常刷新。“清空候选”仅清空监听结果，不发起请求。

普通浏览器必须预先开启 CDP 才能附加；已经完成的历史网络请求不能被补录。可以在连接后正常刷新或重新播放。没有 CDP 时不会接管或关闭原来的普通浏览器，也不会复制其登录信息，需要在新窗口自行登录。

例如在 Windows 上启动独立 Edge 调试配置：

```powershell
& "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe" --remote-debugging-port=9222 --user-data-dir="$env:LOCALAPPDATA\BrowserMediaCapture-CDP"
```

## 数据与识别

- 识别 `.m3u8`、`.mpd`、`.ts`、`.m4s`，以及 HLS、DASH、video/audio MIME。URL 查询参数不影响扩展名识别。
- 内存候选保存 URL、method、完整浏览器请求 headers、Referer、User-Agent、实际发送的 Cookie、Content-Type、HTTP 状态、发现次数和时间。
- 不调用全站 Cookie 导出接口。HttpOnly Cookie 来自当前会话实际发送的请求，未发送的 Cookie 不会加入。
- 主流推荐是启发式：HLS master 优先，其次清单、完整视频、音频。失败请求、非 GET、独立分片以及已识别的 DRM 清单不能录制。推荐不能保证识别广告和主视频，用户可以手动选择。
- 只读取已响应的清单来识别 HLS master 和 DRM 标记。DASH ContentProtection、HLS SAMPLE-AES 或非 identity KEYFORMAT 会禁用录制。不请求许可证、不生成 token、不破解 DRM。未识别的保护机制或已过期地址会正常录制失败。
- 每页最多 300 个候选，优先淘汰分片，避免持续播放挤掉主清单。异步迟到的旧页面响应不能重新加入刷新后的候选。超过 30 分钟的候选需要重新检测。
- API 默认不返回 Cookie / Authorization 等请求头值；界面显示完整媒体 URL、Referer、User-Agent 和请求头名称。API 禁止缓存，仅允许本机、同源访问。

## RecorderCore 接入

现有核心是 `server/recorder.js`。`createBrowserRecording(candidate, seconds)` 使用同一个 FFmpeg Worker、并发限制、磁盘检查、停止流程、归档和播放接口。

浏览器媒体 URL / headers 仅保存在 Worker 内存中，数据库只存 `browser-session` 标记。每次排队冻结选中请求的快照，刷新不会把进行中的任务切换到别的流。任务结束或取消后清理快照；服务重启会明确将等待中的浏览器任务标为失败，需要重新检测。不会把浏览器会话设为自动录像源。

`captureInputArgs` 通过独立 argv 参数向 FFmpeg 传递已有请求头，不使用 shell。User-Agent、Referer 使用专用参数；Cookie 使用 FFmpeg 按捕获主机及非默认端口限定的 cookie jar；过滤 HTTP/2 伪头、Host、Range、压缩和连接相关头，拒绝换行注入与过长参数。其他请求头由 FFmpeg 用于媒体请求。浏览器录制的 FFmpeg 失败日志不会写入数据库，以免包含会话信息。

浏览器关闭或地址过期后，已经开始的录制可以继续到流失效或指定时长，系统不会刷新授权或绕过访问控制。切换流需要重新手动选择录制。`blob:` / MSE 内存本身不是远程媒体地址；可以识别其背后的正常 HTTP 媒体请求。只看到独立分片时会提示不可作为主流录制。

## 测试

```powershell
npm test
npm run build
npm run test:capture
# 先启动本地应用；此测试保留一条公开测试录像以供播放核验
npm run test:capture:ui
# Chrome 运行同一套真实浏览器测试
$env:CAPTURE_TEST_BROWSER='chrome'
npm run test:capture
```

`test:capture` 首先用本机公开 HTML fixture 验证真实 HttpOnly Cookie / Referer / UA 捕获、MIME-only 媒体、刷新和流 URL 变化，再打开公开 [hls.js demo](https://hlsjs.video-dev.org/demo/)，监听 [Mux Big Buck Bunny HLS](https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8)，通过 FFmpeg 录制 5 秒并用 FFprobe 验证。随后使用本地会话约束 HLS fixture 验证：缺少会话时返回 403，传入实际捕获的 Cookie、Referer 和 User-Agent 后，FFmpeg 能读取清单及分片并生成有效 MP4。

`test:capture:ui` 从真实 UI 连接 CDP，选择流、创建 Worker 任务、等待完成并验证播放接口，检查页面错误和移动端布局。输出在 `artifacts/capture-*`。网络测试需要外网，外部页面不可用时明确失败，不伪装通过。

接入 API 依据：[Playwright BrowserType](https://playwright.dev/docs/api/class-browsertype)、[Request.allHeaders](https://playwright.dev/docs/api/class-request#request-all-headers)。

Cookie 参数格式参考 [FFmpeg HTTP Cookies](https://www.ffmpeg.org/ffmpeg-protocols.html#HTTP-Cookies)。

## 直播中出现大量 HLS 请求

界面按 LL-HLS 播放清单合并标准更新参数 `_HLS_msn`、`_HLS_part`、`_HLS_skip` 不同的请求，默认突出 HLS/DASH 播放清单。授权、频道和清晰度等其他参数保持区分，不猜测参数含义。分组仅改变显示，选择会随新请求更新，录制提交最新实际请求 ID，绝不使用删改后的 URL。勾选“显示全部原始请求”可查看分片和更新记录。后端仍保留有界的原始候选。

此改动仅需刷新录像管理页，不需要刷新直播页面或重启捕获浏览器。可运行 `npm run test:capture:groups:ui` 验证合并、稳定选择和原始请求切换；录制接口使用测试替身，不会录制当前直播。

LL-HLS 更新参数依据 [Apple HLS 文档](https://developer.apple.com/documentation/http-live-streaming/enabling-low-latency-http-live-streaming-hls)。
