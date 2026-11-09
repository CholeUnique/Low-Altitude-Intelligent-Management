import type { MapFeatureAttributeRow } from './map-service-layer'
import { topicAreaAttribute } from './topic-area'

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
// 用户最新截图中永久基本农田图层红框指定的字段，按业务阅读顺序展示。
const permanentFields: Record<string,string> = {
  XZQMC:'行政区名称',YJJBNTTBBH:'永久基本农田图斑编号',DLMC:'地类名称',QSDWMC:'权属单位名称',
  ZLDWMC:'坐落单位名称',YJJBNTTBMJ:'永久基本农田图斑面积',ZZSXMC:'种植属性名称',SJNF:'数据年份',
}
const boundaryFields: Record<string,string> = {
  NAME:'行政区名称',PAC:'行政区划代码',XZQMC:'行政区名称',XZQDM:'行政区划代码',
  XZMC:'乡镇名称',XZDM:'乡镇代码',XZCMC:'行政村名称',XZCDM:'行政村代码',
  CUNMC:'村名',CUNDM:'村代码',CJQYMC:'村级行政区名称',CJQYDM:'村级行政区代码',
  XZQHMC:'行政区名称',XZQHDM:'行政区划代码',CUNNAME:'村名',VILLAGE_NAME:'村名',VILLAGENAME:'村名',
  CUN:'村名',CUN_NAME:'村名',TOWN_NAME:'乡镇名称',TOWNNAME:'乡镇名称',
  ZLDWMC:'行政区名称',ZLDWDM:'行政区划代码',
}
const fieldName = (name?:string) => (name || '').trim().split('.').pop()!.replace(/^[\["`]|[\]"`]$/g,'').toUpperCase()
function boundaryLabel(row:MapFeatureAttributeRow,layerName:string) {
  const name=fieldName(row.name)
  if (/^(?:OBJECTID(?:_\d+)?|FID|OID|SHAPE.*|GEOM(?:ETRY)?|BSM|YSDM)$/.test(name)) return ''
  const configured=boundaryFields[name]
  if (configured) {
    if (/名称|村名/.test(configured) && /村级/.test(layerName)) return '村名'
    if (/名称|乡名/.test(configured) && /乡级/.test(layerName)) return '乡镇名称'
    return row.label && row.label!==row.name ? row.label : configured
  }
  if (/行政区(?:划)?(?:名称|代码)?|行政村|村(?:居)?名(?:称)?|乡镇名称|街道名称|区划代码/.test(row.label || row.name || '')) return row.label || row.name!
  if (/(?:^|_)(?:NAME|MC)(?:_\d+)?$/.test(name)) return '行政区名称'
  return ''
}
function isPlotNumber(row:MapFeatureAttributeRow) {
  const name=fieldName(row.name)
  return ['TBBH','TBYBH','YJJBNTTBBH','YTYM','YITIANYIMA'].includes(name)||/图斑(?:预)?编号|一田一码/.test(row.label||'')
}
function featureRow(row:MapFeatureAttributeRow,label:string) {
  if (!row.value || row.value === '—') return []
  const name=fieldName(row.name)
  const area = topicAreaAttribute(name,row.label || label,row.value)
  return [{...row,label:name === 'XZDWKD' ? `${label}（米）` : label,...(area ? {label:`${label}（亩）`,value:area.value} : {})}]
}
export function topicFeatureRows(rows: MapFeatureAttributeRow[], role: string,layerName='') {
  if (role === 'boundary') return rows.flatMap(row=>{const label=boundaryLabel(row,layerName);return label?featureRow(row,label):[]})
  if (role === 'permanent') {
    const configured=Object.entries(permanentFields).flatMap(([key,label]) => {
      const row = rows.find(row => fieldName(row.name) === key)
      return row?featureRow(row,label):[]
    })
    const configuredNames=new Set(Object.keys(permanentFields))
    return [...configured,...rows.filter(row=>!configuredNames.has(fieldName(row.name))&&isPlotNumber(row)).flatMap(row=>featureRow(row,'图斑编号'))]
  }
  const fields = ['land','changes','parcel'].includes(role) ? {...survey,...farmland} : auxiliary
  return rows.flatMap(row => {
    const name = fieldName(row.name)
    const key = name === 'JYZTMC_1' ? 'JYZTMC' : name
    const configuredLabel = fields[key]
    const label = configuredLabel
      ? configuredLabel
      : isPlotNumber(row) ? '图斑编号'
      : ''
    return label?featureRow(row,label):[]
  })
}
