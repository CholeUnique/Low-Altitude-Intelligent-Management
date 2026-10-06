<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { addRecognitionSpot } from '@/api/recognition-spot'
import type { RecognitionAbnormalType, RecognitionSpotCreateResult } from '@/api/recognition-spot'
import type { MapServiceItem } from '@/api/map-service'
import type { SceneDictionaryItem } from '@/api/scene'
import SpotDateTimePicker from './SpotDateTimePicker.vue'

const props = withDefaults(defineProps<{
  sceneCode?: string
  scenes?: SceneDictionaryItem[]
  deptId?: string
  mapServices?: MapServiceItem[]
  initialMapServiceIds?: Array<string | number>
  drawingAvailable?: boolean
  drawing?: boolean
  drawingPeriod?: number
  coordinates?: Array<[number, number]>
}>(), {
  sceneCode: '', scenes: () => [], deptId: '', mapServices: () => [], initialMapServiceIds: () => [], drawingAvailable: false, drawing: false, coordinates: () => [],
})

const emit = defineEmits<{
  'start-drawing': []
  'cancel-drawing': []
  'finish-drawing': []
  'undo-point': []
  'clear-drawing': []
  created: [result: RecognitionSpotCreateResult]
}>()

const abnormalTypes: Array<{ value: RecognitionAbnormalType; label: string }> = [
  { value: 'ILLEGAL_OCCUPY', label: '违法占用' },
  { value: 'FOREST_DAMAGE', label: '林地破坏' },
  { value: 'NON_GRAIN', label: '耕地非粮化' },
  { value: 'ABANDONED', label: '土地撂荒' },
  { value: 'ILLEGAL_BUILD', label: '违法建设' },
  { value: 'OTHER', label: '其他' },
]

const abnormalType = ref<RecognitionAbnormalType | ''>('')
const selectedSceneCode = ref('')
const title = ref('')
const description = ref('')
const foundTime = ref('')
const selectedMapServiceIds = ref<Array<string | number>>([])
const submitting = ref(false)
const submitError = ref('')
const submitSuccess = ref('')

const boundaryReady = computed(() => props.coordinates.length >= 3)
const canSubmit = computed(() => Boolean(selectedSceneCode.value && abnormalType.value && title.value.trim() && boundaryReady.value
  && selectedMapServiceIds.value.length && !props.drawing && !submitting.value))
const drawStatus = computed(() => {
  if (!props.drawing && boundaryReady.value) return `已绘制 ${props.coordinates.length} 个边界点`
  if (!props.drawing) return '尚未绘制图斑边界'
  if (props.drawingPeriod) return `正在第 ${props.drawingPeriod} 期影像绘制 · ${props.coordinates.length} 个点`
  return '请在上方任一期影像窗口点选边界'
})

function geometryGeojson() {
  const ring = props.coordinates.map((point) => [...point] as [number, number])
  ring.push([...ring[0]!] as [number, number])
  return JSON.stringify({ type: 'Polygon', coordinates: [ring] })
}

function validate() {
  if (!selectedSceneCode.value) return '请选择所属场景。'
  if (!abnormalType.value) return '请选择异常类型。'
  if (!title.value.trim()) return '请填写图斑标题。'
  if (!selectedMapServiceIds.value.length) return '请至少选择一个参考影像地图服务。'
  if (!boundaryReady.value) return '请先点击“绘制”，并在影像窗口中点选至少 3 个边界点。'
  return ''
}

async function submitSpot() {
  submitError.value = validate()
  submitSuccess.value = ''
  if (submitError.value) return
  submitting.value = true
  try {
    const result = await addRecognitionSpot({
      deptId: props.deptId || undefined,
      mapServiceIds: [...new Set(selectedMapServiceIds.value.map(String))],
      sceneCode: selectedSceneCode.value,
      abnormalType: abnormalType.value as RecognitionAbnormalType,
      geometryGeojson: geometryGeojson(),
      title: title.value.trim(),
      description: description.value.trim() || undefined,
      foundTime: foundTime.value || undefined,
    })
    submitSuccess.value = result.spotNos?.length ? `新增成功：${result.spotNos.join('、')}` : `已成功新增 ${result.count || 1} 个异常图斑。`
    emit('created', result)
    title.value = ''
    abnormalType.value = ''
    selectedSceneCode.value = ''
    description.value = ''
    foundTime.value = ''
  } catch (error) {
    submitError.value = error instanceof Error ? error.message : '异常图斑新增失败。'
  } finally {
    submitting.value = false
  }
}

watch(() => props.sceneCode, () => {
  selectedSceneCode.value = ''; abnormalType.value = ''; title.value = ''; description.value = ''; foundTime.value = ''; submitError.value = ''; submitSuccess.value = ''
})
watch(() => props.scenes, (items) => {
  if (items.some((scene) => scene.code === selectedSceneCode.value)) return
  selectedSceneCode.value = ''
}, { immediate: true, deep: true })
watch([() => props.initialMapServiceIds, () => props.mapServices], () => {
  const availableIds = new Set(props.mapServices.map((service) => String(service.id)))
  const defaults = props.initialMapServiceIds.filter((id) => availableIds.has(String(id)))
  if (!selectedMapServiceIds.value.length) selectedMapServiceIds.value = [...defaults]
  else selectedMapServiceIds.value = selectedMapServiceIds.value.filter((id) => availableIds.has(String(id)))
}, { immediate: true, deep: true })
</script>

<template>
  <section class="manual-spot-panel panel">
    <div class="manual-spot-heading">新增异常图斑</div>
    <div class="manual-spot-form">
      <div class="geometry-card field--wide" :class="{ ready: boundaryReady, drawing }">
        <div><b>{{ drawStatus }}</b><small>{{ drawing ? '首次点选后将锁定对应影像窗口' : '借用当前影像窗口绘制，不关联当前选中图斑' }}</small></div>
        <button v-if="!drawing" type="button" :disabled="!drawingAvailable" @click="emit('start-drawing')">{{ boundaryReady ? '重绘' : '绘制' }}</button>
        <button v-else class="cancel" type="button" @click="emit('cancel-drawing')">取消</button>
      </div>
      <div v-if="drawing" class="drawing-actions field--wide">
        <button type="button" :disabled="!coordinates.length" @click="emit('undo-point')">撤销一点</button>
        <button type="button" :disabled="!coordinates.length" @click="emit('clear-drawing')">清空</button>
        <button class="finish" type="button" :disabled="!boundaryReady" @click="emit('finish-drawing')">完成绘制</button>
      </div>
      <label class="field field--wide"><span>所属场景 <em>*</em></span><select v-model="selectedSceneCode"><option value="" disabled>请选择所属场景</option><option v-for="scene in scenes" :key="scene.id" :value="scene.code">{{ scene.name }}</option></select></label>
      <label class="field"><span>异常类型 <em>*</em></span><select v-model="abnormalType"><option value="" disabled>请选择异常类型</option><option v-for="item in abnormalTypes" :key="item.value" :value="item.value">{{ item.label }}</option></select></label>
      <label class="field"><span>发现时间</span><SpotDateTimePicker v-model="foundTime" /></label>
      <label class="field field--wide"><span>图斑标题 <em>*</em></span><input v-model="title" maxlength="100" placeholder="请输入图斑标题" /></label>
      <fieldset class="reference-services field--wide">
        <legend>参考影像地图服务 <em>*</em></legend>
        <div v-if="mapServices.length" class="reference-service-list">
          <label v-for="service in mapServices" :key="service.id"><input v-model="selectedMapServiceIds" type="checkbox" :value="service.id" /><span :title="service.name">{{ service.name }}</span></label>
        </div>
        <small v-else>暂无已启用的影像地图服务</small>
      </fieldset>
      <label class="field field--wide"><span>图斑描述</span><textarea v-model="description" maxlength="500" placeholder="请输入图斑描述"></textarea></label>
      <p v-if="submitError" class="submit-message submit-message--error">{{ submitError }}</p>
      <p v-if="submitSuccess" class="submit-message submit-message--success">{{ submitSuccess }}</p>
      <button class="submit-button field--wide" type="button" :disabled="!canSubmit" @click="submitSpot">{{ submitting ? '正在提交…' : '新增异常图斑' }}</button>
    </div>
  </section>
</template>

<style scoped lang="scss">
.manual-spot-panel{min-height:0;display:flex;flex-direction:column;overflow:hidden;background:linear-gradient(180deg,#fff 0%,#f7fbfc 100%)}
.manual-spot-heading{flex:0 0 48px;display:flex;align-items:center;padding:0 15px;color:#173f57;border-bottom:1px solid #dce8ee;font-size:16px;font-weight:800}
.manual-spot-form{min-height:0;flex:1;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);align-content:start;gap:10px;padding:14px;overflow-x:hidden;overflow-y:auto;scrollbar-gutter:stable;scrollbar-width:thin;scrollbar-color:#8aa9b7 #edf4f7}.manual-spot-form::-webkit-scrollbar{width:8px}.manual-spot-form::-webkit-scrollbar-track{background:#edf4f7}.manual-spot-form::-webkit-scrollbar-thumb{background:#8aa9b7;border:2px solid #edf4f7;border-radius:8px}.manual-spot-form::-webkit-scrollbar-thumb:hover{background:#668b9c}.field--wide{grid-column:1/-1}.field{min-width:0;display:flex;flex-direction:column;gap:5px}.field>span{color:#536f7e;font-size:12px;font-weight:600}.field em{color:#d84a59;font-style:normal}.field input,.field select,.field textarea{width:100%;min-width:0;box-sizing:border-box;color:#294b5d;background:#fff;border:1px solid #c6d9e3;border-radius:5px;outline:none;font:inherit;font-size:12px}.field input,.field select{height:35px;padding:0 9px}.field textarea{height:58px;padding:8px 9px;resize:none;line-height:1.5}.field input:focus,.field select:focus,.field textarea:focus{border-color:#1597bc;box-shadow:0 0 0 2px #1597bc1b}.field input:disabled{color:#567180;background:#edf3f6}.field select:hover,.field select:focus{color:#fff;background:#075273}.field select option{color:#38586a;background:#fff}
.field input:focus::placeholder,.field textarea:focus::placeholder{color:transparent}
.reference-services{min-width:0;margin:0;padding:8px 9px;border:1px solid #c6d9e3;border-radius:5px}.reference-services legend{padding:0 4px;color:#536f7e;font-size:12px;font-weight:600}.reference-services em{color:#d84a59;font-style:normal}.reference-services>small{color:#7a929e;font-size:11px}.reference-service-list{max-height:76px;display:grid;grid-template-columns:1fr 1fr;gap:6px 8px;overflow:auto}.reference-service-list label{min-width:0;display:flex;align-items:center;gap:6px;color:#38596a;font-size:11px;cursor:pointer}.reference-service-list input{flex:none;margin:0}.reference-service-list span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.geometry-card{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:9px;padding:10px;background:#edf5f8;border:1px dashed #8fb9ca;border-radius:6px}.geometry-card.ready{background:#e8f7f1;border-color:#55b18f}.geometry-card.drawing{background:#e8f5fb;border-color:#1598bd;box-shadow:0 0 0 2px #1598bd12}.geometry-card b,.geometry-card small{display:block}.geometry-card b{color:#244b5e;font-size:12px}.geometry-card small{margin-top:3px;color:#718994;font-size:10px;line-height:1.35}.geometry-card button,.drawing-actions button,.submit-button{border:0;border-radius:5px;cursor:pointer}.geometry-card button{min-width:55px;padding:7px 10px;color:#fff;background:#168eb3;font-size:11px;font-weight:700}.geometry-card button.cancel{background:#6e8390}.geometry-card button:disabled,.drawing-actions button:disabled,.submit-button:disabled{cursor:not-allowed;opacity:.48}
.drawing-actions{display:flex;gap:7px}.drawing-actions button{min-height:30px;padding:0 10px;color:#466776;background:#fff;border:1px solid #bfd3dc;font-size:11px}.drawing-actions button.finish{margin-left:auto;color:#fff;background:#168eb3;border-color:#168eb3}.submit-message{grid-column:1/-1;margin:0;padding:7px 9px;border-radius:4px;font-size:11px;line-height:1.45;word-break:break-all}.submit-message--error{color:#b84450;background:#fff0f2}.submit-message--success{color:#167254;background:#e4f6ef}.submit-button{height:38px;color:#fff;background:linear-gradient(135deg,#159ac0,#08779c);box-shadow:0 4px 10px #08779c32;font-size:13px;font-weight:800}.submit-button:hover:not(:disabled){background:linear-gradient(135deg,#1089ad,#05688a)}
@media(max-width:1180px){.manual-spot-heading{font-size:14px}.manual-spot-form{grid-template-columns:1fr;padding:10px}.field--wide{grid-column:auto}.field textarea{height:52px}}
</style>
