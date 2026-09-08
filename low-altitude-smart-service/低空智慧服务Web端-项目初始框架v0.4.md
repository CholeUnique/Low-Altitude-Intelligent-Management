# 低空智慧服务 Web 端系统 — 项目初始框架

> 版本：v0.4  
> 创建日期：2026-09-08  
> 状态：前端框架搭建阶段，后端接口待正式交付  
> 当前目标：先完成可运行的前端项目骨架、页面布局、领域工作台与 Mock 数据体系；所有真实业务接口、实时通信、第三方平台接入均预留适配层，不在本阶段绑定具体后端实现。

---

## 一、项目概述

### 1.1 项目定位

面向正式政务场景的低空智慧服务 Web 端系统。

系统以无人机巡查、空间数据分析、问题图斑识别、核查任务下发和复核归档为核心能力，服务于林业、自然资源等领域的低空巡查与执法监管业务。

当前阶段优先建设：

- 可复用的前端基础框架；
- 林业领域监管工作台；
- 领域流程节点配置机制；
- 地图、视频、图斑、任务、档案等 UI 组件框架；
- Mock 数据与接口适配层；
- 为后端 Swagger/OpenAPI、低空大师开放组件、实时通信等后续接入预留稳定边界。

### 1.2 当前优先落地领域

首期领域：**林业执法监管**

核心应用场景：

- 无人机空中巡查；
- 非法侵占林地、毁林开垦、违章搭建等问题发现；
- 卫片、森林督查图斑复核取证；
- 林地占用项目核查；
- 核查任务下发；
- 整改结果复核；
- 案件归档销号。

### 1.3 目标用户

正式政务系统用户，包括：

- 系统管理员；
- 林业业务管理员；
- 业务审核人员；
- 巡查任务管理人员；
- 执法核查人员；
- 复核归档人员；
- 只读查看人员。

> 正式系统不采用“随意切换用户身份”的交互。原 `UserSwitchModal` 取消，统一使用真实登录态、当前用户信息和权限控制。

### 1.4 核心能力

- 无人机任务全生命周期展示；
- 地理底图与航线规划；
- 无人机巡航与影像采集；
- 多期影像变化监测；
- 问题图斑识别与人工研判；
- 核查任务下发；
- 外业核查/整改结果接收；
- 复核与归档；
- 二维地图可视化；
- 后续可扩展三维场景；
- 实时视频与无人机状态展示；
- 流程节点与业务状态可视化；
- 多领域配置驱动；
- 角色与权限控制；
- 操作审计与档案留痕；
- 第三方低空平台嵌入与适配。

---

## 二、林业业务流程设计

### 2.1 前端显示的 6 个工作台节点

1. 地理底图与航线规划
2. 无人机巡航与影像采集
3. 多期影像变化监测
4. 问题图斑识别
5. 核查任务下发
6. 复核与归档

```ts
type ForestryNodeKey =
  | 'route-planning'
  | 'cruise-capture'
  | 'change-detection'
  | 'spot-identification'
  | 'task-dispatch'
  | 'review-archive'
```

### 2.2 页面节点与业务状态分离

虽然前端不再单独建设“现场核查与整改”页面，但后台业务仍然必须存在现场核查与整改状态。

```text
页面节点 ≠ 业务状态
```

建议业务状态至少覆盖：

```text
DISCOVERED
→ AI_IDENTIFIED
→ PENDING_JUDGEMENT
→ CONFIRMED
→ PENDING_DISPATCH
→ DISPATCHED
→ FIELD_CHECKING
→ FIELD_CONFIRMED
→ RECTIFYING
→ RECTIFIED
→ PENDING_REVIEW
→ REVIEW_PASSED
→ ARCHIVED
```

### 2.3 核心业务对象

| 对象 | 含义 |
|---|---|
| PatrolTask | 一次巡查总任务 |
| FlightRoute | 航线 |
| FlightTask | 一次实际飞行任务 |
| Imagery | 某一期卫星/无人机影像 |
| ChangeJob | 多期变化检测任务 |
| ChangePolygon | 变化图斑 |
| ProblemSpot | 问题图斑 |
| InspectionTask | 核查任务 |
| FieldResult | 外业核查结果 |
| RectificationResult | 整改结果 |
| ReviewCase | 待复核案件 |
| EvidenceFile | 证据文件 |
| WorkflowEvent | 流程历史事件 |
| AuditEvent | 系统审计记录 |

---

## 三、技术栈选型

| 层级 | 技术 | 说明 |
|---|---|---|
| 前端框架 | Vue 3 + Composition API | `<script setup>` |
| 构建工具 | Vite 5 | 开发构建 |
| 语言 | TypeScript | 类型安全 |
| UI 组件库 | Element Plus | 按需引入 |
| 路由 | Vue Router 4 | 动态路由 + 权限守卫 |
| 状态管理 | Pinia | 用户态、工作台态、地图态、实时通信态 |
| HTTP | Axios | 统一请求实例与适配层 |
| API 类型 | 手写类型 + 预留 OpenAPI 生成 | 后端 Swagger 正式交付后接入 |
| 地图 | 天地图 + Map Adapter | 当前先做二维；三维后续按需接 Cesium |
| 视频 | Video Adapter | 协议待后端/厂商确认 |
| 实时通信 | WebSocket Adapter | 协议待确认 |
| 图表 | ECharts 5 | 统计图表 |
| 样式 | SCSS + CSS Variables | 双主题 |
| Mock | 本地 Mock/JSON | 前端并行开发 |
| 第三方嵌入 | iframe + Integration Adapter | 低空大师开放组件 |
| 代码规范 | ESLint + Prettier | 统一格式 |

---

## 四、推荐目录结构

```text
low-altitude-smart-service/
├── public/
├── src/
│   ├── api/
│   │   ├── client.ts
│   │   ├── auth.ts
│   │   ├── dashboard.ts
│   │   ├── task.ts
│   │   ├── workspace.ts
│   │   ├── map.ts
│   │   ├── route.ts
│   │   ├── drone.ts
│   │   ├── imagery.ts
│   │   ├── change.ts
│   │   ├── spot.ts
│   │   ├── inspection.ts
│   │   ├── review.ts
│   │   ├── file.ts
│   │   └── integration.ts
│   ├── types/
│   │   ├── api.ts
│   │   ├── auth.ts
│   │   ├── task.ts
│   │   ├── workspace.ts
│   │   ├── geo.ts
│   │   ├── drone.ts
│   │   ├── imagery.ts
│   │   ├── spot.ts
│   │   ├── inspection.ts
│   │   ├── review.ts
│   │   └── workflow.ts
│   ├── adapters/
│   │   ├── apiAdapter.ts
│   │   ├── mapAdapter.ts
│   │   ├── videoAdapter.ts
│   │   ├── realtimeAdapter.ts
│   │   └── integrationAdapter.ts
│   ├── mocks/
│   ├── assets/
│   ├── components/
│   │   ├── MapContainer/
│   │   ├── VideoPlayer/
│   │   ├── StatCard/
│   │   ├── FlowSteps/
│   │   ├── Timeline/
│   │   ├── EvidenceGallery/
│   │   ├── IframeEmbed/
│   │   ├── AsyncStatus/
│   │   └── PermissionGuard/
│   ├── composables/
│   │   ├── useWorkspace.ts
│   │   ├── useMap.ts
│   │   ├── useRealtime.ts
│   │   ├── useAsyncJob.ts
│   │   └── usePermission.ts
│   ├── layouts/
│   ├── router/
│   ├── stores/
│   │   ├── user.ts
│   │   ├── app.ts
│   │   ├── workspace.ts
│   │   ├── map.ts
│   │   └── realtime.ts
│   ├── workspace/
│   │   ├── config/
│   │   │   ├── forestry.ts
│   │   │   ├── land.ts
│   │   │   ├── traffic.ts
│   │   │   └── emergency.ts
│   │   └── registry.ts
│   ├── workspace-components/
│   │   ├── route-planning/
│   │   ├── cruise-capture/
│   │   ├── change-detection/
│   │   ├── spot-identification/
│   │   ├── task-dispatch/
│   │   └── review-archive/
│   ├── views/
│   ├── styles/
│   ├── utils/
│   ├── App.vue
│   └── main.ts
├── .env.development
├── .env.production
├── package.json
├── tsconfig.json
├── vite.config.ts
└── PROJECT_INIT.md
```

---

## 五、路由设计

| 路径 | 页面 | 布局 | 说明 |
|---|---|---|---|
| `/login` | 登录页 | 无 | 正式登录 |
| `/dashboard` | 低空治理运行中枢 | DashboardLayout | 登录后首页 |
| `/taskLists` | 任务总览 | BasicLayout | 任务列表 |
| `/workspace/:field` | 领域监管工作台 | WorkspaceLayout | 动态领域 |
| `/workspace/:field/:taskId` | 指定任务工作台 | WorkspaceLayout | 推荐正式使用 |
| `/` | 重定向 `/dashboard` | — | — |

---

## 六、页面规划

### 6.1 Dashboard 运行中枢

当前阶段只搭建视觉框架和 Mock 数据。

主要模块：

- 在线设备；
- 今日任务；
- 待研判；
- 闭环完成率；
- 中央地图；
- 近期任务；
- 无人机实时画面；
- AI 识别结果；
- 工单/案件进度。

### 6.2 任务总览

主要模块：

- 搜索；
- 领域筛选；
- 状态筛选；
- 时间筛选；
- 任务表格；
- 新建任务；
- 查看任务；
- 进入领域工作台。

### 6.3 林业监管工作台

统一使用：

```text
顶部固定 Header
+
当前节点业务内容
```

Header：

```text
LOGO
林业执法监管工作台
6节点流程条
今日任务 / 待办 / 用户
```

#### 节点1：地理底图与航线规划

- 左侧：图层与规划工具；
- 中间：地图作业区；
- 右侧：任务与航线信息；
- 底部：航点列表、历史航线、规划告警。

#### 节点2：无人机巡航与影像采集

- 左侧：巡航与采集控制；
- 中间：地图 + 实时回传画面；
- 右侧：实时状态信息；
- 底部：影像缩略图、飞行日志、采集统计。

#### 节点3：多期影像变化监测

- 左侧：监测配置；
- 中间：2/3/4/5 期影像对比；
- 右侧：监测结果；
- 底部：变化图斑列表、识别备注、检测日志。

数据模型必须使用影像数组，不使用固定 `beforeImage/afterImage`。

#### 节点4：问题图斑识别

- 左侧：问题图斑列表，每项带缩略图；
- 中间：问题图斑地图；
- 右侧：当前图斑详细信息；
- 右侧必须展示处理历史时间轴；
- 底部：识别统计、规则说明、近期识别事件。

#### 节点5：核查任务下发

- 左侧：待下发图斑；
- 中间：任务地图作业区；
- 右侧：核查任务详情；
- 底部：核查要求、接收单位、任务日志；
- 支持保存草稿、预览、确认下发、批量下发。

#### 节点6：复核与归档

- 左侧：待复核/待归档列表；
- 中间：整改前后 + 无人机复核 + 变化对比；
- 右侧：复核与归档详情；
- 必须展示完整处理历史；
- 底部：复核结论、归档材料、操作日志；
- 支持复核通过、退回补充整改、确认归档、导出档案。

---

## 七、领域配置驱动

```ts
export interface WorkspaceFieldConfig {
  field: string
  name: string
  nodes: WorkspaceNodeConfig[]
}

export interface WorkspaceNodeConfig {
  key: string
  name: string
  order: number
  component: string
  icon?: string
}
```

林业配置：

```ts
export const forestryConfig: WorkspaceFieldConfig = {
  field: 'forestry',
  name: '林业执法监管',
  nodes: [
    { key: 'route-planning', name: '地理底图与航线规划', order: 1, component: 'RoutePlanning' },
    { key: 'cruise-capture', name: '无人机巡航与影像采集', order: 2, component: 'CruiseCapture' },
    { key: 'change-detection', name: '多期影像变化监测', order: 3, component: 'ChangeDetection' },
    { key: 'spot-identification', name: '问题图斑识别', order: 4, component: 'SpotIdentification' },
    { key: 'task-dispatch', name: '核查任务下发', order: 5, component: 'TaskDispatch' },
    { key: 'review-archive', name: '复核与归档', order: 6, component: 'ReviewArchive' },
  ],
}
```

---

## 八、地图方案

### 8.1 当前阶段

- 二维天地图；
- 图层开关；
- 点线面绘制；
- 航线与航点；
- 图斑；
- 巡查区域；
- 比例尺；
- 定位；
- 缩放；
- 测量；
- 全屏；
- 图层管理。

### 8.2 三维能力

不在当前前端骨架阶段强制实现。

统一预留 `MapEngine` Adapter，后续确认 Cesium 后再接入。

### 8.3 GIS 数据约定

前端统一预期 GeoJSON Feature。

正式联调时必须确认：

- 坐标系；
- 空间范围；
- geometry 类型；
- 坐标精度；
- 图层查询方式；
- 海量图斑是否使用 MVT。

---

## 九、视频与实时通信

### 9.1 当前阶段

使用 Mock 视频封面/演示素材。

### 9.2 后续可能协议

- HLS；
- HTTP-FLV；
- WebRTC；
- RTSP 转 HLS/WebRTC。

### 9.3 实时事件预留

```ts
interface RealtimeEvent<T = unknown> {
  eventId: string
  type: string
  timestamp: string
  taskId?: string
  entityId?: string
  payload: T
}
```

可能事件：

```text
drone.telemetry
drone.status
flight.progress
media.captured
alert.created
change.job.progress
change.job.completed
spot.created
spot.updated
inspection.dispatched
inspection.updated
rectification.updated
review.updated
case.archived
```

---

## 十、权限与安全

正式政务系统采用：

```text
用户 → 角色 → 资源权限 → 操作权限 → 数据权限
```

前端权限只控制 UI，后端必须再次鉴权。

建议角色：

- 系统管理员；
- 业务管理员；
- 研判人员；
- 任务下发人员；
- 复核人员；
- 只读人员。

正式联调时需确认：

- Access Token；
- Refresh Token；
- Token 失效；
- 权限码；
- SSO；
- RSA 登录公钥；
- API 网关；
- CORS；
- 内网/政务云部署；
- 操作审计。

---

## 十一、第三方低空平台嵌入

前端不保存厂商 API Key。

推荐链路：

```text
本系统前端
→ 本系统后端
→ 第三方 OpenAPI
→ 临时开放组件 URL
→ iframe
→ postMessage
```

建议本系统后端未来提供：

```text
POST /api/v1/integrations/das-fly/component-url
POST /api/v1/integrations/das-fly/sync
```

当前阶段只写 Adapter。

---

## 十二、接口适配策略

当前后端 Swagger 已存在，但完整业务接口尚未正式交付。

当前阶段原则：

```text
不写死真实接口
不假定接口路径
不假定参数名称
不假定响应结构
```

通过 `api/` + `adapters/` 隔离。

Mock：

```env
VITE_USE_MOCK=true
VITE_API_BASE_URL=/api
```

后续建议从后端 OpenAPI JSON 生成 TypeScript DTO，再通过 Adapter 映射到前端领域模型。

---

## 十三、统一数据契约预期

仅作为沟通目标，后端已有格式则由 Adapter 转换。

```ts
interface ApiResponse<T> {
  code: number | string
  message: string
  data: T
  traceId?: string
}
```

```ts
interface PageResult<T> {
  items: T[]
  page: number
  pageSize: number
  total: number
}
```

前端统一：

```ts
type EntityId = string
```

时间优先 ISO 8601。

异步状态：

```ts
type AsyncStatus = 'QUEUED' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CANCELLED'
```

---

## 十四、附件与证据体系

统一前端模型：

```ts
interface EvidenceFile {
  id: string
  name: string
  type: string
  size?: number
  previewUrl?: string
  downloadUrl?: string
  thumbnailUrl?: string
  captureTime?: string
  location?: [number, number]
}
```

覆盖：

- 无人机照片/视频；
- 卫星影像；
- 变化图；
- 现场核查照片；
- 整改照片；
- SHP/GeoJSON；
- PDF；
- 归档报告。

---

## 十五、操作历史与审计

流程历史模型：

```ts
interface WorkflowEvent {
  id: string
  time: string
  type: string
  name: string
  operator?: string
  description?: string
}
```

用于展示：

```text
发现 → AI识别 → 人工研判 → 任务下发 → 现场核查 → 整改完成 → 无人机复核 → 归档
```

政务系统建议后端保留不可抵赖的审计记录。

---

## 十六、响应式与屏幕策略

首期主要面向：

```text
1366×768
1920×1080
2560×1440
```

Workspace 不以手机端为主。

小屏策略：

- 流程节点横向滚动；
- 左右面板可折叠；
- 地图优先保证面积；
- 底部面板可折叠。

---

## 十七、样式与设计系统

主色：

```scss
$color-primary: #003561;
$color-primary-light: #00509e;
$color-success: #00c48c;
$color-warning: #ff9f43;
$color-danger: #ff4d6a;
$color-info: #3da5ff;
```

Workspace：

- 深蓝 Header；
- 白色卡片；
- 浅灰背景；
- 细边框；
- 地图为视觉核心；
- Header 保持一致；
- 节点正文自由布局。

---

## 十八、当前阶段开发目标

### Phase 1：前端基础框架

- [ ] Vite + Vue3 + TS
- [ ] Element Plus
- [ ] Vue Router
- [ ] Pinia
- [ ] Axios Client
- [ ] Mock 开关
- [ ] 双主题基础变量
- [ ] 三类 Layout
- [ ] Login 页面
- [ ] Dashboard 空壳
- [ ] TaskLists 空壳
- [ ] Workspace 空壳
- [ ] 领域配置机制
- [ ] 六节点 Header
- [ ] 权限占位机制
- [ ] Adapter 目录

### Phase 2：林业工作台 UI 框架

- [ ] 六节点布局
- [ ] Mock 数据
- [ ] 节点切换
- [ ] 公共地图框架
- [ ] 时间轴
- [ ] 证据缩略图
- [ ] 表格/状态标签/统计卡片

### Phase 3：真实接口适配

- [ ] 获取 OpenAPI
- [ ] 对齐认证
- [ ] 对齐响应/分页
- [ ] 对齐 ID/时间
- [ ] 替换 Mock
- [ ] 对齐权限
- [ ] 对齐 GIS
- [ ] 对齐文件
- [ ] 对齐实时通信
- [ ] 接低空大师后端代理

---

## 十九、待确认事项

| 编号 | 事项 | 状态 | 优先级 |
|---|---|---|---|
| Q1 | 后端完整 Swagger/OpenAPI | 待提供 | 高 |
| Q2 | 登录 Token 机制 | 待确认 | 高 |
| Q3 | 权限码与角色矩阵 | 待确认 | 高 |
| Q4 | 后端统一响应格式 | 待确认 | 高 |
| Q5 | 分页格式 | 待确认 | 高 |
| Q6 | GIS 坐标系 | 待确认 | 高 |
| Q7 | 图斑空间格式 | 待确认 | 高 |
| Q8 | 是否使用 MVT | 待确认 | 中 |
| Q9 | 视频协议 | 待确认 | 高 |
| Q10 | WebSocket 协议 | 待确认 | 高 |
| Q11 | 文件接口 | 待确认 | 高 |
| Q12 | 低空大师后端适配 | 待确认 | 高 |
| Q13 | 外业核查/整改结果来源 | 待确认 | 高 |
| Q14 | 是否需要 Cesium | 待确认 | 中 |
| Q15 | 部署环境/网关 | 待确认 | 中 |
| Q16 | 是否接 SSO | 待确认 | 高 |

---

## 二十、Cursor 第一阶段执行原则

Cursor 当前只完成：

1. 项目脚手架；
2. 目录结构；
3. 布局；
4. Header；
5. 六节点空壳；
6. Mock；
7. API/Adapter 占位；
8. 地图 UI 占位；
9. 页面样式框架；
10. 节点间切换。

暂时不要：

- 猜真实接口路径；
- 猜后端 DTO；
- 写死后端字段；
- 写死低空大师 Key；
- 写真实无人机控制；
- 强行实现三维；
- 强行实现真实 AI；
- 强行实现视频协议。

---

## 二十一、当前阶段验收标准

- 能启动；
- 能进入 Mock 登录；
- 能进入 Dashboard；
- 能进入任务总览；
- 能进入林业工作台；
- Header 六节点可切换；
- 六节点均有完整布局；
- Mock 数据可展示；
- 页面不依赖真实后端；
- API/Adapter 已预留；
- 正式 Swagger 到来后无需重写页面；
- 1366/1920 宽度下布局可正常使用。

---

*本文档为前端项目活文档。后端接口、第三方平台、视频协议、实时通信、GIS 数据规范等在正式对接后持续更新。*
