# 算法卡片演示影像

这些图片是使用内置 imagegen 生成的模拟示意素材，不是实际航拍、识别结果或 GIS 分析输出。源图经过统一缩放与 JPEG 压缩，用于 `AlgorithmRepositoryView.vue` 的卡片预览；版本、状态、检测框和空间分析叠加层由前端绘制。

生成提示词（英文原意）：

| 文件 | 提示词主题 |
| --- | --- |
| `forest.jpg` | Photorealistic top-down drone orthophoto of dense mixed forest in eastern China, an irregular fresh clearing and rough access tracks, realistic canopy and soil texture; no boxes, labels or UI. |
| `building.jpg` | Photorealistic top-down drone orthophoto of a new construction site at a Chinese town edge, concrete foundations and disturbed soil among existing low-rise buildings; no boxes, labels or UI. |
| `farmland.jpg` | Photorealistic top-down drone orthophoto of East Chinese rice fields and irrigation channels, with one parcel converted into a nursery or sheds; no boxes, labels or UI. |
| `change_before.jpg` | Photorealistic top-down drone orthophoto of a Chinese peri-urban block, courtyard, road and vegetation, for a multi-date image comparison; no split line, labels or UI. |
| `change_after.jpg` | Edit of `change_before.jpg`: preserve viewpoint, roads, trees and buildings; replace only the central empty courtyard with a new rectangular roof. |
| `road.jpg` | Photorealistic top-down drone orthophoto of a Chinese arterial road, roadside trees and small piles of soil, gravel and construction debris; no boxes, labels or UI. |
| `water.jpg` | Photorealistic top-down drone orthophoto of an urban river bend or reservoir shore, vegetation and a small suspicious shoreline landing; no boxes, labels or UI. |
| `spatial_map.jpg` | Wide professional GIS-style top-down basemap with streets, building footprints, parks, fields and a stream in muted sage and gray; no labels, circles, routes or UI. |

所有提示词均要求 16:9 横向卡片底图。空间分析卡片共用模拟底图，但通过不同裁切位置与 SVG 叠加层表达不同算法。
