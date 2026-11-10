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

## 导航二维码：高德 + 腾讯 + 百度
- 组件：`src/workspace-components/spot-identification/NavigationQrDialog.vue`，弹窗内从左到右：高德 / 腾讯 / 百度（百度那张可用按钮切成 App scheme 版）。
- 高德：`https://uri.amap.com/navigation?to=<lng>,<lat>,<名称>&mode=car&callnative=1`（GCJ-02；**经度在前**；可直接进驾车路线）
- 腾讯：`https://apis.map.qq.com/uri/v1/routeplan?type=drive&to=<名称>&tocoord=<lat>,<lng>&policy=0&referer=tzscene`（GCJ-02；**纬度在前**；302 到 `map.qq.com/nav/drive` 驾车页，key 由腾讯注入，无需 AK）—— 三家体验最好。
- 百度：`https://api.map.baidu.com/marker?location=<lat>,<lng>&title=&content=&output=html&coord_type=bd09ll&zoom=17&src=`（BD-09；**纬度在前**，进的是定位页，需点「到这去」）
- 百度 `api.map.baidu.com/direction`（网页路线 URI）**已下线**，会 302 到首页，不要再尝试；`map.baidu.com/dir/?...` 也不认参数。
- **百度地图 App 内扫码必须用 `baidumap://map/direction?destination=latlng:<lat>,<lng>|name:<名称>&mode=driving&coord_type=bd09ll&src=`**：App 扫 https 链接时，`marker` 接口会按 UA 302 到 `map.baidu.com/mobile/webapp/place/marker/...code=276`，`code=276` 是临时标注码，App 还原不了 → 回首页。因此导航弹窗给三张码（高德 / 百度网页 / 百度 App）。

## 接口文档
- 线上 OpenAPI 直接取：`http://223.2.41.169:8080/v3/api-docs`（PowerShell `Invoke-WebRequest` 可用），**比仓库里的缓存新**，做接口比对前先确认缓存日期。
- 当前缓存 `.workbuddy/swagger-api-docs.json` 已更新到 2026-11-10 版（199 paths / 376 schemas），旧版留在 `swagger-api-docs.old.json`。

## 改样式前必须先确认「全局覆盖层」
- `src/styles/system/*.scss`（`_tasks.scss` / `_operations.scss` / `_resources.scss` / `_controls.scss` / `_maps.scss`）里大量选择器带 **`#app`** 前缀，特异性为 ID 级，**会压过组件 `<style scoped>` 的同名规则**。
- 因此在组件里改 `grid-template-columns`、`border`、`background`、`white-space` 等，经常"改了没效果"。
- 排查顺序：① 先 `Grep` `src/styles` 里该组件的类名 → ② 看有没有 `#app xxx` 同名规则 → ③ 有就在 scss 里改，组件里的同名规则删掉或加注释说明失效。
- 具体案例：任务列表（`.task-list-page .task-table-row`）的列宽**只由 `_tasks.scss` 决定**，`TaskListsView.vue` 里的 grid 全是死规则。

## 踩坑规律：深色页上的「白线/白条/黑带」几乎都来自同三件事1. 组件里硬编码 `border: 1px solid #浅色`，而全局覆盖只改了 `background` / `color`，漏了 border。
2. 组件自建色板（实色深蓝）与全局 `--ui-panel-background`（半透明）叠加 → 出现近乎全黑的色块。
3. 全局规则特异性多为 `#app ...` （ID 级），**高于**组件 scoped 的 `[data-v]`，所以组件里写死色值往往无效、或只生效一半。
- 排查顺序：先看 `src/styles/system/*.scss` 有没有该组件的全局覆盖、`:is()` 列表里漏了什么元素。

## 构建注意
- `vite build` 成功时仍会因 chunk 体积警告走 stderr，PowerShell 里退出码为 1；判断成功看日志里的 `built in xx s`。
- 构建偶发卡死（数分钟无输出），终止后立即重试通常 30~45 秒完成。
