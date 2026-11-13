# 后端接口静态核对清单

接口文档：/v3/api-docs；读取日期：2026-11-13。共 202 个操作。

本清单以当前工作区 src 源码和 Swagger 路径文本比对，未调用业务接口；封装、动态 URL、第三方组件、条件入口可能导致误判。匹配到路径不等于已实际使用，未匹配也不等于应接入。

以下 43 项未直接匹配完整路径，其中 5 项已核实为动态调用，其他为待复核候选。

| 方法 | 接口 | Swagger 说明 | 静态核对 |
| --- | --- | --- | --- |
| POST | `/api/v1/workflow/transfer` | 转办 | 未发现直接路径调用，需结合业务、动态路径与权限复核 |
| POST | `/api/v1/user/dept/save` | 调整用户部门归属（管理员/部门管理员/本人） | 未发现直接路径调用，需结合业务、动态路径与权限复核 |
| POST | `/api/v1/uav/sync/record` | 同步记录详情 | 未发现直接路径调用，需结合业务、动态路径与权限复核 |
| POST | `/api/v1/uav/sync/project` | 单项目同步 | 未发现直接路径调用，需结合业务、动态路径与权限复核 |
| POST | `/api/v1/uav/sync/flight-task` | 单任务同步 | 未发现直接路径调用，需结合业务、动态路径与权限复核 |
| POST | `/api/v1/uav/sync/flight-plan` | 单计划同步 | 未发现直接路径调用，需结合业务、动态路径与权限复核 |
| POST | `/api/v1/uav/sync/device` | 单设备同步 | 未发现直接路径调用，需结合业务、动态路径与权限复核 |
| POST | `/api/v1/uav/sync/all` | 全量同步 | 未发现直接路径调用，需结合业务、动态路径与权限复核 |
| POST | `/api/v1/uav/statistics/count-by-dept` | 按部门统计（管理员） | 未发现直接路径调用，需结合业务、动态路径与权限复核 |
| POST | `/api/v1/uav/region-boundary/import` | 导入边界 GeoJSON（管理员） | 未发现直接路径调用，需结合业务、动态路径与权限复核 |
| POST | `/api/v1/uav/project/page` | 项目分页查询 | 未发现直接路径调用，需结合业务、动态路径与权限复核 |
| POST | `/api/v1/uav/project/detail` | 项目详情 | 未发现直接路径调用，需结合业务、动态路径与权限复核 |
| POST | `/api/v1/uav/media/thumb/backfill` | 存量缩略图批量补生成（管理员） | 未发现直接路径调用，需结合业务、动态路径与权限复核 |
| POST | `/api/v1/uav/media/match/raw` | 按坐标匹配最近图片（二进制流） | 未发现直接路径调用，需结合业务、动态路径与权限复核 |
| POST | `/api/v1/uav/media/download` | 手动触发素材下载 | 未发现直接路径调用，需结合业务、动态路径与权限复核 |
| POST | `/api/v1/uav/media/clean` | 手动触发清理（管理员） | 未发现直接路径调用，需结合业务、动态路径与权限复核 |
| POST | `/api/v1/uav/media/clean/record/page` | 清理记录分页（管理员） | 未发现直接路径调用，需结合业务、动态路径与权限复核 |
| POST | `/api/v1/uav/media/clean/config` | 查询清理配置（管理员） | 未发现直接路径调用，需结合业务、动态路径与权限复核 |
| POST | `/api/v1/uav/device/detail` | 设备详情 | 未发现直接路径调用，需结合业务、动态路径与权限复核 |
| POST | `/api/v1/uav/dept-exclude/remove` | 移除排除项（恢复可见） | 未发现直接路径调用，需结合业务、动态路径与权限复核 |
| POST | `/api/v1/uav/dept-exclude/preview` | 级联影响预览 | 未发现直接路径调用，需结合业务、动态路径与权限复核 |
| POST | `/api/v1/uav/dept-exclude/page` | 例外项分页查询 | 未发现直接路径调用，需结合业务、动态路径与权限复核 |
| POST | `/api/v1/uav/dept-exclude/batch` | 批量排除/恢复 | 未发现直接路径调用，需结合业务、动态路径与权限复核 |
| POST | `/api/v1/uav/dept-exclude/add` | 新增排除项 | 未发现直接路径调用，需结合业务、动态路径与权限复核 |
| POST | `/api/v1/uav/asset/page` | 建模成果分页 | 未发现直接路径调用，需结合业务、动态路径与权限复核 |
| POST | `/api/v1/uav/asset/download` | 手动触发模型下载（管理员） | 未发现直接路径调用，需结合业务、动态路径与权限复核 |
| POST | `/api/v1/uav/asset/download/file` | 手动下载单个文件（管理员） | 未发现直接路径调用，需结合业务、动态路径与权限复核 |
| POST | `/api/v1/uav/asset/detail` | 建模成果详情 | 未发现直接路径调用，需结合业务、动态路径与权限复核 |
| POST | `/api/v1/spatial/spot/compare/upload` | 发起 shp 上传对比分析（异步） | 未发现直接路径调用，需结合业务、动态路径与权限复核 |
| POST | `/api/v1/spatial/region-clip/status` | 查询裁切任务状态 | 已接入：src/api/region-clip.ts 动态拼接 |
| POST | `/api/v1/spatial/region-clip/geojson` | 获取单图层裁切结果 | 已接入：src/api/region-clip.ts 动态拼接 |
| POST | `/api/v1/biz/statistics/flight-summary` | 飞行统计（透传无人机） | 未发现直接路径调用，需结合业务、动态路径与权限复核 |
| POST | `/api/v1/biz/statistics/count-by-dept` | 部门横向对比（管理员） | 未发现直接路径调用，需结合业务、动态路径与权限复核 |
| POST | `/api/v1/biz/result/upload` | 上传成果（管理员，multipart） | 未发现直接路径调用，需结合业务、动态路径与权限复核 |
| POST | `/api/v1/biz/result/parse` | 手动触发解析（管理员） | 未发现直接路径调用，需结合业务、动态路径与权限复核 |
| POST | `/api/v1/biz/result/download` | 下载成果文件 | 未发现直接路径调用，需结合业务、动态路径与权限复核 |
| POST | `/api/v1/biz/recognition/spot/api-import` | 接口导入识别图斑（预留） | 未发现直接路径调用，需结合业务、动态路径与权限复核 |
| POST | `/api/v1/biz/facility/statistics/by-status` | 按状态统计 | 未发现直接路径调用，需结合业务、动态路径与权限复核 |
| POST | `/api/v1/biz/facility/import/layers` | 图层要素导入（部门管理员） | 未发现直接路径调用，需结合业务、动态路径与权限复核 |
| POST | `/api/v1/biz/facility/import/layers/preview` | 图层要素导入预览 | 未发现直接路径调用，需结合业务、动态路径与权限复核 |
| GET | `/api/v1/uav/media/thumb/{mediaId}` | 本地缩略图服务（GET 二进制流） | 已接入：本地缩略图 URL，动态请求 |
| GET | `/api/v1/uav/media/srt/{mediaId}` | 本地 SRT 字幕文件服务（GET 二进制流） | 已接入：src/api/flight-review.ts 动态请求 |
| GET | `/api/v1/uav/media/file/{mediaId}` | 本地素材文件服务（GET 二进制流） | 已接入：本地素材 URL，动态请求 |

接口原始快照：`docs/backend-task-snapshot/openapi-current.json`。
