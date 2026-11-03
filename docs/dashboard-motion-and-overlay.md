# 大屏动效与后端对称差分分析

## 首页动效

参考 DataV 官方示例，使用本地 Vue/CSS/SVG 实现真实数值更新翻牌、图标轻浮动、环图轨道及轻量高光；接口、刷新频率和布局不变。遵守减少动态效果偏好。

## 当前空间分析约定

以 2026-11-03 最新 Swagger 和实际响应为准，当前需求已从单色 DIFF 改为一个结果图层内保留来源的对称差分。

- POST /api/v1/spatial/layer/list：读取当前部门可分析图层及字段，点/线不可用于面积分析。
- POST /api/v1/spatial/overlay：提交 A/B 服务和图层、EQ/IN 属性条件、minAreaSqm（默认 4）及 includeOverlapSpots=false。后端计算，前端等待 180 秒。
- POST /api/v1/spatial/overlay/geojson：明确提交 resultId、deptId、merge=false，读取后端裁切好的 A_ONLY / B_ONLY 多要素 FeatureCollection，作为一个独立差分图层展示。
- POST /api/v1/spatial/overlay/detail：刷新统计及输入快照。

黄色表示仅 A（A − B），紫色表示仅 B（B − A）。图例、点击详情、鼠标提示和导出均保留具体来源名称；导出补充 analysisSourceSide、analysisSourceLayerName、analysisExcludedLayerName、analysisSourceServiceId、analysisSourceLayerId、analysisMembership。后端几何、内环、面积和原属性不改写，浏览器不计算差分。

前端拒绝 DIFF（无法区分来源）、OVERLAP、未分类结果、无效面及非正面积。接口错误不会降级显示其他几何。如果结果为空且后端差异面积和图斑数均为 0，提示无有效差异并保留原图层；若统计有差异却无几何则报错。

成功后临时取消原业务矢量分类的选择，保留影像底图。原始专题配置、图层详情行、分类和模式保留，只通过全选/反选恢复。失败不隐藏输入，不删除已有有效结果。后台结果的 diffType 是后端几何裁切后的来源，不是原始 A/B 整层的简单重叠显示。

## 历史复测（2026-10-29）

以下追溯此前单 DIFF 导出故障；当时“拒绝分类结果”的要求已于 2026-11-03 被上述保留来源的需求替代。


2026-10-29 18:35，GBZ 9/0 与永久基本农田 9/1：

- 结果 19，merge=true：code=-1、unknown error。
- 结果 19，merge=false：code=0，1195 个 A_ONLY/B_ONLY 分类图斑。此响应现在必须被前端拒绝。
- 新计算结果 33，阈值 4.02 ㎡、cached=false，统计成功，merge=true 仍返回 code=-1、unknown error。此为 18:35 的失败状态。18:41 再次请求后，结果 19/33 的 merge=true 已恢复，均返回单个 DIFF MultiPolygon。

单元测试覆盖明确 merge=true、仅接受单个 DIFF、保留 MultiPolygon 内环与坐标、拒绝分类与空/无效结果、任何错误均不分页降级、具体错误信息及取消等待。真实接口已返回独立 DIFF；页面验证实际显示和导出该后端几何，并通过模拟分类、空结果和接口错误验证严格拒绝替代结果。

详见 spatial-analysis-backend-export-issue.md。
