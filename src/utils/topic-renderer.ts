import { c5Symbol, type C5Style } from './land-survey-c5'

export type TopicDisplayMode = 'filled' | 'boundary'
interface RenderCategory { value: string; name: string; color?: string; style?: C5Style; mode?: TopicDisplayMode }
function channels(color = '#56bccc') {
  const match = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(color)
  return match ? match.slice(1).map(value => parseInt(value,16)) : [86,188,204]
}
/** 两种模式共用分类颜色；边界模式不以白色/透明填充盖住下层影像。 */
export function createTopicRenderer(field: string, categories: RenderCategory[], geometryType: string | undefined, baseColor: string | undefined, mode: TopicDisplayMode) {
  const symbol = (category?: RenderCategory) => {
    const categoryMode = category?.mode ?? mode
    if (category?.style && geometryType === 'esriGeometryPolygon') return c5Symbol(category.style,categoryMode)
    const rgb = category?.style?.rgb || channels(category?.color || baseColor)
    const outline = {type:'esriSLS',style:'esriSLSSolid',color:[...rgb,255],width:categoryMode === 'boundary' ? 2.4 : 1.2}
    if (geometryType === 'esriGeometryPolyline') return {...outline,width:categoryMode === 'boundary' ? 3 : 2}
    if (geometryType === 'esriGeometryPoint' || geometryType === 'esriGeometryMultipoint') return {
      type:'esriSMS',style:'esriSMSCircle',size:9,color:[...rgb,categoryMode === 'filled' ? 255 : 0],outline,
    }
    return {type:'esriSFS',style:categoryMode === 'filled' ? 'esriSFSSolid' : 'esriSFSNull',color:[...rgb,categoryMode === 'filled' ? 255 : 0],outline}
  }
  return field && categories.length ? {
    type:'uniqueValue',field1:field,fieldDelimiter:',',defaultSymbol:symbol(),
    uniqueValueInfos:categories.map(category => ({value:category.value,label:category.name,symbol:symbol(category)})),
  } : {type:'simple',symbol:symbol()}
}
