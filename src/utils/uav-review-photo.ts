import type { UavMediaMatch } from '@/api/uav-media-match'

export interface MatchedReviewPhoto {
  mediaId:string;fileName:string;shootTime?:string;longitude?:number;latitude?:number;distanceMeters?:number
  previewDataUrl:string
}
export function matchedPhotoFile(blob:Blob,match:UavMediaMatch){
  const ext=({'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif','image/bmp':'bmp','image/avif':'avif'} as Record<string,string>)[blob.type]
  if(!ext)throw new Error('当前照片格式不支持用作复核凭证。')
  const name=String(match.fileName||`无人机图片_${match.mediaId}`).replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_').replace(/\.[^.]+$/,'').slice(0,100)
  return new File([blob],`${name}.${ext}`,{type:blob.type})
}
/** Persist a bounded preview with node data; the full-resolution file is stored as a workflow attachment. */
export async function reviewPhotoPreview(blob:Blob):Promise<string>{
  const image=await createImageBitmap(blob)
  try{
    const ratio=Math.min(1,1280/Math.max(image.width,image.height))
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*ratio));canvas.height=Math.max(1,Math.round(image.height*ratio))
    const context=canvas.getContext('2d');if(!context)throw new Error('无法生成图片预览。')
    context.drawImage(image,0,0,canvas.width,canvas.height)
    return canvas.toDataURL('image/jpeg',.8)
  }finally{image.close()}
}
export function reviewPhotoContextMatches(current:{taskId?:string;nodeId?:string;plotId?:string;editable:boolean},expected:{taskId?:string;nodeId:string;plotId:string}){
  return current.editable&&current.taskId===expected.taskId&&current.nodeId===expected.nodeId&&current.plotId===expected.plotId
}
