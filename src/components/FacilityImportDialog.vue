<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { listEnabledMapServices, type MapServiceItem } from '@/api/map-service'
import { expandMapServiceSublayers } from '@/utils/map-service-layer'
import { importFacilityLayers, previewFacilityImport, type FacilityImportQuery, type FacilityImportReport } from '@/api/facility'

const props = defineProps<{ deptId: string; canImport: boolean }>()
const emit = defineEmits<{ close: []; imported: [] }>()
const services = ref<MapServiceItem[]>([]), layers = ref<MapServiceItem[]>([]), serviceId = ref(''), selected = ref<number[]>([])
const nameField = ref(''), projectNameField = ref(''), villageField = ref(''), typeField = ref('')
const busy = ref(false), error = ref(''), report = ref<FacilityImportReport>(), submitted = ref(false)
const previewQuery = ref<FacilityImportQuery>()
const source = computed(() => services.value.find(item => String(item.id) === serviceId.value))
let layerVersion = 0
function clearReport() { report.value = undefined; previewQuery.value = undefined; submitted.value = false }
watch([serviceId, selected, nameField, projectNameField, villageField, typeField], clearReport, { deep: true })
onMounted(async () => { try { services.value = await listEnabledMapServices(props.deptId) } catch (e) { error.value = e instanceof Error ? e.message : '地图服务读取失败' } })
watch(serviceId, async () => {
  const version = ++layerVersion
  selected.value = []; layers.value = []; error.value = ''
  if (!source.value) return
  try {
    const result = await expandMapServiceSublayers(source.value, true)
    if (version !== layerVersion) return
    layers.value = result.filter(item => item.arcGisLayerId !== undefined)
    selected.value = layers.value.filter(item => ['Point_项目工程设施', '项目工程设施', '关联工程设施'].includes(item.name)).map(item => item.arcGisLayerId!)
  } catch (e) { if (version === layerVersion) error.value = e instanceof Error ? e.message : '图层读取失败' }
})
async function preview() {
  if (!source.value || !selected.value.length) { error.value = '请选择地图服务和至少一个图层'; return }
  const query: FacilityImportQuery = { deptId: props.deptId, serviceId: source.value.id, layerIds: [...selected.value], ...(nameField.value.trim() ? { nameField: nameField.value.trim() } : {}), ...(projectNameField.value.trim() ? { projectNameField: projectNameField.value.trim() } : {}), ...(villageField.value.trim() ? { villageField: villageField.value.trim() } : {}), ...(typeField.value.trim() ? { typeField: typeField.value.trim() } : {}) }
  clearReport(); error.value = ''; busy.value = true
  try { report.value = await previewFacilityImport(query); previewQuery.value = query } catch (e) { error.value = e instanceof Error ? e.message : '预览失败' } finally { busy.value = false }
}
async function executeImport() {
  if (!props.canImport || !previewQuery.value || submitted.value || busy.value) return
  if (!window.confirm('确认根据当前预览结果导入设施台账？已有同源记录可能被更新。')) return
  busy.value = true; error.value = ''
  try { report.value = await importFacilityLayers(previewQuery.value); submitted.value = true; previewQuery.value = undefined; emit('imported') } catch (e) { error.value = e instanceof Error ? e.message : '导入失败，请核对结果后重试' } finally { busy.value = false }
}
</script>
<template>
  <div class="backdrop" @click.self="!busy && emit('close')"><section class="dialog" role="dialog" aria-modal="true" aria-labelledby="import-title"><header><div><h2 id="import-title">导入设施图层</h2><p>先预览映射结果，再确认导入设施台账</p></div><button type="button" :disabled="busy" aria-label="关闭" @click="emit('close')">×</button></header><main>
    <label>地图服务<select v-model="serviceId" :disabled="busy"><option value="">请选择地图服务</option><option v-for="item in services" :key="String(item.id)" :value="String(item.id)">{{ item.name }}</option></select></label>
    <fieldset :disabled="busy"><legend>选择图层</legend><label v-for="item in layers" :key="item.arcGisLayerId" class="check"><input v-model="selected" type="checkbox" :value="item.arcGisLayerId" />{{ item.name }}（{{ item.arcGisLayerId }}）</label><p v-if="serviceId && !layers.length">该服务没有可选择的图层，或图层尚在加载。</p></fieldset>
    <details><summary>字段名覆盖（选填）</summary><div class="fields"><label>设施名称<input v-model="nameField" :disabled="busy" placeholder="自动识别" /></label><label>项目名称<input v-model="projectNameField" :disabled="busy" placeholder="自动识别" /></label><label>行政村<input v-model="villageField" :disabled="busy" placeholder="自动识别" /></label><label>设施类型<input v-model="typeField" :disabled="busy" placeholder="自动识别" /></label></div></details>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <section v-if="report" class="report"><h3>{{ submitted ? '导入结果' : '预览报告' }}</h3><p>新增 {{ report.inserted }} · 更新 {{ report.updated }} · 跳过 {{ report.skipped }} · 未识别类型 {{ report.typeUnrecognized }}</p><div v-for="layer in report.layers || []" :key="layer.layerId" class="report-layer"><strong>{{ layer.layerName }}（{{ layer.layerId }}）</strong><p>读取 {{ layer.fetched }} · 新增 {{ layer.inserted }} · 更新 {{ layer.updated }} · 跳过 {{ layer.skipped }}</p><ul v-if="layer.unrecognizedTypes?.length"><li v-for="(item,index) in layer.unrecognizedTypes" :key="index">要素 {{ item.featureId }}：{{ item.rawType || '空' }}</li></ul></div><details v-if="report.suspectDuplicates?.length"><summary>疑似重复（{{ report.suspectDuplicates.length }} 对）</summary><ul><li v-for="(item,index) in report.suspectDuplicates" :key="index">{{ item.nameA }}（{{ item.sourceA }}） / {{ item.nameB }}（{{ item.sourceB }}） — {{ item.reason }}</li></ul></details></section>
  </main><footer><button type="button" :disabled="busy" @click="emit('close')">关闭</button><button type="button" :disabled="busy || !selected.length" @click="preview">{{ busy ? '处理中…' : '预览导入' }}</button><button v-if="canImport" type="button" :disabled="busy || !previewQuery || submitted" @click="executeImport">确认导入</button></footer></section></div>
</template>
<style scoped>
.backdrop{position:fixed;inset:0;z-index:3000;display:grid;place-items:center;background:#00101ac9}.dialog{width:min(700px,94vw);max-height:90vh;display:flex;flex-direction:column;background:#102e40;border:1px solid #39758a;border-radius:8px;color:#d9edf2}.dialog header,.dialog footer{display:flex;align-items:center;justify-content:space-between;padding:16px;border-bottom:1px solid #315467}.dialog h2{font-size:18px;margin:0}.dialog p{font-size:12px;color:#a8cbd4;margin:6px 0}.dialog header button{font-size:22px}.dialog main{overflow:auto;padding:16px;display:grid;gap:14px}.dialog label:not(.check){display:grid;gap:7px;font-size:12px}.dialog select,.dialog input:not([type=checkbox]){width:100%;box-sizing:border-box;background:#092333;color:#d9edf2;border:1px solid #416a7a;border-radius:4px;padding:8px}.dialog fieldset{border:1px solid #315467;border-radius:4px}.check{display:block;padding:5px;font-size:12px}.check input{margin-right:8px}.fields{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px}.report{background:#0a2535;border:1px solid #315467;padding:12px;border-radius:4px}.report h3{margin:0;font-size:14px}.report-layer{border-top:1px solid #315467;padding-top:8px;margin-top:8px;font-size:12px}.report ul{max-height:140px;overflow:auto;font-size:12px}.error{color:#ffaaa0!important}.dialog footer{justify-content:flex-end;gap:8px;border-top:1px solid #315467;border-bottom:0}.dialog button{background:#19536a;color:#e8f8fa;border:1px solid #4b879a;border-radius:4px;padding:7px 12px;cursor:pointer}.dialog button:disabled{opacity:.5;cursor:default}
</style>
