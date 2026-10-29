import type { MapFeatureAttributeRow } from './map-service-layer'

// 来源：高标准农田地块属性表 C3、国土变更调查数据属性字段 C.2。
const farmland: Record<string, string> = {
  DCBH:'调查编号',QXMC:'区县名称',XZMC:'乡镇名称',XZCMC:'行政村名称',DLMC:'地类名称',
  SFYJJBNT:'是否永久基本农田',SSXMDM:'所属项目代码',SSXMMC:'所属项目名称',
  PGSSXMDM:'评估所属项目代码',PGSSXMMC:'评估所属项目名称',MJ:'面积',GGSY:'灌溉水源',
  GGNL:'灌溉能力',PLNL:'排涝能力',PZD:'平整度',LPD:'连片度',DLTDD:'道路通达度',
  YJHQK:'宜机化情况',SJLYQK:'实际利用情况',NZWZZMC:'农作物种植名称',QTNZWZZMC:'其他农作物种植名称',
  LSCN:'粮食产能',CBQJYQSFYZ:'承包权经营权是否一致',JYZTLX:'经营主体类型',
  QTJYZTLX:'其他经营主体类型',JYZTMC:'经营主体名称',FZR:'法人／负责人',SFQBLZ:'是否全部流转',LZGM:'流转规模',
}
const survey: Record<string, string> = {
  BSM:'标识码',YSDM:'要素代码',TBYBH:'图斑预编号',TBBH:'图斑编号',DLBM:'地类编码',DLMC:'地类名称',
  QSXZ:'权属性质',QSDWDM:'权属单位代码',ZLDWDM:'坐落单位代码',ZLDWMC:'坐落单位名称',
  TBMJ:'图斑面积',KCDLBM:'扣除地类编码',KCXS:'扣除地类系数',SFSC:'是否实测田坎',
  KCMJ:'扣除地类面积',TBDLMJ:'图斑地类面积',GDLX:'耕地类型',GDPDJB:'耕地坡度级别',
  XZDWKD:'线状地物宽度',TBXHDM:'图斑细化代码',TBXHMC:'图斑细化名称',ZZSXDM:'种植属性代码',
  ZZSXMC:'种植属性名称',GDDB:'耕地等别',FRDBS:'飞入地标识',CZCSXM:'城镇村属性码',MSSM:'描述说明',
  HDMC:'海岛名称',BGLX:'变更类型',XMLX:'项目类型',XMMC:'项目名称',XMBH:'项目编号',DKMC:'地块名称',
  DKBH:'地块编号',BZ:'备注',GXSJ:'更新时间',
}
// 工程、项目辅助图层只展示已明确含义的核心业务字段，不展示系统编号和几何计算字段。
const auxiliary: Record<string, string> = {GCMC:'工程名称',XMMC:'项目名称',XMLX:'项目类型',SSXMMC:'所属项目名称',SSXMDM:'所属项目代码',SFGBXMJS:'是否高标项目建设',DKMC:'地块名称',DKBH:'地块编号',DLMC:'地类名称',MJ:'面积',BZ:'备注'}
const areaFields = new Set(['MJ','LZGM','TBMJ','KCMJ','TBDLMJ'])
// 用户最新截图中永久基本农田图层红框指定的字段，按业务阅读顺序展示。
const permanentFields: Record<string,string> = {
  XZQMC:'行政区名称',YJJBNTTBBH:'永久基本农田图斑编号',DLMC:'地类名称',QSDWMC:'权属单位名称',
  ZLDWMC:'坐落单位名称',YJJBNTTBMJ:'永久基本农田图斑面积（㎡）',ZZSXMC:'种植属性名称',SJNF:'数据年份',
}
export function topicFeatureRows(rows: MapFeatureAttributeRow[], role: string) {
  if (role === 'permanent') return Object.entries(permanentFields).flatMap(([key,label]) => {
    const row = rows.find(row => row.name?.toUpperCase() === key)
    return row && row.value && row.value !== '—' ? [{...row,label}] : []
  })
  const fields = ['land','changes','permanent','parcel'].includes(role) ? {...survey,...farmland} : auxiliary
  return rows.flatMap(row => {
    const name = (row.name || '').toUpperCase()
    const key = name === 'JYZTMC_1' ? 'JYZTMC' : name
    const label = fields[key]
    if (!label || !row.value || row.value === '—') return []
    return [{...row,label:areaFields.has(key) ? `${label}（㎡）` : key === 'XZDWKD' ? `${label}（米）` : label}]
  })
}
