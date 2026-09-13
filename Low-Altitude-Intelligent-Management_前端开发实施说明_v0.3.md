# Low-Altitude-Intelligent-Management
# 前端开发实施说明 v0.3

> 仓库：`CholeUnique/Low-Altitude-Intelligent-Management`  
> 分支：`main`  
> 文档版本：v0.3  
> 适用阶段：前端框架整理、正式登录联调、低空大师 API 适配、后端接口对齐  
> 重要说明：本版以最新业务架构为准，**低空巡查发现模块仅包含“航线规划、实时巡航”两个节点；“变化监测”不再作为独立一级流程页，而归入“图斑识别”业务能力内部。**

---

## 1. 本版正式架构

```text
低空智慧服务运行中枢
│
├─ 低空巡查发现模块
│   ├─ 航线规划
│   └─ 实时巡航
│
├─ 低空治理任务总览
│   ├─ 查看任务详情
│   └─ 进入领域工作台
│       │
│       ├─ 低空巡查发现模块
│       │   ├─ 1 航线规划
│       │   └─ 2 实时巡航
│       │
│       └─ 治理模块
│           ├─ 3 图斑识别
│           ├─ 4 任务下发
│           └─ 5 复核归档
│
└─ 算法能力仓库
```

工作台 Header **不允许全局写死为同一套节点**。正式规则是：

```text
低空巡查发现模块              治理模块
航线规划 → 实时巡航      |   [按业务场景配置的治理节点...]
```

其中：

- `低空巡查发现模块` 当前作为平台公共能力，固定为 `航线规划 → 实时巡航`；
- `治理模块` 必须按 `sceneId` / 业务场景配置；
- 林业执法监管当前为：

```text
图斑识别 → 任务下发 → 复核归档
```

- 其他场景未来可以新增、减少或替换治理节点，例如某些场景可能增加 `预警研判 / 现场举证 / 审核确认 / 整改跟踪` 等节点；
- Header 只负责渲染当前场景配置，不负责写死业务流程。

中间使用视觉分隔线区分两个模块。

---

## 2. 与上一版 v0.1 的核心差异

本版必须覆盖上一版，不允许继续实现以下旧设计：

```text
航线规划 → 实时巡航 → 变化监测
```

新的正式定义是：

```text
低空巡查发现模块：
航线规划 → 实时巡航
```

“变化监测”能力调整为：

```text
图斑识别
├─ AI 自动识别
├─ 多期影像变化检测
├─ 2 / 3 / 4 / 5 期影像对比
├─ 人工上传变化图片
├─ 变化区域生成
├─ 人工研判
└─ 问题图斑入库
```

因此：

- 不新增 `/patrol/change`；
- 不新增独立 `PatrolChangeView.vue`；
- 不新增独立一级 `change-monitoring` 工作台节点；
- 多期变化分析直接归入“图斑识别”页面或其内部组件。

---

## 3. 当前仓库审查结论

当前仓库已经具备：

```text
Vue 3
TypeScript
Pinia
Vue Router
Axios
Element Plus
Leaflet
ECharts
Vite
SCSS
本地 Mock
```

当前主要页面：

```text
src/views/
├─ LoginView.vue
├─ DashboardView.vue
├─ TaskListsView.vue
├─ TaskDetailView.vue
├─ WorkspaceView.vue
└─ AlgorithmRepositoryView.vue
```

当前工作台组件：

```text
src/workspace-components/
├─ route-flight-plan/
│  ├─ RouteFlightPlanPanel.vue
│  ├─ RouteWorkspaceMap.vue
│  └─ NewRouteDialog.vue
├─ realtime-cruise/
│  └─ RealtimeCruisePanel.vue
├─ spot-identification/
├─ task-dispatch/
├─ review-archive/
└─ shared/
```

当前 `forestry.ts` 本身已经是 5 节点：

```text
route-flight-plan
realtime-cruise
spot-identification
task-dispatch
review-archive
```

这个节点数量与最新业务设计一致，不要再增加“变化监测”节点。

---

## 4. 当前需要优先修复的技术问题

### P0-1 路由重复定义

当前 `src/router/index.ts` 中存在重复的：

```text
/dashboard
/taskLists
/workspace
```

Cursor 必须优先清理。

建议最终保留：

```text
/login

/dashboard
/dashboard/:sceneId

/tasks
/tasks/:taskId

/patrol/route-plan
/patrol/live

/workspace/:sceneId/:taskId?

/algorithms
```

---

### P0-2 正式登录仍未接入

当前 `LoginView.vue` 还是 Mock 身份选择：

```text
所属单位
职级身份
进入系统
```

并生成：

```text
mock-token-时间戳
```

正式环境必须改为真实账号密码登录。

---

### P0-3 实时巡航仍为空壳

当前：

```text
src/workspace-components/realtime-cruise/RealtimeCruisePanel.vue
```

只有壳组件。

需要实现真实 UI 和 API 绑定。

---

### P0-4 公共巡查能力仍和领域 Workspace 绑定

`航线规划` 和 `实时巡航` 是所有业务领域共用的低空作业能力。

不能仅作为林业工作台内部组件存在。

必须有独立公共入口。

---

## 5. 目标页面职责

### 5.1 低空智慧服务运行中枢

路由：

```text
/dashboard
```

职责：

```text
全局设备态势
全部/权限内任务统计
任务列表
无人机直播摘要
异常告警
算法能力摘要
多场景完成度
已办结案例
地图总览
```

还必须增加三个明确入口：

```text
低空巡查发现模块
低空治理任务总览
算法能力仓库
```

跳转：

```text
低空巡查发现模块 → /patrol/route-plan
低空治理任务总览 → /tasks
算法能力仓库 → /algorithms
```

Dashboard 中无人机直播卡片：

```text
“全部直播” → /patrol/live
```

---

### 5.2 低空巡查发现模块：航线规划

路由：

```text
/patrol/route-plan
```

页面标题建议：

```text
低空巡查发现模块
```

Header 节点：

```text
航线规划 → 实时巡航
```

当前节点：

```text
航线规划
```

职责：

```text
航线列表
航线分组
航线创建
KML 导入
历史航线复用
航点编辑
自动规划
航线参数
当前航线高亮
其他航线弱化
航线校验
飞行计划日历
下发飞行计划
```

现有：

```text
RouteFlightPlanPanel.vue
RouteWorkspaceMap.vue
NewRouteDialog.vue
```

继续复用，不推倒重写。

---

### 5.3 低空巡查发现模块：实时巡航

路由：

```text
/patrol/live
```

Header：

```text
航线规划 → 实时巡航
```

当前节点：

```text
实时巡航
```

职责：

```text
当前飞行任务
巡航区域地图
当前无人机位置
已飞航段
未飞航段
实时飞行轨迹
飞行高度
速度
航向
电池
GPS
遥控链路
图传链路
直播画面
采集影像
飞行事件记录
待执行飞行计划
历史飞行记录
```

---

### 5.4 低空治理任务总览

路由：

```text
/tasks
```

职责：

```text
全部权限范围内治理任务
搜索
所属场景筛选
任务状态筛选
时间筛选
责任单位筛选
优先级筛选

新增任务
删除任务（权限控制）
批量操作（权限控制）

每条任务：
任务名称
所属场景/领域
当前状态
创建单位
负责人
创建时间
任务范围
治理进度
查看
进入工作台
```

注意：

> 这里管理的是“治理任务”，不是单纯的飞行任务。

---

### 5.5 治理任务详情

路由：

```text
/tasks/:taskId
```

职责：

```text
任务基本信息
线索来源
责任单位
负责人
任务范围
进度
关联成果
历史流程
任务统计
查看来源巡查
进入工作台
```

线索来源要支持：

```text
无人机巡查发现
卫片下发图斑
森林督查图斑
林地占用项目核查
人工发现
其他系统推送
```

---

### 5.6 领域工作台

路由：

```text
/workspace/:sceneId/:taskId?
```

林业工作台 Header：

```text
低空巡查发现模块              治理模块
航线规划 → 实时巡航      |   图斑识别 → 任务下发 → 复核归档
```

其中：

```text
1 航线规划
2 实时巡航
```

是平台公共巡查能力入口。

```text
3 图斑识别
4 任务下发
5 复核归档
```

是林业领域内部治理流程。

---

#
# 5.7 不同场景工作台必须配置驱动

当前 `forestry.ts` 只能代表：

```text
林业执法监管
```

不能把它当作所有场景模板。

建议新增统一注册表：

```text
src/workspace/config/
├─ forestry.ts
├─ illegal-land-warning.ts
├─ non-grain-monitoring.ts
├─ existing-land-rectification.ts
└─ registry.ts
```

每个场景单独声明：

```ts
export interface SceneWorkspaceConfig {
  sceneId: string
  name: string

  modules: Array<{
    key: 'discovery' | 'governance'
    name: string
  }>

  nodes: WorkspaceNodeConfig[]
}
```

公共巡查节点可以抽成复用常量：

```ts
export const COMMON_DISCOVERY_NODES: WorkspaceNodeConfig[] = [
  {
    key: 'route-flight-plan',
    name: '航线规划',
    shortName: '航线规划',
    order: 1,
    module: 'discovery',
    externalRoute: '/patrol/route-plan',
  },
  {
    key: 'realtime-cruise',
    name: '实时巡航',
    shortName: '实时巡航',
    order: 2,
    module: 'discovery',
    externalRoute: '/patrol/live',
  },
]
```

林业场景：

```ts
export const forestryConfig: SceneWorkspaceConfig = {
  sceneId: 'forestry-enforcement',
  name: '林业执法监管',
  modules: [
    { key: 'discovery', name: '低空巡查发现模块' },
    { key: 'governance', name: '治理模块' },
  ],
  nodes: [
    ...COMMON_DISCOVERY_NODES,
    {
      key: 'spot-identification',
      name: '图斑识别',
      shortName: '图斑识别',
      order: 3,
      module: 'governance',
      component: 'SpotIdentification',
    },
    {
      key: 'task-dispatch',
      name: '任务下发',
      shortName: '任务下发',
      order: 4,
      module: 'governance',
      component: 'TaskDispatch',
    },
    {
      key: 'review-archive',
      name: '复核归档',
      shortName: '复核归档',
      order: 5,
      module: 'governance',
      component: 'ReviewArchive',
    },
  ],
}
```

未来其他场景可配置成：

```text
航线规划 → 实时巡航
            |
            └── 治理模块：A → B → C → D
```

或者：

```text
航线规划 → 实时巡航
            |
            └── 治理模块：A → B
```

因此：

> `WorkspaceView.vue` 必须通过 `sceneId` 从 registry 读取配置并动态渲染 Header、节点序号、组件与跳转逻辑，不能直接 import 并写死 `forestryConfig`。

建议：

```ts
const workspaceConfig = computed(() =>
  getWorkspaceConfig(String(route.params.sceneId)),
)
```

如果某场景尚未实现治理组件：

```text
显示“该场景工作台正在建设”
```

不要自动套用林业节点。

---

# 6. Workspace 节点点击逻辑

建议 `WorkspaceNodeConfig` 增加：

```ts
externalRoute?: string
```

林业配置：

```ts
{
  key: 'route-flight-plan',
  name: '航线规划',
  order: 1,
  module: 'discovery',
  externalRoute: '/patrol/route-plan',
}

{
  key: 'realtime-cruise',
  name: '实时巡航',
  order: 2,
  module: 'discovery',
  externalRoute: '/patrol/live',
}

{
  key: 'spot-identification',
  name: '图斑识别',
  order: 3,
  module: 'governance',
  component: 'SpotIdentification',
}

{
  key: 'task-dispatch',
  name: '任务下发',
  order: 4,
  module: 'governance',
  component: 'TaskDispatch',
}

{
  key: 'review-archive',
  name: '复核归档',
  order: 5,
  module: 'governance',
  component: 'ReviewArchive',
}
```

点击：

```ts
function selectNode(node: WorkspaceNodeConfig) {
  if (node.externalRoute) {
    router.push({
      path: node.externalRoute,
      query: {
        from: 'workspace',
        sceneId: route.params.sceneId,
        taskId: route.params.taskId,
      },
    })
    return
  }

  router.replace({
    query: {
      ...route.query,
      node: node.key,
    },
  })
}
```

---

## 7. 公共页面“返回”逻辑

航线规划和实时巡航可能从：

```text
运行中枢
治理任务详情
林业工作台
直播入口
历史飞行记录
```

进入。

所以左上角统一写：

```text
返回
```

不写死“返回运行中枢”。

建议：

```ts
function goBack() {
  if (window.history.length > 1) {
    router.back()
  } else {
    router.push('/dashboard')
  }
}
```

---

## 8. 图斑识别页的正式职责

节点名称保持：

```text
图斑识别
```

不要改成：

```text
林业问题图斑总览
```

但内容仅展示当前领域，例如林业工作台只展示林业图斑。

页面结构：

```text
左：
问题图斑列表
缩略图
筛选
状态
来源

中：
地图
图斑分布
选中图斑高亮

右：
图斑详情
来源
置信度
风险等级
历史时间轴
```

图斑识别内部包含：

```text
AI 自动识别
多期变化检测
多期影像对比
人工变化图片上传
人工研判
```

不再有独立“变化监测”一级页面。

---

## 9. “人工发现变化图片”入口

仍必须保留。

建议位置：

```text
图斑识别页
→ 多期影像 / 变化分析区域
→ 上传人工发现变化图片
```

接口建议：

```text
POST /api/v1/problem-spots/manual-clues
Content-Type: multipart/form-data
```

建议提交：

```text
sceneId
taskId
image
capturedAt?
location?
description?
```

后端返回：

```text
clueId
imageUrl
thumbnailUrl
status
```

---

# 10. 低空大师 API 接入边界

本轮只映射三类供应商能力：

```text
航线管理
飞行管理
直播管理
```

对应前端：

| 低空大师能力 | 前端模块 |
|---|---|
| 航线管理 | 航线规划 |
| 飞行管理 | 航线规划 + 实时巡航 |
| 直播管理 | 实时巡航 |

多期变化、问题图斑、人工研判等：

```text
属于本系统业务/算法能力
```

不要塞进低空大师 Adapter。

---

# 11. API Key 安全原则

低空大师 API Key 只能保存到后端：

```text
环境变量
配置中心
Secret Manager
```

前端禁止：

```text
VITE_DAS_FLY_API_KEY
localStorage
sessionStorage
代码常量
Git 仓库
```

正式链路：

```text
前端
 ↓
本系统后端
 ↓
低空大师 Adapter
 ↓
低空大师 API
```

---

# 12. 前端 API 目录建议

新增：

```text
src/api/
├─ auth.ts
├─ user.ts
├─ task.ts
├─ route.ts
├─ flight.ts
├─ live.ts
├─ map.ts
├─ spot.ts
├─ inspection.ts
└─ review.ts
```

Adapter：

```text
src/adapters/
├─ dasFly.ts
├─ videoAdapter.ts
├─ realtimeAdapter.ts
└─ mapAdapter.ts
```

Types：

```text
src/types/
├─ auth.ts
├─ permission.ts
├─ patrol.ts
├─ map.ts
├─ task.ts
└─ spot.ts
```

---

# 13. 航线管理前端 API

```ts
getRoutes(params)
getRouteDetail(id)
createRoute(payload)
updateRoute(id, payload)
deleteRoute(id)

importRoute(file)
copyRoute(id)
validateRoute(id)
```

建议后端契约：

```text
GET    /api/v1/patrol/routes
POST   /api/v1/patrol/routes
GET    /api/v1/patrol/routes/{id}
PUT    /api/v1/patrol/routes/{id}
DELETE /api/v1/patrol/routes/{id}

POST   /api/v1/patrol/routes/import
POST   /api/v1/patrol/routes/{id}/copy
POST   /api/v1/patrol/routes/{id}/validate
```

这些 URL 是建议的本系统后端契约，不是低空大师真实 URL。

---

# 14. 飞行计划与飞行管理

飞行计划：

```text
GET    /api/v1/patrol/flight-plans
POST   /api/v1/patrol/flight-plans
GET    /api/v1/patrol/flight-plans/{id}
PUT    /api/v1/patrol/flight-plans/{id}
DELETE /api/v1/patrol/flight-plans/{id}
POST   /api/v1/patrol/flight-plans/{id}/execute
```

飞行记录：

```text
GET /api/v1/patrol/flights
GET /api/v1/patrol/flights/{id}
GET /api/v1/patrol/flights/{id}/media
```

如果后端与低空大师允许飞行控制：

```text
POST /api/v1/patrol/flights/{id}/actions
```

动作候选：

```text
START
PAUSE
RESUME
RETURN_HOME
STOP
```

最终必须以后端确认的供应商能力为准。

---

# 15. 直播管理

建议：

```text
GET /api/v1/patrol/live-streams
GET /api/v1/patrol/live-streams/{id}/play-info
```

前端统一模型：

```ts
export interface LiveStream {
  id: string
  aircraftId: string
  aircraftName?: string
  flightId?: string

  status:
    | 'ONLINE'
    | 'OFFLINE'
    | 'STARTING'
    | 'ERROR'

  protocol:
    | 'HLS'
    | 'FLV'
    | 'WEBRTC'
    | 'OTHER'

  playUrl: string
  expiresAt?: string
}
```

`playUrl` 必须是：

```text
后端返回的临时播放地址
```

前端不能自己拼供应商签名。

---

# 16. 实时遥测

建议：

```text
REST 首次快照
+
WebSocket 增量更新
```

事件：

```text
drone.telemetry
drone.online
drone.offline

flight.started
flight.progress
flight.paused
flight.completed
flight.failed

media.captured

live.started
live.stopped
```

统一 Envelope：

```ts
export interface RealtimeEvent<T> {
  eventId: string
  type: string
  timestamp: string

  organizationId?: string
  taskId?: string
  flightId?: string
  aircraftId?: string

  payload: T
}
```

---

# 17. 当前正式登录接口

从现有后端 Swagger 已知：

```text
POST /api/v1/user/login/public-key
获取登录加密公钥（一次性）

POST /api/v1/user/login
登录（密码登录，支持 RSA 加密传输）

POST /api/v1/user/info
查询本人信息

POST /api/v1/user/logout
退出登录
```

建议流程：

```text
账号密码
 ↓
获取一次性 RSA 公钥
 ↓
加密密码
 ↓
登录
 ↓
获取 Token
 ↓
/user/info
 ↓
加载单位/部门/角色/权限/数据范围
 ↓
Dashboard
```

---

# 18. RSA 不能猜

目前没有明确：

```text
RSA/PKCS1
RSA/OAEP
PEM
Base64
keyId
expireAt
```

因此 Cursor 现在只能：

```text
预留 authCrypto.ts
```

不能随便安装 JSEncrypt 并声称联调完成。

---

# 19. 用户 Store 正式结构

当前 Store 只有：

```text
organizationId
roleId
```

正式建议：

```ts
export interface CurrentUser {
  id: string
  username: string
  name: string

  organization: {
    id: string
    name: string
  }

  department?: {
    id: string
    name: string
  }

  roles: Array<{
    code: string
    name: string
    level?: number | string
  }>

  permissions: string[]

  dataScope: DataScope
}
```

---

# 20. 两个单位与权限预留

当前明确存在两个单位：

```text
自然资源和规划局
农业农村局
```

但：

```text
各层级权限尚未最终决定
```

因此前端不能写死：

```text
管理员一定能...
员工一定不能...
```

只能提供：

```text
permission code
+
dataScope
```

---

# 21. 操作权限与数据权限分离

操作权限：

```text
task:view
task:create
task:update
task:delete

route:view
route:create
route:update
route:delete
route:dispatch

flight:view
flight:plan:create
flight:execute

live:view

spot:view
spot:judge

inspection:dispatch

case:review
case:archive
```

数据权限：

```ts
export type DataScopeType =
  | 'ALL'
  | 'ORGANIZATION'
  | 'DEPARTMENT'
  | 'SELF'
  | 'CUSTOM'
```

建议：

```ts
export interface DataScope {
  type: DataScopeType

  organizationIds?: string[]
  departmentIds?: string[]
  sceneIds?: string[]
  regionCodes?: string[]
}
```

前端按钮可以根据 permission 隐藏。

真正数据范围必须由后端过滤。

---

# 22. 地图数据统一格式

前端当前 Leaflet 代码已经以：

```text
[longitude, latitude]
```

作为业务坐标，并在 Leaflet 层转为：

```text
[latitude, longitude]
```

因此后端统一返回：

```text
GeoJSON
```

坐标顺序：

```text
[经度, 纬度]
```

---

# 23. 推荐后端地图 Envelope

```json
{
  "coordinateSystem": "EPSG:4326",
  "bbox": [
    119.82,
    32.35,
    120.12,
    32.59
  ],
  "data": {
    "type": "FeatureCollection",
    "features": []
  }
}
```

---

# 24. 航线 GeoJSON

```json
{
  "type": "Feature",
  "id": "ROUTE-001",
  "geometry": {
    "type": "LineString",
    "coordinates": [
      [119.88, 32.48],
      [119.91, 32.50],
      [119.96, 32.49]
    ]
  },
  "properties": {
    "routeId": "ROUTE-001",
    "status": "RUNNING",
    "isCurrent": true
  }
}
```

---

# 25. 图斑 GeoJSON

```json
{
  "type": "Feature",
  "id": "LYTB20250521001",
  "geometry": {
    "type": "Polygon",
    "coordinates": []
  },
  "properties": {
    "problemType": "DEFORESTATION",
    "problemTypeName": "疑似毁林开垦",
    "status": "PENDING_REVIEW",
    "confidence": 0.87,
    "riskLevel": "HIGH"
  }
}
```

---

# 26. 推荐地图上下文接口

```text
GET /api/v1/map/context
```

参数：

```text
sceneId?
taskId?
flightId?
```

返回：

```text
center
zoom
taskArea
routes
waypoints
spots
drones
coordinateSystem
```

地图首次进入时尽量避免前端并发十几个请求。

---

# 27. 文件与影像

业务接口不要 Base64。

建议：

```json
{
  "id": "MEDIA-001",
  "thumbnailUrl": "...",
  "previewUrl": "...",
  "downloadUrl": "...",
  "capturedAt": "...",
  "location": {
    "type": "Point",
    "coordinates": [119.93, 32.47]
  }
}
```

---

# 28. Mock 与真实 API 必须共存

保留：

```text
VITE_USE_MOCK=true
```

API：

```ts
export async function getRoutes() {
  if (useMock) {
    return getMockRoutes()
  }

  return getBackendRoutes()
}
```

不要为了联调把 Mock 全删掉。

---

# 29. DTO 与前端领域模型隔离

后端 DTO 无论叫什么：

```text
routeId
flyHeight
speedVal
```

组件内部都统一使用：

```text
PatrolRoute
FlightPlan
FlightExecution
LiveStream
ProblemSpot
```

转换放 Adapter。

供应商接口变化时：

```text
只改 Adapter
```

而不是改所有 Vue 页面。

---

# 30. Cursor 实施顺序

## 第一阶段：整理架构

- [ ] 清理重复 Router
- [ ] 新建 `/patrol/route-plan`
- [ ] 新建 `/patrol/live`
- [ ] 提取公共 Patrol Layout
- [ ] 航线规划页面复用现有 RouteFlightPlanPanel
- [ ] 完成实时巡航页面
- [ ] Dashboard 增加“低空巡查发现模块”入口
- [ ] Workspace Header 改为按 sceneId 配置驱动
- [ ] 林业场景当前保持 5 节点
- [ ] 林业 1-2 跳公共页面
- [ ] 林业 3-5 保持领域工作台
- [ ] 其他场景允许拥有不同数量、不同名称的治理节点
- [ ] 不创建独立变化监测路由

## 第二阶段：图斑识别完善

- [ ] 图斑列表
- [ ] 地图
- [ ] 图斑详情
- [ ] 历史时间轴
- [ ] 多期影像对比
- [ ] 变化检测
- [ ] 人工上传变化图片
- [ ] 人工研判

## 第三阶段：正式登录

- [ ] auth.ts
- [ ] user.ts
- [ ] RSA 占位
- [ ] `/user/login/public-key`
- [ ] `/user/login`
- [ ] `/user/info`
- [ ] `/user/logout`
- [ ] Vite proxy
- [ ] 401 / 403
- [ ] Mock Identity 开关

## 第四阶段：低空大师后端适配

- [ ] 航线管理
- [ ] 飞行计划
- [ ] 飞行记录
- [ ] 直播管理
- [ ] 临时播放地址
- [ ] 供应商 ID 映射

## 第五阶段：实时通信

- [ ] WebSocket
- [ ] 遥测
- [ ] 飞行进度
- [ ] 图片回传
- [ ] 直播状态
- [ ] 自动重连
- [ ] 组件销毁取消订阅

---


# 31. 后端 Swagger 是接口真源

当前所有正式后端 API 均以以下内网 Swagger 为准：

```text
http://223.2.38.27:8080/swagger-ui/index.html#/
```

该地址属于内网环境，本对话环境无法保证能够访问；但是用户运行 Cursor 的开发电脑可以访问。

因此 Cursor 在开始正式联调前必须先执行：

```text
1. 在开发机访问 Swagger UI；
2. 确认页面可打开；
3. 找到 Swagger UI 实际加载的 OpenAPI JSON 地址；
4. 读取完整 OpenAPI schema；
5. 以真实 schema 为准生成/整理前端 API；
6. 再测试只读型接口是否可正常调用。
```

### 31.1 不要把本文中的建议 URL 当成真实 URL

本文后续出现的：

```text
/api/v1/patrol/routes
/api/v1/patrol/flights
/api/v1/patrol/live-streams
```

等仅表示“前端需要的能力”，不是后端已经存在的真实路由。

真实路由以 Swagger 为准。

从用户提供的当前 Swagger 截图中已经能看到真实接口示例：

```text
POST /api/v1/uav/flight-plan/page
POST /api/v1/uav/flight-plan/detail

POST /api/v1/uav/flight-task/trace
POST /api/v1/uav/flight-task/progressing
POST /api/v1/uav/flight-task/page
POST /api/v1/uav/flight-task/media/page
POST /api/v1/uav/flight-task/detail

POST /api/v1/uav/project/page
POST /api/v1/uav/project/options
POST /api/v1/uav/project/detail

POST /api/v1/uav/statistics/overview
POST /api/v1/uav/statistics/media-summary
POST /api/v1/uav/statistics/flight-summary
POST /api/v1/uav/statistics/device-summary
POST /api/v1/uav/statistics/count-by-dept

POST /api/v1/uav/sync/record
POST /api/v1/uav/sync/project
POST /api/v1/uav/sync/flight-task
```

这些真实路由说明：

- 后端已经有无人机项目、飞行计划、飞行任务、轨迹、媒体素材、统计、同步等接口；
- 前端不应再自造一套并行 URL；
- Cursor 应该直接读取 Swagger schema，建立“现有真实接口 → 前端领域模型”的 Adapter。

### 31.2 Cursor 如何找到 OpenAPI JSON

不要假设一定是：

```text
/v3/api-docs
```

Cursor 应：

```text
打开 Swagger UI
→ 查看页面源码 / DevTools Network
→ 找到 swagger-config 或 OpenAPI JSON 请求
→ 获取真实 schema URL
```

若页面配置符合 SpringDoc 常见结构，可以尝试：

```text
http://223.2.38.27:8080/v3/api-docs
http://223.2.38.27:8080/v3/api-docs/swagger-config
```

但只能作为“探测”，不能因为常见就写死。

### 31.3 允许 Cursor 做的接口试调用

优先测试：

```text
登录公钥
本人信息（登录后）
项目分页/详情
飞行计划分页/详情
飞行任务分页/详情
正在执行任务
任务轨迹
媒体素材分页
统计查询
```

这些属于读取/查询类能力。

### 31.4 禁止 Cursor 在“探测接口”阶段直接调用的接口

以下接口可能产生副作用，除非用户明确要求，否则不要主动执行：

```text
同步触发类
新增
修改
删除
启停
下发
执行飞行
飞行控制
归档
批量操作
```

尤其用户截图中的：

```text
/api/v1/uav/sync/*
```

属于“主动触发同步”，不能只为了测试就调用。

### 31.5 Cursor 应产出真实接口映射表

读取 Swagger 成功后，新建：

```text
docs/backend-api-mapping.md
```

至少包含：

| 前端页面 | 前端能力 | Swagger Tag | 真实接口 | 请求 DTO | 响应 DTO | 是否已联调 |
|---|---|---|---|---|---|---|
| 航线规划 | 飞行计划列表 | 无人机-飞行计划 | `/api/v1/uav/flight-plan/page` | 真实 schema | 真实 schema | 待测试 |
| 实时巡航 | 正在执行任务 | 无人机-飞行任务 | `/api/v1/uav/flight-task/progressing` | 真实 schema | 真实 schema | 待测试 |
| 实时巡航 | 飞行轨迹 | 无人机-飞行任务 | `/api/v1/uav/flight-task/trace` | 真实 schema | 真实 schema | 待测试 |
| 实时巡航 | 采集素材 | 无人机-飞行任务 | `/api/v1/uav/flight-task/media/page` | 真实 schema | 真实 schema | 待测试 |

其余接口读取 Swagger 后补齐。

---

# 32. 前端能力清单（需映射到 Swagger 真实接口）

> 本节是能力需求清单，不代表真实 URL。Cursor 必须优先复用 Swagger 已有接口。

## 认证

```text
POST /api/v1/user/login/public-key
POST /api/v1/user/login
POST /api/v1/user/info
POST /api/v1/user/logout
```

## 航线

```text
GET    /api/v1/patrol/routes
POST   /api/v1/patrol/routes
GET    /api/v1/patrol/routes/{id}
PUT    /api/v1/patrol/routes/{id}
DELETE /api/v1/patrol/routes/{id}
POST   /api/v1/patrol/routes/import
POST   /api/v1/patrol/routes/{id}/copy
POST   /api/v1/patrol/routes/{id}/validate
```

## 飞行计划

```text
GET    /api/v1/patrol/flight-plans
POST   /api/v1/patrol/flight-plans
GET    /api/v1/patrol/flight-plans/{id}
PUT    /api/v1/patrol/flight-plans/{id}
DELETE /api/v1/patrol/flight-plans/{id}
POST   /api/v1/patrol/flight-plans/{id}/execute
```

## 飞行记录

```text
GET /api/v1/patrol/flights
GET /api/v1/patrol/flights/{id}
GET /api/v1/patrol/flights/{id}/media
```

## 直播

```text
GET /api/v1/patrol/live-streams
GET /api/v1/patrol/live-streams/{id}/play-info
```

## GIS

```text
GET /api/v1/map/context
GET /api/v1/map/features
```

## 实时

```text
WS /api/v1/realtime
```

---

# 33. 后端联调前必须确认的问题

登录：

```text
RSA 算法
公钥格式
keyId
登录请求字段
Token 字段
Bearer 规则
Token 有效期
Refresh Token
/user/info schema
```

权限：

```text
organizationId
departmentId
roleCode
roleLevel
permission code
dataScope
regionCode
sceneId 范围
```

低空大师：

```text
API Key 位置
签名方式
低空大师 routeId
flightPlanId
flightId
直播协议
播放 URL 有效期
遥测方式
可用飞行控制 action
是否支持 webhook
```

GIS：

```text
无人机坐标系
航线坐标系
图斑坐标系
林班小班坐标系
项目坐标系
是否统一 EPSG:4326
```

---

# 34. Cursor 禁止事项

严禁：

```text
把低空大师 API Key 写进前端
新增 VITE_DAS_FLY_API_KEY
猜低空大师真实 API 路径
猜供应商签名算法
猜 RSA 加密方式
写死管理员/员工权限
前端自己做数据权限安全控制
新增独立“变化监测”流程页
为了接 API 重写现有航线 UI
删除 Mock
把供应商 DTO 直接塞给 Vue 页面
```

---

# 35. 本轮验收标准

- [ ] `npm run build` 通过
- [ ] `npm run type-check` 通过
- [ ] Router 无重复定义
- [ ] `/patrol/route-plan` 可访问
- [ ] `/patrol/live` 可访问
- [ ] 两页 Header 风格一致
- [ ] 公共巡查模块只包含“航线规划、实时巡航”
- [ ] 林业工作台 Header 正确分段
- [ ] Workspace 流程节点按场景配置，不全局写死
- [ ] 林业工作台当前共 5 个节点
- [ ] 林业 1-2 跳公共巡查页
- [ ] 林业 3-5 为治理内部页
- [ ] 其他场景可配置不同治理流程
- [ ] 图斑识别内部支持变化分析
- [ ] 不存在独立 `/patrol/change`
- [ ] Dashboard 三大入口清晰
- [ ] Mock 仍可运行
- [ ] 登录 API 已预留
- [ ] 用户模型支持单位/部门/角色/权限/数据域
- [ ] 前端无低空大师 API Key
- [ ] Cursor 已尝试从内网 Swagger 读取真实 OpenAPI schema
- [ ] 已输出真实接口映射表或明确记录无法访问原因
- [ ] GIS 数据支持 GeoJSON

---

## 36. 最终开发原则

```text
运行中枢负责“总览与入口”
低空巡查发现模块负责“怎么飞、飞到哪、采到什么”
治理任务总览负责“发现问题后形成的治理任务”
领域工作台负责“图斑识别 → 任务下发 → 复核归档”
算法能力仓库负责“管理可供业务调用的算法能力”
```

开发顺序统一遵循：

```text
先理顺页面边界
→ 再做 Mock
→ 再接正式登录
→ 再接本系统后端
→ 最后由后端适配低空大师
```
