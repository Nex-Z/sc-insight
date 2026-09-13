# 房间状态与录制可用性

关注 / 监控主播每轮直接读取官网 `/api/front/v2/models/<id>/cam` 并校验身份，搜索接口只补充人数。搜索列表没有对应结果或查询失败不会覆盖房间接口确认的状态；人数缺失记为未知，不当作零人数。房间查询失败保留上次成功值并记失败观察，不写离线样本。

| 房间证据 | 本地状态 | 在线统计 | 公开录制 |
| --- | --- | --- | --- |
| `public` 且 `isCamAvailable=true` | 公开直播 | 在线 | 可尝试录制 |
| `public` 但公开视频不可用 | 公开直播 / 视频不可用 | 在线 | 不可录制 |
| `groupShow`，当前未结束且身份匹配的场次 `details.groupShow.type=ticket` | 开票直播 | 在线 | 不可录制 |
| 同上且类型为 `group` | 付费群组直播 | 在线 | 不可录制 |
| `groupShow` 缺少当前计费类型证据 | 群组直播，计费类型未确认 | 在线 | 不可录制 |
| `private` / `p2p` | 私聊 / 独占私聊 | 在线 | 不可录制 |
| `off` / `offline` | 已离线 | 离线，结束观察场次 | 不可录制 |
| `away` | 暂离 | 在线 | 不可录制 |
| `idle` 或未适配的新状态（如 `virtualPrivate`） | 空闲 / 未确认 | 不计为明确在线或离线，场次标记不完整 | 不可录制 |

`isCamAvailable=false`、`isCamActive`、账号 `isOnline` 和无法播放都不能单独证明下播。仅凭 `groupShow` 也不能确定按票收费。官网说明区分按票与按分钟的群组表演：[Ticket / Group shows](https://support.supportlivecam.com/hc/en-us/articles/20652827793681-How-to-start-a-Ticket-Group-show)。

数据库 `models.room_details` 与 `broadcast_observations.room_details` 保存白名单证据（原始状态、场次 ID、类型、来源、可录制性），不保存媒体 token、用户 token 或整份上游响应。详情页显示中文房间状态与明确票场时长；历史群组记录不重新猜测票场。模式变化落在两个采样之间时，该过渡区间仍计入连续在线覆盖，但不强行分配给某种房间模式。

高光检测到转票场、私聊、群组或公开流不可用时停止接收，归档此前可用画面，保存 `end_reason` / `end_room_status` 与具体说明。流先断开时额外查询房间确认原因；确认不了就记未确认，不伪造开票或离线。不会把无法接收的付费阶段算成已录到的 15 分钟；恢复公开直播后重新开始缓存，无法录制的间隙不会拼成连续视频。

当前只识别进行中且有明确字段证据的票场，尚未适配售票预告结构。实时采样依然可能错过两次采样之间发生的短暂状态变化。

验证：`npm test`；`node server/room-state-integration.js`（事务回滚验证公开→票场→私聊→空闲→公开→离线，场次延续、时长、证据和缺失人数均值）；`node server/highlight-integration.js`；`node server/highlight-ui-check.js`。当前官网已抽查到明确 `ticket` 票场、`p2p` 私聊和 `off` 离线。未用实际主播从公开转票场的完整自然过程验收中断时序。
