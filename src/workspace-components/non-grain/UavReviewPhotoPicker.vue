<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { matchUavMedia, getMatchedUavMediaImage, type UavMediaMatch } from '@/api/uav-media-match'
import { matchedPhotoFile } from '@/utils/uav-review-photo'

const props=defineProps<{longitude:number;latitude:number;plotName:string;saving?:boolean;saveError?:string}>()
const emit=defineEmits<{close:[];use:[value:{file:File;match:UavMediaMatch}]}>()
const radius=ref<number|string>(20),shootAfter=ref(''),loading=ref(false),error=ref(''),empty=ref(false)
const result=ref<UavMediaMatch>(),photo=ref<File>(),preview=ref('')
let controller:AbortController|undefined,revision=0
function clearPhoto(){if(preview.value)URL.revokeObjectURL(preview.value);preview.value='';result.value=undefined;photo.value=undefined}
async function search(){
  if(props.saving)return
  const version=++revision;controller?.abort();const abort=new AbortController();controller=abort
  loading.value=true;error.value='';empty.value=false;clearPhoto()
  try{
    const input={longitude:props.longitude,latitude:props.latitude,radiusMeters:Number(radius.value),...(shootAfter.value?{shootAfter:shootAfter.value}: {})}
    const match=await matchUavMedia(input,abort.signal)
    if(abort.signal.aborted||version!==revision)return
    if(!match.matched){empty.value=true;return}
    const blob=await getMatchedUavMediaImage(match.mediaId!,abort.signal)
    if(abort.signal.aborted||version!==revision)return
    if(blob.size>100*1024*1024)throw new Error('匹配图片超过 100MB，请缩小原图后手动上传。')
    photo.value=matchedPhotoFile(blob,match);result.value=match;preview.value=URL.createObjectURL(blob)
  }catch(reason){if(!abort.signal.aborted&&version===revision)error.value=reason instanceof Error?reason.message:'图片匹配失败，请重试。'}
  finally{if(version===revision)loading.value=false}
}
onBeforeUnmount(()=>{revision++;controller?.abort();clearPhoto()})
void search()
</script>
<template>
  <Teleport to="body"><div class="uav-photo-mask" @click.self="!saving&&emit('close')">
    <section class="uav-photo-picker" role="dialog" aria-modal="true" aria-label="提取最新无人机图片">
      <header><div><h2>提取最新无人机图片</h2><p>{{ plotName }} · 按图斑中心坐标匹配</p></div><button type="button" aria-label="关闭图片匹配" :disabled="saving" @click="emit('close')">×</button></header>
      <div class="uav-photo-body">
        <form @submit.prevent="search"><label>周边半径（米）<input v-model="radius" type="number" min="1" max="500" step="any" required :disabled="saving" /></label><label>拍摄起始时间<input v-model="shootAfter" type="datetime-local" :disabled="saving" /></label><button type="submit" :disabled="loading||saving">{{ loading?'正在查找…':'重新查找' }}</button></form>
        <p class="hint">默认近 7 天、周边 20 米，优先返回拍摄时间最新且已下载的照片。确认图片内容与当前图斑相符后再用作凭证。</p>
        <div class="photo-stage" :aria-busy="loading"><p v-if="loading" role="status"><span class="spinner" />正在匹配并读取最新图片…</p><img v-else-if="preview" :src="preview" alt="匹配到的最新无人机图片" /><p v-else-if="empty">当前范围和时间内没有可用照片，可调整条件或手动上传。</p><p v-else>暂无图片</p></div>
        <dl v-if="result"><div><dt>照片名称</dt><dd>{{ result.fileName||photo?.name }}</dd></div><div><dt>拍摄时间</dt><dd>{{ result.shootTime?.replace('T',' ')||'未提供' }}</dd></div><div><dt>距图斑中心</dt><dd>{{ result.distanceMeters==null?'未提供':`${result.distanceMeters} 米` }}</dd></div></dl>
        <p v-if="error||saveError" class="error" role="alert">{{ error||saveError }}</p>
      </div>
      <footer><button type="button" :disabled="saving" @click="emit('close')">取消</button><button type="button" class="primary" :disabled="loading||saving||!photo||!result" @click="photo&&result&&emit('use',{file:photo,match:result})">{{ saving?'正在保存凭证…':'用作当前图斑凭证' }}</button></footer>
    </section>
  </div></Teleport>
</template>
<style scoped>
.uav-photo-mask{position:fixed;inset:0;z-index:2200;background:#08233999;display:grid;place-items:center;padding:20px}.uav-photo-picker{width:min(820px,100%);max-height:calc(100dvh - 40px);display:flex;flex-direction:column;background:#fff;color:#36556d;border-radius:10px;box-shadow:0 20px 70px #00172555;font:14px/1.6 var(--ui-font)}header,footer{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:16px 20px;flex:none}header{border-bottom:1px solid #dae6ee}h2{font-size:18px;margin:0}header p{margin:4px 0 0;color:#6b8496;font-size:12px}button,input{font:inherit}button{border:1px solid #bed4e4;background:#f7fbfe;color:#2673ab;border-radius:5px;padding:7px 13px;cursor:pointer}button:disabled{opacity:.5;cursor:default}header>button{border:0;background:transparent;font-size:24px}.uav-photo-body{min-height:0;overflow:auto;padding:16px 20px}form{display:flex;align-items:end;gap:12px;flex-wrap:wrap}label{display:grid;gap:5px;font-size:12px}input{padding:7px 9px;border:1px solid #c6dbe8;border-radius:5px;color:#36556d;background:#fff}.hint{font-size:12px;color:#6b8496}.photo-stage{min-height:190px;height:clamp(190px,34vh,360px);display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(0,1fr);place-items:center;background:#edf3f7;border-radius:6px;overflow:hidden;text-align:center}.photo-stage img{width:100%;height:100%;min-width:0;min-height:0;max-width:100%;max-height:100%;object-fit:contain}.photo-stage p{padding:15px;color:#637f92}dl{margin:12px 0 0;display:grid;gap:6px}dl>div{display:flex;gap:14px}dt{flex:none;color:#6b8496;min-width:80px}dd{margin:0;overflow-wrap:anywhere}.error{padding:9px 12px;border-radius:5px;background:#fff0ed;color:#b84d43}footer{justify-content:flex-end;border-top:1px solid #dae6ee}.primary{background:#1687ef;border-color:#1687ef;color:white}.spinner{display:inline-block;width:14px;height:14px;border:2px solid #bad8ed;border-top-color:#1687ef;border-radius:50%;animation:spin .8s linear infinite;margin-right:6px;vertical-align:middle}@keyframes spin{to{transform:rotate(360deg)}}
</style>
