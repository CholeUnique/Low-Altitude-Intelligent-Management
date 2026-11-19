export interface AdministrativeChoice {value:string;name:string;checked:boolean;clipping?:boolean;mode?:'filled'|'boundary';searchMatch?:boolean;parentCode?:string;parentName?:string;geometries?:{rings?:number[][][]}[]}
function contains(rings:number[][][],point:number[]){
  let inside=false
  for(const ring of rings)for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const a=ring[i]!,b=ring[j]!
    if((a[1]!>point[1]!)!==(b[1]!>point[1]!)&&point[0]!<(b[0]!-a[0]!)*(point[1]!-a[1]!)/(b[1]!-a[1]!)+a[0]!)inside=!inside
  }
  return inside
}
/** 优先使用区划代码/明确乡镇名称；无代码时才按真实几何归属，绝不按列表顺序配对。 */
export function administrativeTree<T extends AdministrativeChoice>(towns:T[],villages:T[]){
  const groups=towns.map(town=>({town,villages:[] as T[]})),unassigned:T[]=[]
  for(const village of villages){
    const code=village.value.startsWith('code:')?village.value.slice(5):''
    let group=groups.find(({town})=>{
      const parent=town.value.startsWith('code:')?town.value.slice(5):''
      return !!parent&&(village.parentCode===parent||(code.length>parent.length&&code.startsWith(parent)))||!!village.parentName&&village.parentName===town.name
    })
    if(!group){
      const points=village.geometries?.flatMap(geometry=>geometry.rings?.flatMap(ring=>ring.slice(0,1))||[])||[]
      const candidates=groups.filter(({town})=>points.some(point=>town.geometries?.some(geometry=>contains(geometry.rings||[],point))))
      if(candidates.length===1)group=candidates[0]
    }
    if(group)group.villages.push(village);else unassigned.push(village)
  }
  return {groups,unassigned}
}
