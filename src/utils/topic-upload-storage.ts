import { assertTopicGeometry, uploadIsPolygon, validateUploadName, type UploadedTopicLayer } from './topic-upload'

let database:Promise<IDBDatabase>|undefined
function openDatabase() {
  if(database)return database
  database=new Promise<IDBDatabase>((resolve,reject)=>{
    const request=indexedDB.open('geographic-topic-uploads',1)
    request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('topics'))request.result.createObjectStore('topics',{keyPath:'scope'})}
    request.onsuccess=()=>{request.result.onversionchange=()=>{request.result.close();database=undefined};resolve(request.result)}
    request.onerror=()=>reject(request.error||new Error('无法打开本机图层存储'))
    request.onblocked=()=>reject(new Error('本机图层存储正被其他窗口升级，请关闭旧窗口后重试'))
  }).catch(error=>{database=undefined;throw error})
  return database
}
export async function readTopicUploads(scope:string):Promise<UploadedTopicLayer[]> {
  const db=await openDatabase()
  const record=await new Promise<{layers?:UploadedTopicLayer[]}|undefined>((resolve,reject)=>{
    const transaction=db.transaction('topics','readonly'),request=transaction.objectStore('topics').get(scope)
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)
  })
  if(!record)return []
  if(!Array.isArray(record.layers)||record.layers.length>10)throw new Error('本机图层缓存格式无效')
  return record.layers.map(layer=>{
    if(typeof layer.id!=='string'||!/^upload-[\w-]+$/.test(layer.id)||!/^#[\da-f]{6}$/i.test(layer.color))throw new Error('本机图层缓存字段无效')
    assertTopicGeometry(layer.data)
    return {...layer,name:validateUploadName(layer.name),selected:layer.selected===true,mode:layer.mode==='boundary'?'boundary':'filled',analyzable:uploadIsPolygon(layer.data)}
  })
}
export async function writeTopicUploads(scope:string,layers:UploadedTopicLayer[]) {
  const db=await openDatabase()
  // JSON removes Vue proxies and normalizes DBF dates before structured cloning.
  const snapshot=JSON.parse(JSON.stringify({scope,layers})) as {scope:string;layers:UploadedTopicLayer[]}
  await new Promise<void>((resolve,reject)=>{
    const transaction=db.transaction('topics','readwrite')
    transaction.objectStore('topics').put(snapshot)
    transaction.oncomplete=()=>resolve();transaction.onerror=()=>reject(transaction.error);transaction.onabort=()=>reject(transaction.error||new Error('本机图层保存已中止'))
  })
}
