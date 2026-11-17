export type AlgorithmFamily = 'ai' | 'spatial'
export type AlgorithmStatus = '已部署' | '在线' | '测试中' | '已发布' | '待接入'
export interface MockAlgorithm { id:string; family:AlgorithmFamily; name:string; version:string; status:AlgorithmStatus; description:string; tags:string[]; category:string; scene:string; capability:string; owner:string; updatedAt:string; visual:string }

export const algorithms: MockAlgorithm[] = [
  { id:'scenario-change', family:'ai', name:'多期遥感影像智能变化检测', version:'', status:'待接入', description:'融合注意力机制和卷积神经网络，实现多期遥感影像的全要素智能变化发现，输出变化图斑矢量边界。', tags:['变化检测','遥感影像','图斑提取'], category:'变化检测', scene:'多期遥感影像智能变化检测', capability:'变化检测', owner:'地信中心', updatedAt:'', visual:'scenario-change' },
  { id:'scenario-land-classification', family:'ai', name:'单要素地物分类', version:'', status:'待接入', description:'引进多尺度地学网络，实现单期遥感影像的单要素地物分类，实现耕地、建设用地、水体等地类的实时监管与预警。', tags:['地物分类','遥感影像','地类监管'], category:'地物分类', scene:'单要素地物分类', capability:'地物分类', owner:'地信中心', updatedAt:'', visual:'scenario-classification' },
  { id:'scenario-illegal-land', family:'ai', name:'违规用地监测', version:'', status:'待接入', description:'智能叠加管理层数据，通过时序空间分析等，实现对管控区域的智能保护和治理。', tags:['目标识别','空间分析','用地监管'], category:'目标识别', scene:'违规用地监测', capability:'目标识别', owner:'地信中心', updatedAt:'', visual:'scenario-illegal' },
  { id:'scenario-non-grain', family:'ai', name:'非粮化监测', version:'', status:'待接入', description:'通过耕地智能分类和长时间序列物候特征分析相结合的技术，实现对农作物种植结构分布的精准识别，服务于耕地保护和粮食安全监管。', tags:['地物分类','时序分析','耕地保护'], category:'地物分类', scene:'非粮化监测', capability:'地物分类', owner:'地信中心', updatedAt:'', visual:'scenario-grain' },
  { id:'scenario-construction', family:'ai', name:'工程建设过程监管', version:'', status:'待接入', description:'基于高频次无人机巡查影像，通过特定目标识别技术，实现对大型工程的施工进程全流程监管。', tags:['目标识别','无人机巡查','工程监管'], category:'目标识别', scene:'工程建设过程监管', capability:'目标识别', owner:'地信中心', updatedAt:'', visual:'scenario-construction' },
  { id:'sp-overlay', family:'spatial', name:'空间叠加分析', version:'V1.2', status:'已发布', description:'对多源空间数据进行叠加分析，识别图层间的空间关系与属性组合，支持并、交、差等操作。', tags:['叠加分析','矢量分析','空间关系'], category:'基础空间分析', scene:'自然资源', capability:'空间叠加', owner:'自然资源局', updatedAt:'2026/06/10 14:22', visual:'overlay' },
  { id:'sp-buffer', family:'spatial', name:'缓冲区分析', version:'V2.0', status:'在线', description:'基于点、线、面要素生成缓冲区，支持多级缓冲设置，用于影响范围分析、风险评估等场景。', tags:['缓冲区','范围分析','矢量分析'], category:'基础空间分析', scene:'风险评估', capability:'缓冲区分析', owner:'自然资源局', updatedAt:'2026/06/12 09:18', visual:'buffer' },
  { id:'sp-distance', family:'spatial', name:'距离测算', version:'V1.5', status:'已发布', description:'计算两点、点线、点面或线面之间的空间距离，支持最近距离、最短距离等多种计算方式。', tags:['距离分析','空间计算','矢量分析'], category:'空间关系计算', scene:'通用分析', capability:'距离测算', owner:'农业农村局', updatedAt:'2026/06/08 16:37', visual:'distance' },
  { id:'sp-range', family:'spatial', name:'范围判断', version:'V1.0', status:'在线', description:'判断点、线、面是否位于指定范围内，支持行政区、规划区、管控区等多种地理要素的包含判断。', tags:['范围分析','空间关系','矢量分析'], category:'基础空间分析', scene:'规划管控', capability:'范围判断', owner:'自然资源局', updatedAt:'2026/06/07 11:05', visual:'range' },
  { id:'sp-clip', family:'spatial', name:'裁剪与相交分析', version:'V1.1', status:'测试中', description:'基于指定范围对数据进行裁剪、相交或提取，支持多种几何类型的空间运算与结果输出。', tags:['数据处理','矢量分析','空间运算'], category:'数据处理', scene:'交通巡检', capability:'裁剪', owner:'交通运输局', updatedAt:'2026/06/15 09:42', visual:'clip' },
  { id:'sp-near', family:'spatial', name:'邻近设施检索', version:'V1.3', status:'在线', description:'在指定范围内检索周边设施要素，支持按类型、距离、数量等条件进行邻近分析与结果统计。', tags:['邻近分析','设施检索','空间查询'], category:'空间关系计算', scene:'生态环境', capability:'邻近分析', owner:'生态环境局', updatedAt:'2026/06/11 15:21', visual:'nearby' },
]

