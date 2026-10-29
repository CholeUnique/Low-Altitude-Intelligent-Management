# 大屏动效与后端对称差分分析

## 首页动效

参考 DataV 官方示例，使用本地 Vue/CSS/SVG 实现真实数值更新翻牌、图标轻浮动、环图轨道及轻量高光；接口、刷新频率和布局不变。遵守减少动态效果偏好。

## 当前空间分析约定

以 2026-10-29 最新 Swagger 的 SpatialGeojsonReq 为准。

- POST /api/v1/spatial/layer/list：读取当前部门可分析图层及字段，点/线不可用于面积分析。
- POST /api/v1/spatial/overlay：提交 A/B 服务和图层、EQ/IN 属性条件、minAreaSqm（默认 4）及 includeOverlapSpots=false。后端计算，前端等待 180 秒。
- POST /api/v1/spatial/overlay/geojson：明确提交 resultId、deptId、merge=true，要求后端 union 后的独立差异要素。预期 FeatureCollection 中一个 Polygon/MultiPolygon，properties.diffType=DIFF、areaSqm、partCount；接缝已消除。
- POST /api/v1/spatial/overlay/detail：刷新统计及输入快照。

前端只接受有效单个 DIFF 要素，不筛选/组合 A_ONLY、B_ONLY。空结果、分类结果、混合类型、多个要素、无效几何及接口错误均明确报错。即使分页接口可返回分类图斑，也不再降级读取或显示。不存在浏览器几何运算。

成功后单色显示一个不重叠区域图层，临时隐藏原始业务矢量，保留影像底图；提供 DIFF GeoJSON 导出。原始图层的专题配置、图例行、分类项目和显示模式保留；分析成功后将原业务图层分类全部取消勾选。图例只提供全选/反选，不设额外显示选项；无分类图层也由同一组全选/反选控制。已选配置的 visible 状态不改变，无需重新配置。面积与 A/B 来源保留在左侧统计。失败不创建替代图层，不隐藏输入，不丢弃上次有效 DIFF 结果；错误提示包含接口、结果编号和错误码，保留至用户关闭。

## 最新复测

2026-10-29 18:35，GBZ 9/0 与永久基本农田 9/1：

- 结果 19，merge=true：code=-1、unknown error。
- 结果 19，merge=false：code=0，1195 个 A_ONLY/B_ONLY 分类图斑。此响应现在必须被前端拒绝。
- 新计算结果 33，阈值 4.02 ㎡、cached=false，统计成功，merge=true 仍返回 code=-1、unknown error。此为 18:35 的失败状态。18:41 再次请求后，结果 19/33 的 merge=true 已恢复，均返回单个 DIFF MultiPolygon。

单元测试覆盖明确 merge=true、仅接受单个 DIFF、保留 MultiPolygon 内环与坐标、拒绝分类与空/无效结果、任何错误均不分页降级、具体错误信息及取消等待。真实接口已返回独立 DIFF；页面验证实际显示和导出该后端几何，并通过模拟分类、空结果和接口错误验证严格拒绝替代结果。

详见 spatial-analysis-backend-export-issue.md。
