<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { coordinateSystems, fitControlPoints, georeferencePhoto } from '@/utils/image-georeference'
import type { ReviewImagery } from '@/utils/review-geotiff'
import SpotDistributionMap from '@/workspace-components/spot-identification/SpotDistributionMap.vue'
const props = defineProps<{ file: File }>()
const emit = defineEmits<{ cancel: []; skip: []; ready: [value: { file: File; imagery: ReviewImagery }] }>()
const mode = ref<'registered' | 'static'>('registered')
const zoom = ref(100)
const selectedPoint = ref(-1)
const url = URL.createObjectURL(props.file)
const width = ref(0), height = ref(0), crs = ref('EPSG:4326'), busy = ref(false), error = ref('')
const points = ref<Array<{ pixelX: number; pixelY: number; x: string; y: string }>>([])
const result = ref<Awaited<ReturnType<typeof georeferencePhoto>>>()
const geographic = computed(() => ['EPSG:4326', 'EPSG:4490'].includes(crs.value))
const controls = () => points.value.map(p => ({ ...p, x: String(p.x).trim() ? Number(p.x) : NaN, y: String(p.y).trim() ? Number(p.y) : NaN }))
const rmse = computed(() => { try { return fitControlPoints(controls(), crs.value, width.value, height.value).rmse.toFixed(2) } catch { return undefined } })
onMounted(async () => { try { const image = await createImageBitmap(props.file); width.value = image.width; height.value = image.height; image.close() } catch { error.value = '图片无法解码，请重新选择 JPG/PNG。' } })
onBeforeUnmount(() => URL.revokeObjectURL(url))
function pick(event: MouseEvent) {
  if (busy.value || !width.value) return
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  points.value.push({ pixelX: (event.clientX - rect.left) / rect.width * width.value, pixelY: (event.clientY - rect.top) / rect.height * height.value, x: '', y: '' })
  selectedPoint.value = points.value.length - 1
  result.value = undefined
}
async function convert() {
  busy.value = true; error.value = ''; result.value = undefined
  try { result.value = await georeferencePhoto(props.file, controls(), crs.value) }
  catch (reason) { error.value = reason instanceof Error ? reason.message : '配准失败' }
  finally { busy.value = false }
}
function download() { if (!result.value) return; const link = document.createElement('a'); const uri = URL.createObjectURL(result.value.file); link.href = uri; link.download = result.value.file.name; link.click(); setTimeout(() => URL.revokeObjectURL(uri), 1000) }
</script>
<template>
  <Teleport to="body"><div class="georef-mask"><section class="georef-dialog" role="dialog" aria-modal="true" aria-label="复核影像地理配准">
    <header><div><h2>复核影像处理</h2><small>{{ file.name }} · {{ width }} × {{ height }} 像素</small></div><button :disabled="busy" @click="emit('cancel')">取消</button></header>
    <div class="mode-options"><button :class="{ selected: mode === 'registered' }" :disabled="busy" @click="mode = 'registered'"><b>地理配准</b><small>选取控制点，绘制后支持三期地图联动</small></button><button :class="{ selected: mode === 'static' }" :disabled="busy" @click="mode = 'static'"><b>静态结果对比</b><small>直接绘制图片边界，不参与缩放与移动联动</small></button></div>
    <div v-if="mode === 'static'" class="static-intro"><img :src="url" alt="静态复核影像预览" /><p>无需输入经纬度，直接绘制图斑边界；此影像仅用于静态对比。</p></div>
    <p v-if="mode === 'registered'" class="instructions">① 选择坐标系　② 在图上添加控制点并填写坐标　③ 配准预览　④ 绘制边界<br />在图片中点击至少 3 个分散、不共线的已知位置，再填写其坐标。建议使用 4 个以上控制点检查误差；普通照片配准不能替代正射校正。</p>
    <div v-if="mode === 'registered'" class="georef-body"><div class="image-column"><div class="image-toolbar"><b>原始影像 · 点击添加控制点</b><label>显示比例<input v-model="zoom" type="range" min="100" max="250" step="25" />{{ zoom }}%</label></div><div class="image-scroll"><div class="pick-image" :style="{ width: `${zoom}%` }" @click="pick"><img :src="url" alt="待配准复核影像" /><span v-for="(point,index) in points" :key="index" :class="{ active: selectedPoint === index }" :style="{ left: `${point.pixelX / width * 100}%`, top: `${point.pixelY / height * 100}%` }">{{ index + 1 }}</span></div></div><div v-if="result" class="map-preview"><SpotDistributionMap :period="{ number: 3, label: '配准预览', kind: 'image', imageUrl: result.imagery.previewDataUrl, bounds: result.imagery.bounds }" /></div></div>
    <fieldset :disabled="busy"><h3>控制点设置 <small>{{ points.length }} 个点</small></h3><label>控制点坐标系<select v-model="crs" @change="result = undefined"><option v-for="system in coordinateSystems" :key="system.code" :value="system.code">{{ system.name }}</option></select></label><p>{{ geographic ? '经度在前、纬度在后，单位：度。' : '填写所选投影中的 X / Y 坐标，单位：米。' }}</p>
      <div v-for="(point,index) in points" :key="index" class="control-row" :class="{ active: selectedPoint === index }" @focusin="selectedPoint = index"><b>{{ index + 1 }}</b><small>像素 {{ point.pixelX.toFixed(1) }}, {{ point.pixelY.toFixed(1) }}</small><label>{{ geographic ? '经度' : 'X 坐标' }}<input v-model="point.x" type="number" step="any" :aria-label="`控制点${index+1}${geographic ? '经度' : 'X坐标'}`" @input="result = undefined" /></label><label>{{ geographic ? '纬度' : 'Y 坐标' }}<input v-model="point.y" type="number" step="any" :aria-label="`控制点${index+1}${geographic ? '纬度' : 'Y坐标'}`" @input="result = undefined" /></label><button @click="points.splice(index,1); result = undefined">删除</button></div>
      <div v-if="!points.length" class="empty-points"><b>还没有控制点</b><p>点击左侧图片中的已知位置，建议选择分散在四周的地物交点。</p></div><p v-if="rmse">控制点拟合误差：{{ rmse }} 米（Web Mercator）。{{ points.length === 3 ? '3 点会精确拟合，请增加控制点验证准确性。' : '' }}</p><p v-if="result">已生成 EPSG:3857 GeoTIFF，{{ result.imagery.width }} × {{ result.imagery.height }} 像素。可在左侧地图查看位置，再进入图斑绘制。</p>
    </fieldset></div><p v-if="error" class="error" role="alert">{{ error }}</p><footer><button v-if="mode === 'static'" class="primary" @click="emit('skip')">不配准，绘制边界</button><template v-else><button :disabled="busy || points.length < 3" @click="convert">{{ busy ? '正在配准…' : '配准并预览' }}</button><button v-if="result" @click="download">下载 GeoTIFF</button><button :disabled="busy || !result" @click="result && emit('ready', result)">确认位置，绘制图斑</button></template></footer>
  </section></div></Teleport>
</template>
<style scoped>
.georef-mask{position:fixed;inset:0;z-index:2200;background:#102b4566;display:grid;place-items:center;padding:20px}.georef-dialog{width:min(1200px,96vw);max-height:94vh;overflow:auto;background:#fff;border-radius:10px;padding:20px;color:#254863;font:14px 'Microsoft YaHei',sans-serif}.georef-dialog header,.georef-dialog footer{display:flex;align-items:center;justify-content:space-between;gap:10px}.georef-dialog h2{margin:0;font-size:20px}.georef-dialog p{line-height:1.7}.georef-body{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(320px,1fr);gap:20px}.image-scroll{max-height:48vh;overflow:auto}.pick-image{position:relative;cursor:crosshair}.pick-image img{width:100%;display:block}.pick-image span{position:absolute;transform:translate(-50%,-50%);border:2px solid white;background:#167be9;color:white;border-radius:50%;width:24px;height:24px;display:grid;place-items:center;pointer-events:none}.georef-dialog fieldset{min-width:0;border:0;padding:0;max-height:65vh;overflow:auto}.georef-dialog label{display:grid;gap:5px}.georef-dialog input,.georef-dialog select{min-width:0;width:100%;box-sizing:border-box;border:1px solid #c9dce8;padding:8px;border-radius:4px;color:inherit;background:#fff}.control-row{display:grid;grid-template-columns:25px 1fr 1fr auto;gap:8px;margin:12px 0;padding:10px;background:#f1f7fc;border-radius:5px}.control-row small{grid-column:2/5}.control-row label:first-of-type{grid-column:2}.georef-dialog button{padding:8px 14px;border:1px solid #bfd7e8;border-radius:4px;background:#fff;color:#207fbf;cursor:pointer}.georef-dialog button:disabled{opacity:.45;cursor:not-allowed}.georef-dialog footer{justify-content:flex-end;margin-top:16px}.georef-dialog footer button:last-child{background:#1687ef;color:white}.error{color:#bc4141}.map-preview{height:250px;margin-top:12px;border:1px solid #d8e5ed}
@media(max-width:800px){.georef-body{grid-template-columns:1fr}}
.georef-dialog{box-sizing:border-box;display:flex;flex-direction:column;max-height:94vh;overflow:hidden;padding:0;box-shadow:0 20px 70px #08243b40;font-family:inherit;font-size:14px}.georef-dialog header{padding:20px 24px;border-bottom:1px solid #e5edf3}.georef-dialog header small{display:block;margin-top:7px;color:#8295a5;font-size:12px}.mode-options{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:18px 24px 0}.mode-options button{text-align:left;display:grid;gap:8px;padding:14px 18px;border-radius:8px;color:#34556e}.mode-options small{font-size:12px;color:#7890a3}.mode-options .selected{border-color:#1687ef;background:#eff7ff;box-shadow:0 0 0 1px #1687ef}.instructions{margin:12px 24px;padding:10px 14px;background:#f3f8fd;border-radius:6px;color:#6b8499;font-size:12px}.georef-body{flex:1;min-height:0;overflow:auto;padding:0 24px;gap:18px}.image-column{min-width:0;border:1px solid #dfebf4;border-radius:8px;overflow:hidden;background:#eef3f7}.image-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px;background:#f8fbfd;border-bottom:1px solid #dfebf4;font-size:12px}.image-toolbar label{display:flex;align-items:center}.image-toolbar input{width:80px;padding:0}.image-scroll{padding:12px;box-sizing:border-box;max-height:45vh}.pick-image span.active{background:#f29d26;box-shadow:0 0 0 4px #ffa93140}.georef-dialog fieldset{padding:0 2px}.georef-dialog h3{margin:10px 0 16px;font-size:15px}.georef-dialog h3 small{font-size:12px;color:#7c93a6;font-weight:400;float:right}.control-row{border:1px solid #e0eaf2;background:#f8fbfe;align-items:center}.control-row.active{border-color:#65aaf0;background:#f0f7ff}.control-row b{border-radius:50%;width:25px;height:25px;display:grid;place-items:center;background:#1687ef;color:white}.empty-points{padding:30px 15px;text-align:center;border:1px dashed #c6d9e9;border-radius:8px;margin-top:18px;color:#6b879e}.georef-dialog footer{padding:16px 24px;border-top:1px solid #e5edf3;margin-top:16px;flex-shrink:0}.georef-dialog .error{margin:10px 24px}.static-intro{flex:1;min-height:0;overflow:auto;padding:18px 24px;text-align:center}.static-intro img{max-width:100%;max-height:48vh;border-radius:8px}.static-intro p{color:#718799;font-size:13px}.georef-dialog .primary{background:#1687ef;color:white;border-color:#1687ef}
</style>
