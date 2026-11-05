# 设施状态 bizStatus 新增/编辑不生效 —— 后端定位说明

记录时间：2026-11-05 14:59（北京时间）
环境：`http://223.2.41.169:8080`（前端经 vite `/api` 代理访问），部门 `deptId=1`。
现象页面：专题分析 / 高标准农田工程设施管理 / 设施台账。

## 现象

1. 新增设施时把「设施状态」选为「异常」，提交返回成功，但列表中该条仍显示「正常」，顶部统计 `abnormalCount=0`。
2. 编辑已有设施，把状态改为「异常 / 核查中 / 废弃」，保存返回成功，状态保持「正常」不变。
3. 同一表单里的其它字段（设施名称、设施类型等）可以正常新增和修改。

## 复现请求（浏览器 DevTools Network 实测）

`POST /api/v1/biz/facility/add`

~~~json
{"deptId":1,"facilityNo":"","name":"test2","facilityType":"DITCH","bizStatus":"ABNORMAL"}
~~~

结果：`code=0`，新增记录 `facilityNo=NYNCJ-20261105-0003`，但 `facility/page` 与 `facility/statistics/overall` 均显示为正常。

`POST /api/v1/biz/facility/update` 使用同一套字段（多一个 `id`），状态同样不生效。

## 已排除的前端因素

- 请求体中确实包含 `bizStatus: "ABNORMAL"`，见上方实测 payload。
- 新增与编辑共用同一个 DTO：`src/api/facility.ts:47-48`、`src/components/FacilityEditDialog.vue:35-49`。
- 同一次请求里的 `facilityType: "DITCH"` 能正确落库并显示为「沟渠」，说明该模块接受字符串枚举、命名风格一致；只有 `bizStatus` 单独失效。
- axios 实例（`src/api/client.ts`）无请求体裁剪、无字段白名单。

## 请后端排查的点

1. `add` / `update` 的请求 VO 是否包含 `bizStatus` 字段，是否被 `@JsonIgnore` 或未知属性策略丢弃。
2. 新增时 service 是否强制 `setBizStatus("NORMAL")` 覆盖入参；是否存在“非法值回落默认值”的逻辑。
3. 实体 `biz_status` 列的 MyBatis-Plus 映射：`@TableField(exist=false)`、`insertStrategy` / `updateStrategy`、字段名与列名不一致。
4. `update` 是否使用只更新白名单字段的 SQL，遗漏了 `biz_status`。
5. 若库中 `biz_status` 存的是数字码，请明确接口契约；前端当前传的是字符串枚举 `NORMAL / ABNORMAL / CHECKING / DISCARDED`。非法值必须报错，不能静默按正常落库。
6. 列表 `bizStatusName`、统计 `abnormalCount` 与实际存储值是否一致，是否存在缓存未刷新。

## 回归验收标准

- 用上面同一 payload 新增：`detail` 返回 `bizStatus=ABNORMAL`，`page` 中该条 `bizStatusName=异常`，`statistics/overall` 的 `abnormalCount` 增加 1。
- 对同一记录依次 `update` 为 `CHECKING`、`DISCARDED`、`NORMAL`，每次回读都与提交值一致。
- 传入非法值（如 `bizStatus="FOO"`）返回明确错误码和可读信息，不得返回成功。

## 前端配合项（可选加固）

保存成功后用 `facility/detail` 回读 `bizStatus`，与提交值不一致时提示「状态未保存成功」，避免界面误报成功；若后端最终采用数字码，前端在 `src/api/facility.ts` 增加码值与文本的映射层。
