import { parseTopicShapefile, type ShpPayload } from '@/utils/topic-upload'

self.onmessage=(event:MessageEvent<ShpPayload>)=>{
  try{self.postMessage({ok:true,data:parseTopicShapefile(event.data)})}
  catch(error){self.postMessage({ok:false,error:error instanceof Error?error.message:'SHP 解析失败'})}
}
