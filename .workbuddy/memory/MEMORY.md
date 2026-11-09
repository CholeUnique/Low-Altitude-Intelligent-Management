# 项目长期约定（Low-Altitude-Intelligent-Management）

## 主题体系：双主题，不是「浅色 + 深色补丁」
- 切换点在 `src/App.vue:13`：
  `document.documentElement.dataset.uiTheme = route.meta.public || route.name === 'workspace' ? 'light' : 'dark'`
- **light 主题（真的在用，不能当遗留删掉）**：
  - 登录页 `/login`、移动端设施上报页 `/facility-report`（都是 `meta.public`）
  - 场景作业工作台 `/workspace/:sceneId/:taskId?`
- **dark 主题**：总览、飞行作业、智能研判、任务中心、后台管理等其余所有页面。
- 令牌定义在 `src/styles/system/_tokens.scss`：`html:root` 为深色默认，`html[data-ui-theme='light']` 覆盖为浅色。全局深色适配层在 `_controls.scss` / `_operations.scss` / `_resources.scss` / `_tasks.scss`，用 `#app xxx` 选择器压过组件 scoped 样式。

## 因此：组件的浅色 CSS 不要删
- 2026-11-09 曾尝试把「只跑在深色页」的组件里浅色改为设计令牌，做完 1 个后用户要求回退，**该路线已作废**。
- 配色问题一律走**最小修补**：哪个页面出「白线/白条/黑带」，就到 `src/styles/system/*.scss` 补对应的 `border-color` / `background` 覆盖，不改组件自带浅色。

## 各组件被谁用（需要时查这张表）
- **共享组件（浅色必需）**：`SpotIdentificationPanel`、`RouteFlightPlanPanel`、`SharedVideoPlayer`、`PhotoLocationControl` —— 工作台和研判/数据页都会渲染。
- **仅深色页使用**：`GeneralSpotReviewPanel`、`FlightTaskReviewPanel`、`FleetOverviewPanel`、`GlobalLiveCruisePanel`、`RequestTicketPanel`、`FlightPlanCalendarPanel`。
- **仅浅色用（工作台专属）**：`TaskDispatchPanel`、`ReviewArchivePanel`、`SceneNodePlaceholder`、`RealtimeCruisePanel`、`NonGrainWorkspace`、`FarmlandFacilitiesWorkspace`、`TaskAcceptancePanel`。

## 踩坑规律：深色页上的「白线/白条/黑带」几乎都来自同三件事
1. 组件里硬编码 `border: 1px solid #浅色`，而全局覆盖只改了 `background` / `color`，漏了 border。
2. 组件自建色板（实色深蓝）与全局 `--ui-panel-background`（半透明）叠加 → 出现近乎全黑的色块。
3. 全局规则特异性多为 `#app ...` （ID 级），**高于**组件 scoped 的 `[data-v]`，所以组件里写死色值往往无效、或只生效一半。
- 排查顺序：先看 `src/styles/system/*.scss` 有没有该组件的全局覆盖、`:is()` 列表里漏了什么元素。

## 构建注意
- `vite build` 成功时仍会因 chunk 体积警告走 stderr，PowerShell 里退出码为 1；判断成功看日志里的 `built in xx s`。
- 构建偶发卡死（数分钟无输出），终止后立即重试通常 30~45 秒完成。
