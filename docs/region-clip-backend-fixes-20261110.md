# 红旗街道统计异常与城西街道裁切丢区：后端修复说明

2026-11-10 在真实农业农村局专题页复现。本文保留原始复现与后端修复需求，供取证追溯。

更新：当晚后端回传修复后，已在真实专题页完成红旗街道统计、城西南北两片裁切及点击详情、九龙镇、三区合计／分区统计的复测，均通过。具体数值与截图见 [联调记录](region-clip-validation-20261110.md)。前端完整性保护继续保留。

## 1. 红旗街道统计：后端拓扑运算失败

- 登记服务：101；乡级行政区划子图层：4；行政区代码：321202050；OBJECTID：20。
- 选择红旗街道并“用于区划裁切”，裁切四层完成后进入区域统计。
- 统计复用 `POST /api/v1/spatial/spot/compare` 及 `/spot/compare/status`；minAreaSqm=0。
- 已复现失败的对比任务编号：56。
- 加入阶段诊断后再次复现：任务 57，明确失败阶段为“区划与高标田叠加”，错误坐标与任务 56 相同。
- 后端返回的原始失败原因：

```text
分析执行失败：side location conflict [ (495096.84747608274, 3600841.5534628644, NaN) ]
```

前端已在错误中增加实际阶段（区划与高标田叠加／区划与永农叠加／高标田与永农重叠统计），保留任务号和完整后端原因，不展示虚假的 0 面积。

后端需要：

1. 按任务 56 日志与输入快照确认失败发生在输入合并、投影、相交还是差集；检查修复前后几何的有效性。
2. 对输入、投影后以及合并后的几何统一执行有效性检查和必要修复，叠加操作使用稳健计算。若当前 JTS 版本支持，可评估 `GeometryFixer` 与 `OverlayNGRobust.union/overlay`，而非只在 region-clip 流程中修复一次。
3. 面积统计和 FeatureCollection 必须基于同一份修复后的几何，明确空结果；不可跳过异常地块、提高碎斑阈值或返回成功零面积来掩盖问题。
4. 修复后重算受影响任务，失败缓存不可继续复用，并回归九龙镇、红旗街道、城西街道以及多区合计／分区统计。

参考：[JTS 稳健叠加](https://locationtech.github.io/jts/javadoc/org/locationtech/jts/operation/overlayng/OverlayNGRobust.html)、[GeometryFixer 官方实现](https://github.com/locationtech/jts/blob/master/modules/core/src/main/java/org/locationtech/jts/geom/util/GeometryFixer.java)。

## 2. 城西街道裁切：两个原始要素只返回一个

登记服务 101 的地址：

```text
http://58.213.29.198:9624/arcgis198/arcgis/rest/services/taizhou_temp/海陵区高标准农田/MapServer
```

读取子图层 4 的原始查询结果，城西街道（行政区代码 321202002）包含：

- OBJECTID=2：北侧区域，1 个外环。
- OBJECTID=22：南侧区域，共 4 个环。原始 rings 的前 3 项为逆时针内环，真正顺时针外环在最后一项（1896 个顶点）。

运行项目实际区划读取逻辑，得到“城西街道”的 objectIds 确实为 `[2,22]`。原始服务 POST 按全部 ID 查询时也完整返回 2 和 22；不是只选中了第一条记录。

修复前，真实裁切页只有一个行政区路径，区域总面积显示 14296.60 亩，与仅保留 2 号北侧区域的情况吻合。22 号南侧区域未显示。

已由前端新增完整性检查确认的真实裁切任务号：`dd2370dc044f4b079b48a854d1cadcb2`。该任务状态为成功，但 GeoJSON 未包含所选 sourceObjectId=22；前端现已中止展示，而不是继续显示北侧一块。

可复现请求（deptId 替换为当前农业农村局视角的部门 ID）：

```json
{
  "deptId": "<当前部门ID>",
  "regions": [{ "serviceId": "101", "layerId": 4, "objectIds": [2, 22] }],
  "combineMode": "UNION",
  "targets": [
    { "serviceId": "101", "layerId": 4, "where": "OBJECTID IN (2,22)" },
    { "serviceId": "101", "layerId": 3, "where": "1=1" },
    { "serviceId": "101", "layerId": 6, "where": "1=1" },
    { "serviceId": "101", "layerId": 7, "where": "1=1" }
  ]
}
```

后端需要：

1. 检查 `ArcGisFeatureFetcher.fetchByIds` 是否确实读取并保留 2、22 两个要素。
2. 重点检查 ArcGIS rings→JTS 的转换。不能将 rings[0] 一律当作外环，也不能将所有后续环一律当作孔洞；应识别外环与孔洞归属，支持外环不在第一项、多外环、带孔洞和多个原始要素。
3. 转换后逐要素检查修复、投影、UNION 各阶段的要素数、空几何和面积。不得把错误构造后 `buffer(0)` 得到的空几何悄悄丢弃。当前能确认 22 号结果缺失，具体丢失阶段还需后端日志核实。
4. 自裁切所选行政区时，结果必须覆盖两个原始要素，保留 sourceObjectId=2、22；其他业务图层也必须覆盖南、北两片范围。仅补行政区轮廓显示是不够的。
5. 修复后提升引擎版本或清理受影响缓存，避免复用已经丢区的裁切成功结果。

参考：[ArcGIS Polygon 环规则](https://developers.arcgis.com/rest/services-reference/enterprise/geometry-objects/)。

## 前端本次已做的保护与验收

- 对所选行政区自裁切结果增加 sourceObjectId 完整性校验，支持多个输出片段对应同一个原始 ID。
- 如缺少任一被选区划要素，明确报出结果号、服务／图层和丢失 ID，并隐藏已提前显示的所有裁切图层，停止区域统计，防止只展示一半却显示“成功”。
- 原有裁切分类、点击详情、统计新增指标及进度条保留。
- 增加“城西街道请求 2、22，后端成功但只返回 2”的行为回归，以及统计失败阶段与任务号的回归检查。

后端完成后，重新验证城西街道两块区域的轮廓、地块、点击详情和统计；同时验证红旗街道能完成所有统计阶段，才算问题完整解决。
