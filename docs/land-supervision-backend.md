# 违法用地预警与整改：后端接入需求

## 2026-11-27 节点定义与 SHP 持久化接入

以本节为当前实现，旧节的“节点契约缺失／只读”说明已被用户提供的 `wf_node_def.json` 覆盖。

- 流程5：`DISTRICT_DISPATCH → SECTION_DISPATCH → FIELD_COLLECT → SECTION_AUDIT → FINISH_EARLYWARN`。前三步 result=`FORWARD`；审核 result=`NO_PROBLEM/PROBLEM`，均按配置进入结束节点，转整改副作用由 `earlyWarnAuditHandler` 负责，前端不另建重复任务。
- 流程6：`DISTRICT_DISPATCH → SECTION_DISPATCH → FIELD_RECTIFY → SECTION_AUDIT → FINISH_RECTIFY`。审核 `NO_PROBLEM` 进入结束，`PROBLEM` 返回 `FIELD_RECTIFY`，由后端 `prevAssignee` 恢复原整改人，前端不覆盖处理人。
- 实地节点提交 checkTime、checker、description、attachment（当前节点真实附件ID）；所有人工派发选择下一处理人，派发整改时要求期限。结束节点没有 result 路由，不编造结论。复用共享步骤、操作人时间、选人和无人机照片组件，仅当前指定处理人可办理；提交前重读当前实例校验，历史只读。流程节点及路由测试使用所提供JSON的提取夹具核对。
- 两个专题地图与识别页新增 SHP 入口：`POST /api/v1/biz/upload/shp/upload`，multipart `files` + shareScope=`TOPIC` + topicCode/部门/数据集名称；返回数据集ID后调用 `POST /api/v1/biz/topic/object/import-from-dataset`。预警固定 objectType=`SUSPECT`；整改固定 `CONFIRMED`。面图斑最多2000条，前端预检查组件、坐标、几何及名称字段；无压缩包猜测接口。保存和导入分两步，明确业务失败只重试导入，响应不明时停止自动重试，支持查看已保存数据集。导入后刷新专题对象与识别列表，不自动审核或批量建任务。

**仍需后端确认的业务契约：**

1. `earlyWarnAuditHandler` 的 PROBLEM 分支是否已事务化创建唯一整改任务、继承图斑和材料？请在任务详情返回 `sourceTaskId/linkedTaskId`（或明确已有字段），供前端跳转关联任务。节点JSON只定义转到 FINISH_EARLYWARN，未定义转整改出参。
2. `import-from-dataset` 是否提供重复导入保护及原子性？建议以 datasetId + topicCode + objectType 幂等，并在数据集返回精确导入目标及对象ID。网络超时或跨用户操作时，前端无法独自保证不重复导入。服务端也须校验问题对象仅为面几何。
3. 原子对象派生任务及 taskId 回链、监管范围服务端校验、特色指标、历史附件预览等，仍见下节未补齐项。节点定义接入不等于这些数据契约已经具备。

本轮验证限页面、读接口及请求测试；没有擅自推进真实任务或导入新的持久业务图斑。

## 2026-11-26 专题识别真实联调（用户已授权两条演示任务）

实测纠正：这两个场景禁止调用通用识别图斑写入接口，返回“该场景不允许从智能识别创建图斑或任务（仅专题分析内操作）”。失败请求未保存数据。新页面已改为 **/biz/topic/object/draw → 预警对象 /object/audit → /biz/task/create → /biz/task/geometry/upsert → 工作台**；整改 CONFIRMED 对象按接口规定 auditStatus=-1，无需额外对象审核。通用识别仅复用场景异常类型目录，不调用其保存、审核、派生接口。对象审核与现场核查结论确认仍是不同环节。

已从浏览器各创建一次，并读回数据库接口核对：

- 整改对象 TO-20261126-001（ID 1）→ 任务 ZRZY-20261126-009（2659），首节点133，流程 STOCK_ILLEGAL_LAND_RECTIFY_FLOW。
- 预警对象 TO-20261126-002（ID 2，auditStatus=1）→ 任务 ZRZY-20261126-010（2660），首节点134，流程 ILLEGAL_LAND_EARLY_WARN_FLOW。
- 两任务的实际首节点均为 DISTRICT_DISPATCH / 区县分局派发，办理人均为后台最新配置 zgjbz（1364），PROCESSING。保存了实际演示面几何及参考影像服务1、6；没有代负责人提交后续派发、审核或结案。均明确标注“联调演示、不代表实际违法认定”。

当前兼容方式与待补充项：

1. TopicDrawReq 只有 remark 可保存扩展信息，当前按 JSON 记录判读说明、类型、发现时间、所选监管范围和前后期影像ID；页面解析后显示中文内容。建议新增结构化 propsJson、mapServiceIds、scopeObjectIds，避免依赖备注。
2. BizTaskVO 已返回 topicObjectId，但当前 BizTaskCreateReq 未提供入参，且无专题对象派生任务接口。当前任务名称含对象编号，description 带来源标记，前端创建前按场景查询已有关联任务；已建任务直接打开，缺范围时只补范围。**这不提供服务端并发唯一保证**。请新增原子对象建任务接口（或 create 接收 topicObjectId + requestId），事务内唯一约束来源对象、继承几何及影像、自动启动场景流程，并在对象 detail/page 返回 taskId/taskNo。
3. 已验证 geometry/upsert 不保留自定义 Feature properties；工作台改从任务的 topicObjectId 或兼容来源标记读取真实专题对象，恢复来源及前后期影像信息。任务受理仍复用共享组件，以“来源专题对象”展示，不能冒充 biz_abnormal 图斑。
4. 两个对象均有有效 Polygon，但 object/detail/page 的 area 返回 null；任务范围接口对同几何返回面积15471.1719㎡、5802.0391㎡。请对象绘制时计算并保存平方米面积；前端不把缺失面积虚构为0，有已关联任务时可读取该任务范围面积。
5. 两个专题暂无后端 SCOPE 演示范围，当前使用本机会话临时绘制范围。请提供演示范围并在服务端校验图斑属于 scopeObjectIds，不能只依赖前端几何校验。
6. 工作台后续节点提交仍缺正式 result 路由和转整改事务契约；本轮只验证自动进入场景负责人首节点待办，不将其描述为已完成全部核查/整改流程。

## 2026-11-26 工作台与地图联调

按用户要求已创建两条带演示面几何的真实测试任务（不代表实际违法认定）：预警 `ZRZY-20261126-002` / ID `2651`，整改 `ZRZY-20261126-003` / ID `2652`。均已自动启动专用流程，分别为 `ILLEGAL_LAND_EARLY_WARN_FLOW`、`STOCK_ILLEGAL_LAND_RECTIFY_FLOW`；实际首节点为 `DISTRICT_DISPATCH`（区县分局派发），办理人均为后台配置的部门主管A（1253）。没有执行派发、审核或结案。

前端已复用既有 `WorkflowActorBadge`，并抽取与非粮化工作台共用的 `WorkflowSteps`，按真实节点状态高亮。新场景任务受理复用 `TaskAcceptancePanel`；各工作台补充普通底图、任务真实点/线/面和 WGS84 坐标；任务列表增加序号及悬浮位置预览。乡级名称取系统已登记海陵区行政区划，公共边界备份仅含名称与几何，地图按权限查询到的新区划可覆盖备份；小地图放大后按实际所在行政面显示名称，不凭最近中心点推断。

专题图例统一右下角，按内容自然撑高，不设置高度上限、内部滚动或自动字号压缩。右侧统计/分析结果/要素详情 z-index=525，高于图例440，可分别折叠；图例不参与左侧或右侧面板的高度、位置计算。

后端专用流程现在确实存在，但 Swagger 仍未公布这些实际节点的 `resultData.result` 路由及转整改事务契约；正式节点提交继续只读，不能套用此前提案的 DISPATCH 等假定键。此前 2026-11-25 的空任务数据为当日记录，不代表当前数量。

## 2026-11-25 实际接入与待补充项

已核对 `http://223.2.41.169:8080/swagger-ui/index.html#/` 并只读联调自规局（deptId=2）。前端开发环境已指向该后端；生产环境仍保留 `58.213.29.196:38080`，未部署本轮改动。

当前前端使用实际发布的 `/api/v1/biz/topic/object/geojson`、`/object/draw`、`/object/audit`、`/biz/topic/task/page`、`/biz/topic/stats`，以及通用 `/biz/task/create`、`/geometry/upsert`、`/detail`、`/geometry/geojson`、`/workflow/flow/detail`、`/workflow/file/upload`。不再请求原提案中的 `/land-supervision/*`。对象审核与工作流核查确认保持独立，不将一次对象审核冒充整条核查整改流程。

**后端需要补充或确认：**

1. **监管范围及演示数据**：两个专题的对象接口当前均返回空数据。请提供3—5个真实入库的演示监管面，并明确这两个场景是否支持 `SCOPE`（文档当前将 SCOPE 标为林业监测范围）。GeoJSON 每个要素须带稳定 `id`、名称、类型与 WGS84 完整面；SUSPECT/CONFIRMED 不能充当监管边界。前端允许本机临时绘制，不保存边界。
2. **按范围筛选及统计**：任务分页与统计请求目前没有 `regionIds`。请支持一个或多个监管范围筛选、去重，并明确空选择含义；统计不受列表关键词、状态、分页影响。目前前端明确显示“全场景统计”，不会把全场景数据标成所选范围数据。两个场景的 `/biz/topic/stats` 均返回 `metrics:[]`，请按已配置的三个指标分别返回实际数值及单位，未知为 null；违占面积只统计确认问题的面积，不能直接使用所有疑似异常面积替代。
3. **专用工作流契约**：预警场景当前 `governanceEnabled=0`，需改为需要治理并配置相应负责人和专用流程。请分别提供两个场景的 `flowKey`、每个 `nodeKey/nodeType`、提交 `resultData` 字段和 `result` 路由值示例，以及退回、负责人自动接收、整改期限、材料校验规则。通用 `/workflow/submit` 文档只写“result 为路由结论”，不足以确定八类业务动作。前端已接通真实流程读取，未确认的流程仅查看，不猜路由提交，也不把 DEFAULT_FLOW 伪装为场景流程。
4. **原子转整改及关联**：请确认负责人认定“是问题”后，是否已在后端事务内完成预警转整改、原任务置已转整改、唯一生成子任务及证据继承；返回 `sourceTaskId/linkedTaskId`，重复提交不能多建。当前通用任务模型没有这些字段，前端不会用另建任务模拟该事务。
5. **任务创建、范围与幂等**：目前创建和保存几何是两个请求，创建请求没有 `requestId`、监管范围或专题对象关联字段。请提供原子入口或补充幂等及回链字段，并校验图斑在有效监管范围内。前端已防双击、同会话失败后仅补保存范围；创建响应超时会要求先核对任务中心，不自动重建。仍需要服务端跨刷新、跨会话幂等和版本冲突保护。
6. **凭证历史预览**：当前节点附件只返回 ID/文件名等信息，没有签名图片 URL 或附件读取接口。请提供历史可用的图片预览方式，并支持保存 PHOTO/AFTER_IMAGE/UAV_PHOTO 类型及 mediaId；上传返回新增文件编号更佳。前端已复用通用附件上传，局部临时预览不能替代刷新后的历史预览。

现有数据核对：两场景对象数、任务数均为0；预警统计 `abnormalCount=1`，其他特色指标未提供；整改特色指标未提供。未创建、派发、审核或转移真实任务。需提供测试监管面和具有专用流程的测试任务，才能完成端到端办理验收。

---

以下保留原始业务契约提案供后端补齐规则参考；这些建议路径并非当前前端使用的接口。

前端已在专题图和工作台预留以下契约。复用后台已有的两个场景编码，不需要重新创建场景；接口名称可以调整，请确认后同步前端。需要为现有场景配置对应工作流，不能沿用其他场景的默认流程。

## 1. 场景与流程

- `ILLEGAL_LAND_EARLY_WARN`：**新增违法违规用地智能预警**。
  任务受理（只读详情，非办理节点）→ `DISPATCH` 科室负责人审核并派发 → `INSPECTION` 现场核查 → `CONFIRM` 科室负责人确认结论。
  核查人员只提交“是问题/不是问题”，不直接结案；负责人可退回核查。确认不是问题才 `CLOSED`；确认是问题时，原任务 `TRANSFERRED`，**事务内自动创建一条关联整改任务**。
- `STOCK_ILLEGAL_LAND_RECTIFY`：**全程监测存量违法违规用地整改**。
  接收预警转入或手动创建 → 任务受理（只读详情）→ `DISPATCH` 负责人派发并设置整改期限 → `RECTIFY` 整改人处理 → `REVIEW` 场景负责人审核 → `CLOSED` 销号；不通过退回 `RECTIFY`。
- 两个场景分别使用后台配置的场景负责人。派发、核查结论确认、整改审核必须按相应负责人配置流转，不由前端硬编码用户。
- 两个场景均应配置 `governanceEnabled=1`。当前人工圈图创建任务，建议 `defaultRefType=NONE`，不强制绑定飞行任务；预警转整改通过 sourceTaskId/linkedTaskId 关联业务任务。
- 限自然资源和规划局；后端校验当前账号、当前部门及场景权限，不能仅信任请求里的 deptId。暂不细分片区权限。
- 接入现有任务中心与工作流：任务列表、任务详情、我的待办、节点历史、操作人和操作时间均能识别两种任务；不要另建只能在专题里访问的孤立任务。

## 2. 演示监管边界

请在海陵区生成3—5个合理的小片区面，明确为演示边界，不代表真实监管区。两个场景可共用边界，前端按场景读取。**本期不需要新增、修改、删除边界接口，也不需要对象维护页面**；前端绘制仅用于临时演示，不提交保存。

统一 WGS84 / EPSG:4326，坐标顺序 `[经度,纬度]`；有效 Polygon/MultiPolygon，保留洞及独立面，不返回仅有包围盒或中心点的数据。

建议接口：以下全部 POST，前缀 `/api/v1/land-supervision`，统一现有 BaseRsp：`{code:"0",msg:"success",data:...}`，所有 ID 用字符串。

### `/region/list`

请求：`{deptId, sceneCode}`。

data：`[{id, name, geometry:{type:"Polygon",coordinates:[...]}, areaSqm?}]`。

边界 ID 固定，可由任务引用；空数组为正常空结果。

## 3. 专题任务数据

### `/task/page`

请求：`{deptId, sceneCode, regionIds:[], keyword, stage?, pageNum:1, pageSize:10}`。

data：`{records:LandTask[], total, pageNum, pageSize, statistics:{...}}`。`total` 是列表筛选后的条数，不能代替业务统计。

指标与成果字典统一使用后台已配置的以下 JSON：

```json
{"metrics":[{"key":"abnormalCount","name":"疑似违法图斑数","unit":"个"},{"key":"violationArea","name":"违占面积","unit":"亩"},{"key":"earlyWarnCount","name":"预警下发数","unit":"个"}],"resultTypes":[{"code":"SUSPECT_PATCH","name":"疑似违法图斑","geometryType":"POLYGON"}]}
```

```json
{"metrics":[{"key":"stockCount","name":"存量地块数","unit":"个"},{"key":"rectifiedCount","name":"整改达标数","unit":"个"},{"key":"canceledCount","name":"销号数","unit":"个"}],"resultTypes":[{"code":"RECTIFY_PROGRESS","name":"整改进度影像","geometryType":"POLYGON"},{"code":"RECTIFY_POINT","name":"整改核查点位","geometryType":"POINT"}]}
```

预警返回 `statistics:{abnormalCount,violationArea,earlyWarnCount}`；整改返回 `statistics:{stockCount,rectifiedCount,canceledCount}`。数量为整数，violationArea 已换算为亩（1亩=2000/3㎡），前端不再次换算。暂不能提供的值返回 null 或不返回，前端显示“—”，明确为零才返回0。

- `regionIds:[]` 表示**未选任何区域，返回空列表及零统计**；不能当作查全部。
- 多区选择取任务并集去重，同一任务不能重复计数。
- statistics 统计所选范围内的全量任务，不受分页、关键词和状态筛选影响；这些筛选仅影响 records/total。
- 建议业务口径：abnormalCount=疑似图斑数；violationArea=负责人确认违法的图斑面积，未确认的疑似图斑不计入；earlyWarnCount=实际完成派发的预警任务数，退回重派不重复计数。stockCount=纳入整改的地块数（含转入和手动创建）；rectifiedCount=审核确认达标的地块数；canceledCount=已销号地块数。后两项分别按达标事实与销号状态统计，不把“待审核”当作达标；若当前审核通过同步销号，两者可相等。具体口径如与后台现有规则不同，请联调前同步。
- 每条列表记录携带真实面 geometry，供地图定位和高亮；前端当前按分页记录显示任务图斑。

### `/task/create`

请求：`{deptId, sceneCode, requestId, resultTypeCode, name, description, priority, regionIds, geometry, beforeImageId?, afterImageId?}`。

- 人工判读、人工圈定；本期不调用 AI 自动识别。
- **一个图斑创建一个任务**；name/description 必填，priority 沿用现有业务任务约定：0低/1中/2高。
- 预警圈图 resultTypeCode=`SUSPECT_PATCH`；整改圈图及自动转入任务 resultTypeCode=`RECTIFY_PROGRESS`。后端校验成果类型与场景匹配。`RECTIFY_POINT` 为整改核查的点成果，不替代任务面范围，也不等同于照片凭证 kind。
- 后端校验图斑真实几何完整位于有效监管范围内；越界、无效面、无权限影像应明确报错。前端本期按“完整位于一个所选监管片区”预校验，后端仍需独立精确校验。
- beforeImageId/afterImageId 为已登记且有权限的影像服务 ID，可选；前端复用地图服务目录人工对比两期影像。
- 新任务初始进入 DISPATCH，由当前场景配置的负责人处理；缺少负责人配置时明确报错，不能生成无办理人的任务。
- requestId 幂等，防重复点击/重试重复创建。
- data 返回完整 LandTask。

### `/task/detail`

请求：`{deptId, taskId}`，data 为完整 LandTask。历史完成任务可读取，但不可修改。

LandTask 必需字段（具体 TypeScript 契约见 `src/types/land-supervision.ts`）：

```json
{
  "id": "123", "taskNo": "ZRZY-...", "name": "疑似新增硬化地面",
  "sceneCode": "ILLEGAL_LAND_EARLY_WARN", "regionIds": ["region-1"],
  "geometry": {"type":"Polygon","coordinates":[]},
  "description": "人工判读说明", "priority": 2, "areaSqm": 1200,
  "stage": "DISPATCH", "version": 1, "createTime": "2026-11-21T10:00:00+08:00",
  "currentHandlerName": "负责人姓名",
  "currentNode": {"id":"node-1","key":"DISPATCH","assigneeName":"负责人姓名","canOperate":true},
  "history": []
}
```

- 可选字段：deadline、conclusion（YES/NO）、sourceTaskId、linkedTaskId、beforeImageId、afterImageId、resultTypeCode。
- 若返回独立成果，使用 `results:[{id,code,geometry}]`：SUSPECT_PATCH/RECTIFY_PROGRESS 对应 Polygon/MultiPolygon，RECTIFY_POINT 对应 Point；坐标为 WGS84。任务 geometry 始终保留真实面。前端已预留类型契约，核查点的采集与独立成果展示需随对应业务接口联调，不把图片上传强行转换为点成果。
- `currentNode.canOperate` 由后端按当前用户实际节点办理权计算；可见任务≠有操作权，ADMIN 也不由前端自动放行。已完成/已转整改不返回可操作节点。
- history 保留每一次提交/退回：`{id,nodeKey,action,actorId,actorName,time,description,conclusion?,evidence:[]}`。创建记录 nodeKey=ACCEPTANCE/action=CREATE。
- 使用明确的带时区时间；deadline 接收前端 datetime-local 的当地时间，请按 Asia/Shanghai 解析并返回带时区值。

## 4. 工作流操作

### `/task/action`

请求：`{deptId, taskId, nodeInstId, expectedVersion, requestId, action, description, assigneeId?, deadline?, conclusion?, evidenceIds?:[]}`；data 返回更新后的完整 LandTask。

动作：

- `DISPATCH`：负责人派发，assigneeId 必填；整改场景 deadline 必填且必须晚于当前时间。
- `SUBMIT_INSPECTION`：核查人提交结论，conclusion=YES/NO、description 必填，流转科室负责人 CONFIRM。
- `RETURN_INSPECTION`：负责人退回核查，原因必填，保留上次办理人和历次材料。
- `CONFIRM_CLOSE`：仅核查结论 NO 时允许，由负责人结案。
- `CONFIRM_TRANSFER`：仅核查结论 YES 时允许；原任务置 TRANSFERRED、生成整改任务 DISPATCH，同时写 sourceTaskId/linkedTaskId；关联任务继承原图斑、监管区、问题信息及可查阅的核查证据。
- `SUBMIT_RECTIFICATION`：整改说明必填，PHOTO/AFTER_IMAGE/UAV_PHOTO 三类图片凭证至少一种，允许多张；提交后进入 REVIEW。
- `RETURN_RECTIFICATION`：审核负责人填写原因，退回原整改人，保持期限和历史。
- `APPROVE_CLOSE`：审核负责人通过并销号，结案后只读。

所有动作后端重新校验身份、节点状态、材料及版本，记录真实操作人/时间，不采信前端传入的姓名。自动转整改必须事务化，并以来源预警任务建立唯一约束，重复请求、并发、网络重试均不能创建第二条整改任务；下游负责人缺失时整笔失败、原预警任务保持待确认。version 冲突返回明确业务错误，不覆盖他人提交。

### `/evidence/upload`

multipart/form-data：`deptId, taskId, nodeInstId, kind(PHOTO/AFTER_IMAGE/UAV_PHOTO), file, mediaId?`。

data：`{id,name,url,kind,mediaId?}`，url 为可供 img 读取的受控签名预览地址；后续 detail/history 重新返回可用地址，不能依赖本机 blob URL。单张最大10MB；支持浏览器可预览的JPG/PNG/WebP等，校验真实内容及任务节点权限；上传未提交的材料暂存，随 action.evidenceIds 正式绑定，无引用材料定期清理。

无人机照片**复用已有** `/api/v1/uav/media/match` 与 `/match/raw`：前端提取→预览→用户确认→按 UAV_PHOTO 上传并附 mediaId；无需起飞，也无需新建匹配接口。

## 5. 联调验收

1. 自规局可见两个专题，农业农村局不可访问；提供有配置负责人的测试账号和测试任务。
2. 监管边界返回完整面；越界圈图不能下发；一图斑一任务。
3. “不是问题”必须经过负责人确认才能结案；“是问题”经负责人确认后仅生成一条整改任务，双向可追溯。
4. 整改派发缺期限、提交缺说明或缺凭证均被后端拒绝；退回后可重新提交；历史节点及已完成任务只读。
5. 任务中心及我的待办显示正确场景、当前处理人、状态及任务范围。

当前本地开发环境已开启 `VITE_LAND_SUPERVISION_ENABLED=true` 并接入文首列出的真实通用接口；生产环境待后端部署及流程验收后再开启。未开启的环境仍提供显式“打开交互演示”按钮；接口失败只显示真实错误，不自动回退模拟数据。
