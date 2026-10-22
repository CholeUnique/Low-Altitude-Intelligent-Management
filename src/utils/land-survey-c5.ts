/** TD/T 1055—2019，C.5，表 C.1 / C.2（纸面 36—45 页）。RGB 为底色，图式单独绘制。 */
export interface C5Style { code: string; name: string; rgb: [number, number, number]; pattern: string; scheme: 'C1' | 'C2'; mapped: boolean }
type Row = [string, string, [number, number, number], string?]
const rows: Row[] = [
  ['0101','水田',[248,208,114],'rice'],['0102','水浇地',[252,234,158],'irrigated'],['0103','旱地',[255,251,177],'dry'],
  ['0201','果园',[214,167,201],'orchard'],['0202','茶园',[213,167,176],'tea'],['0203','橡胶园',[231,204,226],'rubber'],['0204','其他园地',[231,204,226],'orchard'],
  ['0301','乔木林地',[49,173,105],'forest'],['0302','竹林地',[49,173,105],'bamboo'],['0303','红树林地',[49,173,105],'mangrove'],['0304','森林沼泽',[49,173,105],'marsh-forest'],
  ['0305','灌木林地',[100,185,104],'shrub'],['0306','灌丛沼泽',[100,185,104],'marsh-shrub'],['0307','其他林地',[151,207,178],'forest'],
  ['0401','天然牧草地',[131,194,56],'grass'],['0402','沼泽草地',[131,194,56],'marsh-grass'],['0403','人工牧草地',[154,206,127],'planted-grass'],['0404','其他草地',[200,227,160],'dotted-grass'],
  ['05H1','商业服务业设施用地',[226,161,149],'commerce'],['0508','物流仓储用地',[197,154,140],'warehouse'],['0601','工业用地',[197,154,140],'industry'],['0602','采矿用地',[197,154,140],'mining'],['0603','盐田',[255,255,255],'salt'],
  ['0701','城镇住宅用地',[229,103,102],'cross'],['0702','农村宅基地',[236,137,138],'diagonal'],
  ['08H1','机关团体新闻出版用地',[241,165,180],'institution'],['08H2','科教文卫用地',[241,165,180],'education'],['0809','公共设施用地',[241,165,180],'public'],['0810','公园与绿地',[129,195,93],'park'],
  ['09','特殊用地',[193,114,97],'special'],['1001','铁路用地',[209,201,211],'railway'],['1002','轨道交通用地',[209,201,211],'transit'],['1003','公路用地',[210,216,201],'highway'],['1004','城镇村道路用地',[222,222,221],'street'],['1005','交通服务场站用地',[170,169,169],'station'],['1006','农村道路',[194,193,193],'rural-road'],
  ['1007','机场用地',[235,137,126],'airport'],['1008','港口码头用地',[235,137,126],'port'],['1009','管道运输用地',[235,137,126],'pipeline'],
  ['1101','河流水面',[163,214,245]],['1102','湖泊水面',[163,214,245]],['1103','水库水面',[163,214,245]],['1104','坑塘水面',[144,170,207]],['1105','沿海滩涂',[179,222,248],'tidal'],['1106','内陆滩涂',[179,222,248],'tidal'],['1107','沟渠',[160,205,240],'ditch'],['1108','沼泽地',[175,200,220],'marsh'],['1109','水工建筑用地',[230,130,100],'hydraulic'],['1110','冰川及永久积雪',[215,237,251],'snow'],
  ['1201','空闲地',[225,220,225],'vacant'],['1202','设施农用地',[220,180,130],'agriculture'],['1203','田坎',[200,182,178],'ridge'],['1204','盐碱地',[200,204,210],'grass'],['1205','沙地',[200,190,170],'sand'],['1206','裸土地',[215,200,185],'bare'],['1207','裸岩石砾地',[222,221,214],'rock'],
]
const urbanRows: Row[] = [['201','城市',[229,103,102],'cross'],['202','建制镇',[229,103,102],'cross-dense'],['203','村庄',[236,137,138],'diagonal'],['204','盐田及采矿用地',[197,154,140],'mining'],['205','特殊用地',[193,114,97],'special']]
export const C5_STYLES: C5Style[] = [...rows.map(([code,name,rgb,pattern='solid'])=>({code,name,rgb,pattern,scheme:'C1' as const,mapped:true})),...urbanRows.map(([code,name,rgb,pattern='solid'])=>({code,name,rgb,pattern,scheme:'C2' as const,mapped:true}))]
const byCode = new Map(C5_STYLES.map(item=>[item.code,item]))
export function resolveC5Style(code: unknown, name?: unknown): C5Style {
  const value = String(code ?? '').trim().toUpperCase()
  // 203 与 0203 是不同表的不同地类；保留前导零与扩展字母，禁止 parseInt / 自动补零。
  const exact = byCode.get(value)
  if (exact) return exact
  if (!value && name) {
    const label = String(name).trim().replace('公用设施用地','公共设施用地')
    const match = C5_STYLES.find(item=>item.name===label)
    if (match) return match
  }
  return {code:value || String(name || '未分类'),name:String(name || value || '未分类'),rgb:[165,173,181],pattern:'unmapped',scheme:'C1',mapped:false}
}
export function c5Color(style: C5Style) { return `rgb(${style.rgb.join(',')})` }
const patterns = new Map<string,string>()
/** 以标准 RGB 及图式生成 PNG；使用 ArcGIS picture-fill 符号，避免给每种地类随意配色。 */
export function c5Pattern(style: C5Style, fillOpacity = 1) {
  const opacity = Math.max(0, Math.min(1, fillOpacity))
  const key = `${style.code}:${style.pattern}:${opacity}`
  const cached = patterns.get(key)
  if (cached) return cached
  const canvas = document.createElement('canvas'); canvas.width=canvas.height=48
  const context = canvas.getContext('2d')
  if (!context) return ''
  context.globalAlpha=opacity
  context.fillStyle=c5Color(style);context.fillRect(0,0,48,48)
  // 图例保留标准色；地图填充透出影像，图式线条仍保持可辨识度。
  context.globalAlpha=opacity < 1 ? .7 : 1
  context.strokeStyle=/forest|bamboo|mangrove/.test(style.pattern)?'rgb(0,85,42)':/rice|dry|irrigated|orchard|tea|rubber/.test(style.pattern)?'rgb(0,160,100)':/grass|shrub|agriculture|park/.test(style.pattern)?'rgb(0,146,63)':/salt|snow|marsh|port/.test(style.pattern)?'rgb(0,147,221)':/sand|bare|rock/.test(style.pattern)?'rgb(119,88,25)':/tidal/.test(style.pattern)?'rgb(96,93,92)':'rgb(0,0,0)'
  context.fillStyle=context.strokeStyle;context.lineWidth=.8
  const line=(x:number,y:number,a:number,b:number)=>{context.beginPath();context.moveTo(x,y);context.lineTo(a,b);context.stroke()}
  const circle=(x:number,y:number,r:number,fill=false)=>{context.beginPath();context.arc(x,y,r,0,Math.PI*2);if(fill)context.fill();context.stroke()}
  const type=style.pattern
  if (type.startsWith('marsh-')) {context.save();context.strokeStyle='rgb(0,147,221)';context.setLineDash([7,4]);for(let y=6;y<48;y+=12)line(0,y,48,y);context.restore()}
  if (['diagonal','cross','cross-dense','salt','unmapped'].includes(type)) {
    if (type==='diagonal'||type.startsWith('cross')) context.strokeStyle='rgb(218,37,29)'
    for(let x=-48;x<96;x+=type==='cross-dense'||type==='salt'?8:16){line(x,48,x+48,0);if(type.startsWith('cross')||type==='salt')line(x,0,x+48,48)}
  } else if (['rice','irrigated','dry'].includes(type)) {
    for(const [x,y] of [[12,12],[36,36]] as const){
      if(type==='rice'){line(x,y-5,x,y+2);line(x-2,y,x,y+2);line(x+2,y,x,y+2)}
      else {line(x-4,y+2,x+4,y+2);line(x-2,y+2,x-2,y-3);line(x+2,y+2,x+2,y-3);if(type==='irrigated')line(x,y+2,x,y-3)}
    }
  } else if (/forest|orchard|rubber/.test(type)) {
    for(const [x,y] of [[12,12],[36,36]] as const){
      if(type==='orchard'){circle(x,y,1.1,true);line(x,y,x,y+5)}
      else if(type==='rubber'){circle(x+1,y+2,1.4);line(x-1,y+1,x-1,y-4);line(x-1,y-4,x-3,y-2);line(x-1,y-4,x+1,y-2)}
      else circle(x,y,style.code==='0307'?1.6:2.4)
    }
  } else if (/grass|shrub|bamboo|mangrove|tea/.test(type)) {
    for(const [x,y] of [[12,12],[36,36]] as const){
      if(type==='planted-grass'){line(x-3,y,x,y-3);line(x,y-3,x+3,y)}
      else if(type==='dotted-grass'){for(let i=-3;i<=3;i+=3)circle(x+i,y,.35,true)}
      else if(type.includes('shrub')){for(const dx of [-2,2])circle(x+dx,y-1,.8);circle(x,y+2,.8);line(x,y+3,x,y+5)}
      else if(type==='mangrove'){line(x,y-4,x,y+3);for(let dy=-3;dy<=1;dy+=2){line(x,y+dy,x-2,y+dy+2);line(x,y+dy,x+2,y+dy+2)}}
      else if(type==='tea'){line(x,y+2,x-3,y-2);line(x,y+2,x+3,y-2)}
      else {line(x-2,y+3,x-2,y-3);line(x+2,y+3,x+2,y-3);if(type==='bamboo'){line(x-4,y+3,x+4,y+3);line(x-2,y-2,x-3,y-3)}}
    }
  } else if (['sand','tidal','snow','bare','rock'].includes(type)) {
    for(let y=8;y<48;y+=16)for(let x=8;x<48;x+=16){if(type==='rock'||type==='bare'){context.beginPath();context.moveTo(x,y-2);context.lineTo(x-2,y+2);context.lineTo(x+2,y+2);context.closePath();context.fill()}else context.fillRect(x,y,1,1)}
  } else if (type==='marsh') {for(let y=10;y<48;y+=16)for(let x=8;x<48;x+=16)line(x,y,x+6,y)}
  else if (type!=='solid') {
    // 规范的面状地物符号为圆框内符号，不能用 emoji（其外形/颜色取决于操作系统）。
    if(type==='special'){context.fillRect(23,19,2,8);context.fillRect(20,25,8,3)}
    else if(type==='agriculture'){
      context.save();context.strokeStyle='rgb(96,93,92)';context.fillStyle='#fff';context.beginPath();context.moveTo(18,26);context.lineTo(18,22);context.lineTo(24,18);context.lineTo(30,22);context.lineTo(30,26);context.closePath();context.fill();context.stroke();context.restore();line(24,25,24,20);line(24,25,21,22);line(24,25,27,22)
    } else {
      const ink=context.strokeStyle;context.fillStyle='#fff';circle(24,24,6,true);context.fillStyle=ink
      if(type==='commerce'){context.beginPath();context.moveTo(24,20);context.lineTo(28,24);context.lineTo(24,28);context.lineTo(20,24);context.closePath();context.stroke()}
      else if(type==='warehouse'){context.strokeRect(21,23,6,5);line(19,23,24,19);line(24,19,29,23);line(19,23,29,23)}
      else if(type==='public'||type==='park'){context.fillRect(21,22,6,4)}
      else if(type==='education'||type==='highway'){for(let a=0;a<3;a++){const angle=a*Math.PI*2/3;line(24,24,24+5*Math.sin(angle),24+5*Math.cos(angle))}}
      else if(type==='hydraulic'){line(18,22,30,22);line(22,22,22,29);line(26,22,26,29)}
      else if(type==='pipeline'){context.fillStyle='rgb(255,250,136)';context.fillRect(19,22,10,4);line(19,22,29,22);line(19,26,29,26)}
      else if(type==='ditch'){context.beginPath();context.moveTo(19,24);context.bezierCurveTo(22,18,26,30,29,24);context.stroke()}
      else {
        const symbols:Record<string,string>={industry:'⚙',mining:'⚒',institution:'☆',railway:'Ω',transit:'G',street:'⇄',station:'服','rural-road':'农',airport:'✈',port:'⚓',vacant:'空',ridge:'K'}
        context.font='10px "Segoe UI Symbol", "Microsoft YaHei", sans-serif';context.textAlign='center';context.textBaseline='middle';context.fillText(symbols[type] || '',24,24)
      }
    }
  }
  const url=canvas.toDataURL('image/png');patterns.set(key,url);return url
}
export function c5Symbol(style: C5Style) {
  return {type:'esriPFS',imageData:c5Pattern(style, .36).split(',')[1],contentType:'image/png',width:36,height:36,xscale:1,yscale:1,
    outline:{type:'esriSLS',style:'esriSLSSolid',color:[96,93,92,255],width:.34}}
}
