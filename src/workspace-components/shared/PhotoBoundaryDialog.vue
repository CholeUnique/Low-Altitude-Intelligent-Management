<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { reviewBoundary } from '@/utils/review-geotiff'
const props = defineProps<{ file: File }>()
const emit = defineEmits<{ cancel: []; ready: [value: { file: File; previewDataUrl: string; width: number; height: number; boundaryPixels: [number, number][] }] }>()
const url = URL.createObjectURL(props.file)
const image = ref<HTMLImageElement>()
const points = ref<[number, number][]>([])
const finished = ref(false)
const busy = ref(false)
const error = ref('')
onBeforeUnmount(() => URL.revokeObjectURL(url))
function pick(event: MouseEvent) {
  if (finished.value) return
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  points.value.push([(event.clientX - rect.left) / rect.width * 1000, (event.clientY - rect.top) / rect.height * 1000])
}
function finish() {
  try {
    reviewBoundary(points.value, [0, 0, 1000, 1000])
    finished.value = true; error.value = ''
  } catch (reason) { error.value = reason instanceof Error ? reason.message : '绘制边界无效' }
}
async function ready() {
  if (!finished.value || !image.value) return
  if (!image.value.naturalWidth || !image.value.naturalHeight) { error.value = '图片尚未加载完成或格式损坏，请重新选择。'; return }
  busy.value = true
  try {
    const previewDataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('图片读取失败')); reader.readAsDataURL(props.file) })
    const width = image.value.naturalWidth, height = image.value.naturalHeight
    emit('ready', { file: props.file, previewDataUrl, width, height, boundaryPixels: points.value.map(p => [p[0] / 1000 * width, p[1] / 1000 * height]) })
  } catch (reason) { error.value = reason instanceof Error ? reason.message : '图片读取失败' }
  finally { busy.value = false }
}
</script>
<template>
  <Teleport to="body"><div class="photo-boundary-mask"><section role="dialog" aria-modal="true" aria-label="静态影像边界绘制"><header><div><h2>绘制复核边界</h2><p>{{ file.name }} · 静态对比</p></div><button :disabled="busy" @click="emit('cancel')">取消</button></header><p class="guide">沿图斑边界依次点击，右键结束绘制。此图片不包含地理坐标，不参与地图联动。</p><div class="canvas"><div class="photo" @click="pick" @contextmenu.prevent="finish"><img ref="image" :src="url" alt="待绘制的复核图片" /><svg viewBox="0 0 1000 1000" preserveAspectRatio="none"><polygon v-if="finished" :points="points.map(p => p.join(',')).join(' ')" /><polyline v-else :points="points.map(p => p.join(',')).join(' ')" /><circle v-for="(p,i) in points" :key="i" :cx="p[0]" :cy="p[1]" r="5" /></svg></div></div><p v-if="error" role="alert" class="error">{{ error }}</p><footer><span>已绘制 {{ points.length }} 个边界点</span><button :disabled="busy" @click="points = []; finished = false; error = ''">重新绘制</button><button :disabled="busy || finished || points.length < 3" @click="finish">完成绘制</button><button class="primary" :disabled="busy || !finished" @click="ready">确认并上传</button></footer></section></div></Teleport>
</template>
<style scoped>
.photo-boundary-mask{position:fixed;inset:0;z-index:2300;display:grid;place-items:center;padding:24px;background:#102b4580}.photo-boundary-mask section{width:min(1160px,96vw);height:90vh;display:flex;flex-direction:column;gap:14px;padding:24px;background:white;box-sizing:border-box;border-radius:12px;color:#254863}.photo-boundary-mask header,.photo-boundary-mask footer{display:flex;align-items:center;gap:12px}.photo-boundary-mask header{justify-content:space-between}.photo-boundary-mask h2{margin:0;font-size:20px}.photo-boundary-mask p{margin:5px 0;font-size:13px;color:#74899a}.guide{padding:12px;background:#eef6ff;border-radius:6px}.canvas{flex:1;min-height:0;overflow:auto;display:grid;place-items:center;background:#eaf0f5}.photo{position:relative;max-width:100%;cursor:crosshair;line-height:0}.photo img{display:block;max-width:100%;max-height:60vh}.photo svg{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}.photo polygon{fill:#ffcf3930;stroke:#ffc529;stroke-width:3;vector-effect:non-scaling-stroke}.photo polyline{fill:none;stroke:#ffc529;stroke-width:3}.photo circle{fill:white;stroke:#ffc529;stroke-width:2}.photo-boundary-mask button{padding:9px 16px;background:white;border:1px solid #cbdce9;border-radius:6px;color:#2875b0;cursor:pointer}.photo-boundary-mask button:disabled{opacity:.45;cursor:not-allowed}.photo-boundary-mask .primary{background:#1687ef;color:white;border-color:#1687ef}.photo-boundary-mask footer span{margin-right:auto;color:#718799;font-size:13px}.photo-boundary-mask .error{color:#bc4141}
</style>
