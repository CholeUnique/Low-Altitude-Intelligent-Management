const normalize=(value:unknown)=>String(value??'').trim().toLocaleLowerCase()
export function matchesTopicText(keyword:string,...values:unknown[]){const term=normalize(keyword);return !term||values.some(value=>normalize(value).includes(term))}
export function matchesTopicCategory(keyword:string,category:{name:string;value:string}){return matchesTopicText(keyword,category.name,category.value)}
export function topicSearchCategories<T extends {name:string;value:string}>(keyword:string,names:string[],categories:T[]):T[]{return matchesTopicText(keyword,...names)?categories:categories.filter(category=>matchesTopicCategory(keyword,category))}
export function matchesTopicProperties(keyword:string,properties:Record<string,unknown>|null|undefined){return !!properties&&matchesTopicText(keyword,...Object.values(properties))}
export interface TopicPropertySearchRow { text:string;category:string }
export function indexTopicProperties(features:{attributes?:Record<string,unknown>}[],categoryField:string,administrativeValues?:{value:string;objectIds?:(string|number)[]}[],objectIdField='OBJECTID'):TopicPropertySearchRow[]{
  const membership=new Map<string,string>()
  administrativeValues?.forEach(value=>value.objectIds?.forEach(id=>membership.set(String(id),value.value)))
  return features.map(feature=>{
    const attributes=feature.attributes||{}
    return {text:Object.values(attributes).filter(value=>value!=null).map(normalize).join('\n'),category:administrativeValues?membership.get(String(attributes[objectIdField]))||'':String(attributes[categoryField]??'').trim()}
  })
}
export function matchingTopicPropertyRows(keyword:string,rows:TopicPropertySearchRow[]){const term=normalize(keyword);return term?rows.filter(row=>row.text.includes(term)):rows}
