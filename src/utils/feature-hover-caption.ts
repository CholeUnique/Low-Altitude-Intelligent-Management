export interface HoverField {name?:string;alias?:string}
export interface FeatureHoverCaption {label:string;value:string}
const typeFields=['地物类型','地物类型名称','地块类型','地类名称','DLMC','DKLXMC','DKLX','TYPE_NAME','TYPENAME','FEATURE_TYPE','TYPE','LXMC','LX','变化类','变化类型','项目类','XMLX','设施类型','设施类别','SSFLMC','SSLXMC','analysisMembership']
const nameFields=['地物名称','地块名称','DKMC','工程名称','GCMC','项目名称','SSXMMC','XMMC','名称','NAME','MC','经营主体名称','JYZTMC_1','行政区名称','XZQMC','村名','行政村名称','乡镇名称','坐落单位名称','XZMC','XZCMC','CUNMC','CJQYMC','ZLDWMC']
const aliases:Record<string,string>={DLMC:'地类名称',DKLXMC:'地块类型',DKLX:'地块类型',TYPE_NAME:'地物类型',TYPENAME:'地物类型',FEATURE_TYPE:'地物类型',TYPE:'地物类型',LXMC:'类型名称',LX:'类型',XMLX:'项目类型',项目类:'项目类型',GCMC:'工程名称',XMMC:'项目名称',SSXMMC:'所属项目名称',DKMC:'地块名称',NAME:'名称',MC:'名称',JYZTMC_1:'经营主体名称',XZQMC:'行政区名称',analysisMembership:'分析归属'}
function text(value:unknown){if(typeof value!=='string'&&typeof value!=='number')return '';const result=String(value).trim();return /^(?:null|undefined|nan|—|--|<null>)?$/i.test(result)?'':result}
/** 逐要素判断空值：存在类型字段但当前值为空时，仍回退到名称。 */
export function featureHoverCaption(properties:Record<string,unknown>|null|undefined,fields:HoverField[]=[],fallbackName='',displayField?:string):FeatureHoverCaption {
  const values=properties||{},metadata=Object.keys(values).map(name=>fields.find(field=>field.name===name)||{name})
  const find=(candidates:string[])=>{
    for(const candidate of candidates){const key=candidate.toLocaleUpperCase();for(const field of metadata){if(field.name&&(field.name.toLocaleUpperCase()===key||field.alias?.toLocaleUpperCase()===key)){const value=text(values[field.name]);if(value)return {label:aliases[field.name]||aliases[field.name.toLocaleUpperCase()]||field.alias||field.name,value}}}}
  }
  const displayName=displayField&&!/^(?:OBJECTID|FID|OID|BSM|SHAPE(?:_.*)?)$/i.test(displayField)?[displayField]:[]
  return find(typeFields)||find(nameFields)||find(displayName)||{label:'名称',value:fallbackName||'未命名地物'}
}
