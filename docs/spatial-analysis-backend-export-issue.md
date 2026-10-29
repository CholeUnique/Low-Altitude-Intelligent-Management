# 独立 DIFF 图层接口复测记录

当前状态：2026-10-29 18:41（北京时间）后端已恢复 merge=true 输出。结果 19、33 均返回单个 DIFF MultiPolygon。结果 19 的 areaSqm=4312391.5875、partCount=1195；结果 33 的 areaSqm=4312383.5503、partCount=1193。以下失败记录用于追溯此前故障。

2026-10-29 18:35 的初次复测中，文档已增加 merge 参数，但 merge=true 分支仍失败。

## 当前接口约定

POST /api/v1/spatial/overlay/geojson，merge=true：服务端 union A_ONLY 与 B_ONLY，输出单个独立差异要素；properties.diffType=DIFF，包含 areaSqm、partCount，类型 Polygon/MultiPolygon，接缝消除。merge=false 才返回 A_ONLY/B_ONLY 分类图斑。

## 复现请求与实际响应

POST /api/v1/spatial/overlay/geojson

~~~json
{"deptId":"1","resultId":"19","merge":true}
~~~

HTTP 200：

~~~json
{"code":"-1","msg":"unknown error"}
~~~

相同请求改 merge=false，成功返回 FeatureCollection，1195 个分类图斑。证明错误与合并输出分支相关，具体根因仍需后端异常日志确认。

为排除旧缓存，又计算一组新结果：

~~~json
{
  "deptId":"1",
  "sourceA":{"serviceId":"9","layerId":0,"filters":[]},
  "sourceB":{"serviceId":"9","layerId":1,"filters":[]},
  "minAreaSqm":4.02,
  "includeOverlapSpots":false
}
~~~

A 高标准农田GBZ；B 九龙镇永久基本农田1。分析返回 resultId=33、cached=false、spotCount=1193、diffArea=4312383.5508 ㎡；随后 resultId=33、merge=true 同样返回 code=-1、unknown error。

## 后端故障的排查和回归项（18:41 合并输出已恢复）

1. 根据接口、时间和结果 19/33 查询合并输出分支的完整异常堆栈，检查 union 与 GeoJSON 转换/序列化过程。前端无法从 unknown error 确认具体异常类型。
2. 确保 merge=true 真正返回单个 DIFF 几何（包含内环），不能只返回统计或分类图斑。空差异需有清晰业务说明。
3. 对旧缓存和新结果均验证；核对合并结果面积与 diffArea、几何与源数据对称差一致。
4. 增加具体错误码、可读原因和 traceId，日志关联完整异常，避免只有 unknown error。
5. 若数据量超限，需后端提供独立合并结果的可读取方式；前端不会再用分类分页代替。

## 前端执行规则

已明确请求 merge=true，并严格校验单个有效 DIFF。没有独立不重叠区域图层就报错，不再调用分页，不再组合或显示 A_ONLY/B_ONLY。仅拿到统计不算分析结果显示成功。有效结果使用统一颜色；失败不生成替代图层、不隐藏输入。
