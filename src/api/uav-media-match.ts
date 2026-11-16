import { apiClient, ApiBusinessError, parseJsonWithSafeIntegers } from './client'

export interface UavMediaMatchRequest { longitude:number; latitude:number; radiusMeters?:number; shootAfter?:string }
export interface UavMediaMatch {
  matched:boolean; mediaId?:string|number|null; fileName?:string|null; shootTime?:string|null
  longitude?:number|null; latitude?:number|null; distanceMeters?:number|null
  localFileUrl?:string|null; localThumbnailUrl?:string|null
}
export function validateUavMediaMatchRequest(input:UavMediaMatchRequest){
  if(!Number.isFinite(input.longitude)||Math.abs(input.longitude)>180||!Number.isFinite(input.latitude)||Math.abs(input.latitude)>90)throw new Error('当前图斑缺少有效经纬度，无法匹配无人机图片。')
  if(input.radiusMeters!=null&&(!Number.isFinite(input.radiusMeters)||input.radiusMeters<=0||input.radiusMeters>500))throw new Error('匹配半径须大于 0 且不超过 500 米。')
  if(input.shootAfter&&(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(input.shootAfter)||!Number.isFinite(Date.parse(input.shootAfter))))throw new Error('请选择有效的拍摄起始时间。')
}
async function imageBlob(request:()=>Promise<Blob>):Promise<Blob>{
  let data:Blob
  try{data=await request()}catch(error){
    const response=(error as {response?:{data?:unknown}})?.response?.data
    if(response instanceof Blob&&/json/i.test(response.type))await imageBlob(async()=>response)
    throw error
  }
  if(!(data instanceof Blob)||!data.size)throw new Error('后端未返回有效图片。')
  if(/json/i.test(data.type)){
    const payload=parseJsonWithSafeIntegers(await data.text()) as {code?:string;msg?:string}
    throw new ApiBusinessError(String(payload.code??'INVALID_IMAGE'),String(payload.msg||'未找到符合条件的无人机图片。'))
  }
  // Never upload a JSON/HTML error page as a successful image, even with an octet-stream header.
  const bytes=new Uint8Array(await data.slice(0,64).arrayBuffer())
  const text=new TextDecoder().decode(bytes).trimStart()
  if(text.startsWith('{')){
    const payload=parseJsonWithSafeIntegers(await data.text()) as {code?:string;msg?:string}
    throw new ApiBusinessError(String(payload.code??'INVALID_IMAGE'),String(payload.msg||'后端未返回图片。'))
  }
  const jpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255
  const png=bytes[0]===137&&text.includes('PNG')
  const gif=text.startsWith('GIF8'),webp=text.startsWith('RIFF')&&text.includes('WEBP'),bmp=text.startsWith('BM')
  const avif=text.includes('ftypavif')||text.includes('ftypavis')
  if(!jpeg&&!png&&!gif&&!webp&&!bmp&&!avif)throw new Error('返回文件不是可预览的照片，请核对素材格式。')
  const type=jpeg?'image/jpeg':png?'image/png':gif?'image/gif':webp?'image/webp':bmp?'image/bmp':'image/avif'
  return data.type===type?data:new Blob([data],{type})
}
export async function matchUavMedia(input:UavMediaMatchRequest,signal?:AbortSignal){
  validateUavMediaMatchRequest(input)
  const result=await apiClient.post<never,UavMediaMatch>('/v1/uav/media/match',input,{signal,timeout:60_000})
  if(typeof result?.matched!=='boolean')throw new Error('后端未返回有效的图片匹配结果。')
  if(result.matched&&!/^\d+$/.test(String(result.mediaId??'')))throw new Error('匹配结果缺少有效素材编号。')
  return result
}
export function matchUavMediaRaw(input:UavMediaMatchRequest,signal?:AbortSignal){
  validateUavMediaMatchRequest(input)
  return imageBlob(()=>apiClient.post<never,Blob>('/v1/uav/media/match/raw',input,{signal,responseType:'blob',timeout:60_000}))
}
/** Pin the preview/attachment to the returned media ID: a second match/raw could select a newer, different photo. */
export function getMatchedUavMediaImage(mediaId:string|number,signal?:AbortSignal){
  if(!/^\d+$/.test(String(mediaId)))throw new Error('素材编号无效。')
  return imageBlob(()=>apiClient.get<never,Blob>(`/v1/uav/media/file/${mediaId}`,{signal,responseType:'blob',timeout:60_000}))
}
