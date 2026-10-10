<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { getSceneDictionary, type SceneDictionaryItem } from '@/api/scene'
import { listEnabledMapServices, type MapServiceItem } from '@/api/map-service'
import { inspectMapService } from '@/utils/map-service-layer'
import { ApiBusinessError } from '@/api/client'
import {
  confirmRecognitionSpotUpload,
  previewRecognitionSpotUpload,
  type RecognitionAbnormalType,
  type RecognitionSpotCreateResult,
  type RecognitionSpotUploadPreviewResult,
} from '@/api/recognition-spot'
import { useUserStore } from '@/stores/user'
import SpotDateTimePicker from './SpotDateTimePicker.vue'

const emit = defineEmits<{ close: []; uploaded: [result: RecognitionSpotCreateResult] }>()
const user = useUserStore()
const scenes = ref<SceneDictionaryItem[]>([])
const imageryMapServices = ref<MapServiceItem[]>([])
const files = ref<File[]>([])
const loading = ref(true)
const previewing = ref(false)
const uploading = ref(false)
const error = ref('')
const previewResult = ref<RecognitionSpotUploadPreviewResult>()
const typeField = ref('')
const typeMappings = ref<Record<string, RecognitionAbnormalType | ''>>(Object.create(null))
const busy = computed(() => previewing.value || uploading.value)
const fileNames = computed(() => files.value.map((file) => file.name).join('、'))
const selectedField = computed(() => previewResult.value?.fields.find((field) => field.name === typeField.value))
const distinctValues = computed(() => [...new Set(selectedField.value?.distinctValues || [])])
const form = reactive({
  sceneCode: '',
  mapServiceIds: [] as Array<string | number>,
  title: '',
  description: '',
  foundTime: '',
})
const abnormalTypes: Array<{ value: RecognitionAbnormalType; label: string }> = [
  { value: 'ILLEGAL_OCCUPY', label: '违法占用' },
  { value: 'FOREST_DAMAGE', label: '林地破坏' },
  { value: 'NON_GRAIN', label: '耕地非粮化' },
  { value: 'ABANDONED', label: '土地撂荒' },
  { value: 'ILLEGAL_BUILD', label: '违法建设' },
  { value: 'OTHER', label: '其他' },
]

onMounted(async () => {
  try {
    const [sceneList, services] = await Promise.all([
      getSceneDictionary(user.organization.scenes, user.activeDeptId),
      listEnabledMapServices(),
    ])
    scenes.value = sceneList.filter((scene) => scene.enabled)
    form.sceneCode = scenes.value[0]?.code || ''
    const inspections = await Promise.allSettled(services.map((service) => inspectMapService(service)))
    imageryMapServices.value = services.filter((service, index) => {
      const inspection = inspections[index]
      if (inspection?.status === 'fulfilled') return inspection.value.isImagery
      return /IMAGE_SERVER|IMAGESERVER|WMTS|WMS|XYZ|TMS/.test(String(service.type || '').toUpperCase())
    })
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '上传所需字典读取失败。'
  } finally {
    loading.value = false
  }
})

function chooseFiles(event: Event) {
  files.value = Array.from((event.target as HTMLInputElement).files || [])
  invalidatePreview()
  error.value = ''
}
function invalidatePreview() {
  previewResult.value = undefined
  typeField.value = ''
  typeMappings.value = Object.create(null)
}
watch(() => form.sceneCode, invalidatePreview)
watch(() => user.activeDeptId, invalidatePreview)
watch(typeField, () => { typeMappings.value = Object.create(null) })

function validatePreview() {
  const suffixes = new Set(files.value.map((file) => file.name.split('.').pop()?.toLowerCase()))
  if (!files.value.length) return '请选择 Shapefile 文件组。'
  if (!suffixes.has('shp') || !suffixes.has('dbf')) return '文件组必须至少包含 .shp 和 .dbf 文件。'
  if (!form.sceneCode) return '请选择所属场景。'
  return ''
}
function validateConfirm() {
  if (!previewResult.value?.batchNo) return '请先解析并预览图斑文件。'
  if (!previewResult.value.featureCount) return '没有解析出可导入的图斑要素。'
  if (!typeField.value || !selectedField.value) return '请选择违法类型来源字段。'
  if (!distinctValues.value.length) return '所选字段没有可映射的属性值，请选择其他字段。'
  if (distinctValues.value.some((value) => !value.trim())) return '所选字段包含空值，无法完成类型映射，请选择其他字段。'
  if (distinctValues.value.some((value) => !typeMappings.value[value])) return '请为每个字段取值选择对应的异常类型。'
  if (!form.mapServiceIds.length) return '请至少选择一个参考影像地图服务。'
  return ''
}
async function previewUpload() {
  error.value = validatePreview()
  if (error.value || busy.value) return
  invalidatePreview()
  previewing.value = true
  try {
    const result = await previewRecognitionSpotUpload({
      files: files.value,
      deptId: user.activeDeptId,
      sceneCode: form.sceneCode,
    })
    if (!result?.batchNo || !Array.isArray(result.fields)) throw new Error('后端未返回有效的预览批次或属性字段。')
    previewResult.value = { ...result, preview: Array.isArray(result.preview) ? result.preview : [] }
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '图斑文件解析预览失败。'
  } finally {
    previewing.value = false
  }
}
async function confirmUpload() {
  error.value = validateConfirm()
  if (error.value || busy.value || !previewResult.value) return
  uploading.value = true
  try {
    const result = await confirmRecognitionSpotUpload({
      batchNo: previewResult.value.batchNo,
      typeField: typeField.value,
      typeMappings: distinctValues.value.map((value) => ({ value, abnormalType: typeMappings.value[value] as RecognitionAbnormalType })),
      mapServiceIds: form.mapServiceIds,
      title: form.title.trim() || undefined,
      description: form.description.trim() || undefined,
      foundTime: form.foundTime || undefined,
    })
    emit('uploaded', result)
  } catch (reason) {
    if (reason instanceof ApiBusinessError && reason.code === '10221') {
      invalidatePreview()
      error.value = '预览批次已过期，请重新解析文件后再确认。'
    } else {
      error.value = reason instanceof Error ? reason.message : '线下AI识别结果上传失败。'
    }
  } finally {
    uploading.value = false
  }
}
function formatProperty(value: unknown) {
  if (value === undefined || value === null || value === '') return '—'
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
}
function close() { if (!busy.value) emit('close') }
</script>

<template>
  <div class="upload-mask" @click.self="close">
    <section class="upload-dialog" role="dialog" aria-modal="true" aria-labelledby="spot-upload-title">
      <header><div><h2 id="spot-upload-title">线下AI识别结果上传</h2><small>先解析预览并核对类型映射，确认后才正式保存图斑</small></div><button type="button" aria-label="关闭" :disabled="busy" @click="close">×</button></header>
      <div class="upload-form">
        <div class="wide upload-file-field">
          <span>图斑文件组 *</span>
          <label class="file-picker" :class="{ selected: files.length }">
            <input type="file" multiple accept=".shp,.dbf,.shx,.prj,.cpg" :disabled="busy" @change="chooseFiles" />
            <i aria-hidden="true">⇧</i><b>选择图斑文件</b><em>{{ files.length ? `已选择 ${files.length} 个文件` : '尚未选择文件' }}</em>
          </label>
          <small v-if="files.length" class="file-names" :title="fileNames">{{ fileNames }}</small>
          <small class="file-help">请同时选择 .shp、.dbf、.shx、.prj、.cpg 文件，<strong>至少包含 .shp 和 .dbf</strong>。</small>
        </div>
        <label><span>所属场景 *</span><select v-model="form.sceneCode" :disabled="loading || busy"><option value="" disabled>请选择场景</option><option v-for="scene in scenes" :key="scene.id" :value="scene.code">{{ scene.name }}</option></select></label>
        <label><span>图斑标题</span><input v-model="form.title" class="clear-hint-on-focus" placeholder="不填则使用默认标题" /></label>
        <label><span>发现时间</span><SpotDateTimePicker v-model="form.foundTime" /></label>
        <fieldset class="wide"><legend>参考影像地图服务 *</legend><label v-for="service in imageryMapServices" :key="service.id"><input v-model="form.mapServiceIds" type="checkbox" :value="service.id" />{{ service.name }}</label><small v-if="!imageryMapServices.length">{{ loading ? '正在读取影像服务…' : '暂无已启用的影像地图服务' }}</small></fieldset>
        <label class="wide"><span>图斑描述</span><textarea v-model="form.description" class="clear-hint-on-focus" placeholder="请输入图斑情况或判定依据"></textarea></label>
        <section v-if="previewResult" class="preview-panel wide" aria-label="图斑解析预览">
          <div class="preview-heading"><div><b>解析预览</b><small>共 {{ previewResult.featureCount }} 条要素，以下最多展示前 50 条；批次有效期为 30 分钟。</small></div><span>尚未入库</span></div>
          <label class="type-field"><span>违法类型来源字段 *</span><select v-model="typeField"><option value="" disabled>请选择包含类型信息的属性字段</option><option v-for="field in previewResult.fields" :key="field.name" :value="field.name">{{ field.name }}{{ field.type ? ` · ${field.type}` : '' }}（{{ field.distinctValues?.length || 0 }} 种取值）</option></select></label>
          <div v-if="selectedField" class="mapping-panel"><strong>逐项确认类型映射</strong><small>该字段的每个不同取值都必须映射，未完成时不能入库。</small>
            <p v-if="!distinctValues.length" class="mapping-empty">此字段没有可映射的取值，请选择其他字段。</p>
            <div v-for="value in distinctValues" :key="value" class="mapping-row"><span :title="value">{{ value || '（空值）' }}</span><select v-model="typeMappings[value]" :aria-label="`${value || '空值'}的异常类型`"><option value="" disabled>请选择异常类型</option><option v-for="item in abnormalTypes" :key="item.value" :value="item.value">{{ item.label }}</option></select></div>
          </div>
          <div class="preview-table-scroll"><table><thead><tr><th>序号</th><th>几何类型</th><th>面积（㎡）</th><th v-for="field in previewResult.fields" :key="field.name">{{ field.name }}</th></tr></thead><tbody><tr v-for="item in previewResult.preview" :key="item.seq"><td>{{ item.seq }}</td><td>{{ item.geometryType || '—' }}</td><td>{{ item.areaSqm ?? '—' }}</td><td v-for="field in previewResult.fields" :key="field.name" :title="formatProperty(item.properties?.[field.name])">{{ formatProperty(item.properties?.[field.name]) }}</td></tr></tbody></table><p v-if="!previewResult.preview.length">没有可展示的要素样例。</p></div>
        </section>
        <p v-if="error" class="upload-error wide">{{ error }}</p>
      </div>
      <footer><button type="button" class="cancel" :disabled="busy" @click="close">取消</button><button v-if="previewResult" type="button" class="secondary" :disabled="busy" @click="previewUpload">重新解析</button><button v-if="!previewResult" type="button" class="primary" :disabled="loading || busy" @click="previewUpload">{{ previewing ? '正在解析…' : '解析并预览' }}</button><button v-else type="button" class="primary" :disabled="busy" @click="confirmUpload">{{ uploading ? '正在导入…' : '确认映射并导入' }}</button></footer>
    </section>
  </div>
</template>

<style scoped lang="scss">
.clear-hint-on-focus:focus::placeholder { opacity: 0; }
.upload-mask{position:fixed;z-index:3000;inset:0;display:grid;place-items:center;padding:18px;background:#071b2cb8;backdrop-filter:blur(3px)}
.upload-dialog{width:min(780px,100%);max-height:calc(100vh - 50px);display:flex;flex-direction:column;overflow:hidden;color:#29475a;background:#fff;border-radius:8px;box-shadow:0 20px 60px #001d2e66;font-size:14px}
.upload-dialog>header{flex:none;display:flex;align-items:center;justify-content:space-between;padding:18px 22px;border-bottom:1px solid #d7e4ea}.upload-dialog h2{margin:0;font-size:21px}.upload-dialog header small{display:block;margin-top:5px;color:#6f8996;font-size:13px;line-height:1.5}.upload-dialog header button{border:0;background:transparent;color:#627c89;font-size:25px;cursor:pointer}
.upload-form{min-height:0;display:grid;grid-template-columns:1fr 1fr;gap:17px 16px;overflow:auto;padding:20px 22px}.upload-form>label,.upload-file-field{min-width:0;display:flex;flex-direction:column;gap:7px}.upload-form span,.upload-form legend{color:#486779;font-size:14px;font-weight:700}.upload-form input:not([type=checkbox]):not([type=file]),.upload-form select,.upload-form textarea{width:100%;box-sizing:border-box;border:1px solid #c4d7e0;border-radius:5px;color:#365768;background:#fff;outline:none;font:inherit;font-size:14px}.upload-form input:not([type=checkbox]):not([type=file]),.upload-form select{height:40px;padding:0 11px}.upload-form select:hover,.upload-form select:focus{color:#fff;background:#075273;border-color:#1599c1}.upload-form select option{color:#365768;background:#fff}.upload-form textarea{height:84px;padding:11px;resize:vertical}.upload-form .wide{grid-column:1/-1}.upload-form small{color:#6e8897;font-size:12px;line-height:1.5}.upload-form fieldset{display:flex;flex-wrap:wrap;gap:10px 19px;margin:0;padding:13px 15px;border:1px solid #cbdde5;border-radius:6px}.upload-form fieldset label{display:flex;align-items:center;gap:7px;font-size:13px;line-height:1.5}.upload-form fieldset input{accent-color:#168eae;width:15px;height:15px}
.file-help{font-weight:400}.file-help strong{font-weight:700}
.file-picker{height:52px;display:grid;grid-template-columns:32px auto minmax(0,1fr);align-items:center;gap:10px;padding:0 13px;border:1px dashed #9ec7d7;border-radius:6px;background:#f5fbfd;cursor:pointer}.file-picker:hover,.file-picker:focus-within{border-color:#168ead;background:#eaf7fb}.file-picker.selected{border-style:solid;border-color:#74b9cb;background:#eff9f7}.file-picker input{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}.file-picker i{width:30px;height:30px;display:grid;place-items:center;color:#fff;background:#168fac;border-radius:50%;font-size:18px;font-style:normal;font-weight:800}.file-picker b{color:#176f89;font-size:14px;white-space:nowrap}.file-picker em{overflow:hidden;color:#6f8996;font-size:13px;font-style:normal;text-align:right;text-overflow:ellipsis;white-space:nowrap}.file-names{overflow:hidden;padding:7px 10px;background:#f2f7f9;text-overflow:ellipsis;white-space:nowrap}.upload-error{margin:0;padding:10px;color:#b63f4d;background:#ffedf0;font-size:13px}
.preview-panel{display:grid;gap:15px;min-width:0;padding:17px;border:1px solid #bbdce7;border-radius:7px;background:#f6fbfd}.preview-heading{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.preview-heading b,.preview-heading small{display:block}.preview-heading b{color:#1d5870;font-size:17px}.preview-heading small{margin-top:5px;line-height:1.5}.preview-heading>span{flex:none;padding:5px 9px;color:#956821;background:#fff5df;border-radius:4px;font-size:12px}.type-field{display:grid;gap:7px}.type-field select{height:40px}.mapping-panel{display:grid;gap:9px;padding:14px;border:1px solid #d1e5ec;border-radius:6px;background:#fff}.mapping-panel>strong{color:#24596e;font-size:15px}.mapping-panel>small{line-height:1.5}.mapping-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(160px,210px);align-items:center;gap:12px;padding:9px 0;border-top:1px solid #e8f0f3}.mapping-row span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500}.mapping-row select{height:40px}.mapping-empty{margin:0;color:#ad5860;font-size:13px}.preview-table-scroll{max-height:245px;overflow:auto;border:1px solid #d8e7ed;border-radius:5px;background:#fff}.preview-table-scroll table{width:100%;border-collapse:collapse;font-size:12px}.preview-table-scroll th,.preview-table-scroll td{max-width:180px;padding:9px 10px;border-bottom:1px solid #e6eef2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left}.preview-table-scroll th{position:sticky;top:0;color:#557383;background:#eaf5f9;font-weight:700}.preview-table-scroll p{margin:0;padding:12px;color:#78909c;font-size:13px}
.upload-dialog>footer{flex:none;display:flex;justify-content:flex-end;gap:9px;padding:14px 22px;border-top:1px solid #d7e4ea}.upload-dialog footer button{height:40px;padding:0 17px;border:1px solid #168aa9;border-radius:4px;color:#fff;background:#168eae;font-size:14px;font-weight:700;cursor:pointer}.upload-dialog footer button.cancel{color:#587786;background:#fff;border-color:#bfd4de}.upload-dialog footer button:disabled{opacity:.45;cursor:not-allowed}
.upload-dialog footer button.secondary{color:#147e9a;background:#edf8fb;border-color:#9acddd}
@media(max-width:640px){.upload-form{grid-template-columns:1fr}.mapping-row{grid-template-columns:1fr;gap:5px}}
</style>
