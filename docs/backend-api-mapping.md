# 后端 API 映射表

> 来源：`http://223.2.38.27:8080/v3/api-docs`  
> 原始 schema：`docs/openapi-raw.json`  
> OpenAPI 标题：`TzScene 用户认证与管理 API`  
> 生成时间：本轮第一阶段实施  
> 说明：仅读取 schema，未调用任何写操作 / `/api/v1/uav/sync/*`

## 1. 前端页面能力映射

| 前端页面 | 前端能力 | Swagger Tag | 真实接口 | 请求 DTO | 响应 DTO | 是否已联调 |
|---|---|---|---|---|---|---|
| 登录页 | 获取登录公钥 | 用户认证与用户管理 | `POST /api/v1/user/login/public-key` | — | `BaseRspLoginPublicKeyVO` | 待联调 |
| 登录页 | 密码登录 | 用户认证与用户管理 | `POST /api/v1/user/login` | `LoginReq` | `BaseRspLoginRsp` | 待联调 |
| 全局 | 本人信息 | 用户认证与用户管理 | `POST /api/v1/user/info` | — | `BaseRspUserInfoVO` | 待联调 |
| 全局 | 退出登录 | 用户认证与用户管理 | `POST /api/v1/user/logout` | — | `BaseRspVoid` | 待联调 |
| 航线规划 | 航线列表 | 无人机-航线 | `POST /api/v1/uav/wayline/page` | `UavWaylinePageReq` | `BaseRspPageVOUavWayline` | Mock 优先 |
| 航线规划 | 航线详情 | 无人机-航线 | `POST /api/v1/uav/wayline/detail` | `UavIdReq` | `BaseRspUavWayline` | Mock 优先 |
| 航线规划 | 飞行计划列表 | 无人机-飞行计划 | `POST /api/v1/uav/flight-plan/page` | `UavFlightPlanPageReq` | `BaseRspPageVOUavFlightPlan` | Mock 优先 |
| 航线规划 | 飞行计划详情 | 无人机-飞行计划 | `POST /api/v1/uav/flight-plan/detail` | `UavIdReq` | `BaseRspUavFlightPlan` | Mock 优先 |
| 航线规划 | 项目下拉 | 无人机-项目 | `POST /api/v1/uav/project/options` | — | `BaseRspListUavProject` | Mock 优先 |
| 航线规划 | 项目分页 | 无人机-项目 | `POST /api/v1/uav/project/page` | `UavProjectPageReq` | `BaseRspPageVOUavProject` | Mock 优先 |
| 实时巡航 | 正在执行任务 | 无人机-飞行任务 | `POST /api/v1/uav/flight-task/progressing` | — | `BaseRspListUavFlightTask` | Mock 优先 |
| 实时巡航 | 任务详情 | 无人机-飞行任务 | `POST /api/v1/uav/flight-task/detail` | `UavIdReq` | `BaseRspUavFlightTask` | Mock 优先 |
| 实时巡航 | 飞行轨迹 | 无人机-飞行任务 | `POST /api/v1/uav/flight-task/trace` | `UavIdReq` | `BaseRspUavFlightTrace` | Mock 优先 |
| 实时巡航 | 采集素材 | 无人机-飞行任务 | `POST /api/v1/uav/flight-task/media/page` | `UavTaskMediaPageReq` | `BaseRspPageVOUavMediaFile` | Mock 优先 |
| 实时巡航 | 任务分页/历史 | 无人机-飞行任务 | `POST /api/v1/uav/flight-task/page` | `UavFlightTaskPageReq` | `BaseRspPageVOUavFlightTask` | Mock 优先 |
| 实时巡航 | 直播分享码 | 无人机-直播 | `POST /api/v1/uav/live/share-code` | `UavSnReq` | `BaseRspUavShareLiveVO` | Mock 优先 |
| 运行中枢 | 总览统计 | 无人机-统计 | `POST /api/v1/uav/statistics/overview` | `UavStatisticsReq` | `BaseRspUavOverviewVO` | Mock 优先 |
| 运行中枢 | 飞行汇总 | 无人机-统计 | `POST /api/v1/uav/statistics/flight-summary` | `UavStatisticsReq` | `BaseRspUavFlightSummaryVO` | 待联调 |
| 运行中枢 | 设备汇总 | 无人机-统计 | `POST /api/v1/uav/statistics/device-summary` | `UavStatisticsReq` | `BaseRspUavDeviceSummaryVO` | 待联调 |
| 运行中枢 | 素材汇总 | 无人机-统计 | `POST /api/v1/uav/statistics/media-summary` | `UavStatisticsReq` | `BaseRspUavMediaSummaryVO` | 待联调 |
| 设备面板 | 设备分页 | 无人机-设备 | `POST /api/v1/uav/device/page` | `UavDevicePageReq` | `BaseRspPageVOUavDevice` | 待联调 |
| 设备面板 | 设备详情 | 无人机-设备 | `POST /api/v1/uav/device/detail` | `UavSnReq` | `BaseRspUavDevice` | 待联调 |
| 设备面板 | 设备物模型 | 无人机-设备 | `POST /api/v1/uav/device/state` | `UavSnReq` | `BaseRspUavDeviceState` | 待联调 |
| 设备面板 | HMS 告警 | 无人机-设备 | `POST /api/v1/uav/device/hms/page` | `UavHmsPageReq` | `BaseRspPageVOUavDeviceHms` | 待联调 |

## 2. 同步类接口（禁止探测阶段调用）

| 接口 | 说明 |
|---|---|
| `POST /api/v1/uav/sync/all` | 全量同步 |
| `POST /api/v1/uav/sync/project` | 单项目同步 |
| `POST /api/v1/uav/sync/flight-plan` | 单计划同步 |
| `POST /api/v1/uav/sync/flight-task` | 单任务同步 |
| `POST /api/v1/uav/sync/device` | 单设备同步 |
| `POST /api/v1/uav/sync/record` | 同步记录详情 |

## 3. 前端封装位置

| 能力 | 前端文件 |
|---|---|
| Mock / 真实切换入口 | `src/api/patrol.ts` |
| DTO → 领域模型 | `src/adapters/dasFly.ts` |
| Axios 客户端 | `src/api/client.ts` |

## 4. 关键结论

1. **航线**应对齐 `uav/wayline/*`，不是建议文档里的 `/api/v1/patrol/routes`。
2. **直播**已有 `uav/live/share-code`，可支撑后续开放组件 / 临时播放地址接入。
3. **登录**四件套已在 Swagger：`public-key / login / info / logout`。
4. 本轮前端默认 `VITE_USE_MOCK=true`，真实路径已写入 `src/api/patrol.ts`；认证与主要 UAV 查询接口已完成真实冒烟测试。
5. OpenAPI 共解析出 **60** 个操作，完整清单见 `docs/openapi-summary.json`。

## 5. 联调补充（2026-09-13）

- 登录必须使用 PKCS#1 v1.5；Swagger 标注的 OAEP-256 在当前后端实测解密失败。
- 后端 int64 以 JSON number 返回，浏览器会丢失精度；前端 `src/api/client.ts` 已在解析前转为字符串。
- 航线真实字段包括 `id / name / waylineType / createTime`。
- 飞行计划真实字段包括 `id / name / sn / status / waylineId / waylineName / waylineType / schedulerParamJson`。
- 飞行任务真实字段包括 `id / name / droneSn / droneType / sn / planId / planName / waylineId / waylineName / enableTrace / progressing / flightDistance`。
- 项目真实字段包括 `id / name / centerLongitude / centerLatitude`。
- 直播分享码响应字段为 `code / expireTime / fromCache / sn`。
- 完整测试结果见 `docs/api-test-report.md`。
