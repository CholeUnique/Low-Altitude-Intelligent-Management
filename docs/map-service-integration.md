# 地图服务接入

## 注册方式

GeoServer 是发布软件，不是请求协议。新增服务时选择实际发布的 WMS、WMTS、TMS 或 XYZ；ArcGIS 选择 MapServer 或 ImageServer。不要填管理后台页面地址。

- WMS：可填 `/geoserver/wms`、工作空间的 `/wms`、`/ows?service=WMS` 或 GetCapabilities 地址。
- WMTS：可填 `/geoserver/gwc/service/wmts` 或可访问的 GetCapabilities 地址。
- ArcGIS：填 `/arcgis/rest/services/服务名/MapServer` 或 `/ImageServer` 根地址，鉴权参数放在查询串中。
- XYZ/TMS：继续使用包含 `{z}/{x}/{y}` 或 `{-y}` 的完整模板。

WMS/WMTS 服务描述存在多个图层时，需要明确选择，不自动叠加全部图层：

```text
/geoserver/wms?layers=workspace:layer
/geoserver/gwc/service/wmts?LAYER=workspace:layer&TILEMATRIXSET=EPSG:3857
```

服务描述的 XML 必须能被浏览器读取（启用 CORS 或使用同源代理）。WMS 已显式指定 `layers` 时保留旧服务的图片直连降级；此时没有可读的描述就无法自动推断范围和坐标系，建议同时提供 `version`、`srs`/`crs`。鉴权拒绝不会被降级吞掉。

## WMS

- 自动读取唯一图层、继承的坐标系及地理覆盖范围。
- 沿用配置的版本与坐标系；没有配置时按服务描述选择。
- 支持 1.1.0、1.1.1、1.3.0；区分 1.3.0 的 EPSG:4326/4490 纬经轴序与 CRS:84 经纬轴序。
- 原 URL 中旧的 GetMap、BBOX、图片尺寸等控制参数会移除后重新生成，避免大小写不同的重复参数。保留 token、TIME、CQL_FILTER 等额外查询参数。

## WMTS

- 解析 Contents、图层、样式、格式、矩阵集、分辨率、原点、瓦片尺寸和矩阵行列数。
- 使用真实矩阵标识（例如 `EPSG:4326:10`），不假定等于地图缩放级别。
- 支持 KVP GetTile 以及服务描述中的 REST ResourceURL；尊重 TileMatrixSetLimits 和维度默认值。
- 多个可用矩阵集时优先标准墨卡托；也可通过 TILEMATRIXSET 明确指定。
- 对已填写完整瓦片模板的旧墨卡托兼容服务，XML 跨域或超时时仍可按原模板直连；声明为经纬度矩阵时不会这样降级。授权错误、无效矩阵和图层选择错误也不会降级。
- 不将原地址的 token/key 自动附加到描述中声明的其他域名。

## ArcGIS 缓存与投影

读取 tileInfo 的 spatialReference、origin、rows/cols、lods.resolution，以及 minLOD/maxLOD。只有确认是标准网格的墨卡托缓存才直接使用 XYZ；其他受支持矩阵按照真实分辨率选择级别并重投影。动态 MapServer/ImageServer 保留 export/exportImage 路径。

当前支持的坐标系为 EPSG:3857（含常见别名）、4326、4490、4528、4549。其他投影、缺失原点或无有效分辨率会明确报错，不猜测切片规则。WFS、FeatureServer、矢量 WMTS/PBF 不属于本次栅格服务适配范围。

非标准矩阵渲染复用并发上限、离屏取消和有界缓存。泰州天地图保留专用适配与首页业务范围过滤；行政外包范围仍不冒充服务发布范围。

## 验证

```text
npm run test:map-services
npm run type-check
npm run build
```

测试覆盖使用模拟服务描述和图片响应验证请求与坐标计算。上线前仍需使用实际服务确认 CORS、授权、已发布级别和图片响应；测试通过不代表第三方服务始终可访问。
