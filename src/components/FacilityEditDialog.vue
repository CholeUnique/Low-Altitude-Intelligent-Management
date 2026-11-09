<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { addFacility, updateFacility, type FacilityFormInput, type FacilityOption, type FacilityRecord } from '@/api/facility'
import { getMetadataOptions, type MetadataOption } from '@/api/metadata'

const props = defineProps<{ deptId: string; record?: FacilityRecord; typeOptions: FacilityOption[] }>()
const emit = defineEmits<{ close: []; saved: [] }>()

const editing = computed(() => Boolean(props.record?.id))
const busy = ref(false)
const error = ref('')
const form = reactive<FacilityFormInput>({
  deptId: props.deptId,
  facilityNo: props.record?.facilityNo || '',
  name: props.record?.name || '',
  facilityType: props.record?.facilityType || '',
  bizStatus: props.record?.bizStatus || 'NORMAL',
  regionCode: props.record?.regionCode || '',
  villageName: props.record?.villageName || '',
  projectName: props.record?.projectName || '',
  remark: props.record?.remark || '',
  geometryJson: props.record?.geometryJson || '',
})

function message(e: unknown) { return e instanceof Error ? e.message : '保存失败，请稍后重试' }
function normalizeOptional(value: string | undefined) { return value?.trim() || undefined }

const GEOJSON_TYPES = ['Point', 'LineString', 'Polygon', 'MultiPoint', 'MultiLineString', 'MultiPolygon']
/** 后端要求 geometryType 与 geometryJson 成对提供；这里统一解析出裸几何并推导类型，兼容 Feature 包装。 */
function normalizeGeometry(text: string) {
  let parsed: any
  try { parsed = JSON.parse(text) } catch { throw new Error('设施几何信息必须是有效 JSON') }
  const geometry = parsed?.type === 'Feature' ? parsed.geometry : parsed
  if (parsed?.type === 'FeatureCollection') throw new Error('请只填写单个设施的几何，不要粘贴 FeatureCollection')
  const geometryType = GEOJSON_TYPES.find(item => item.toLowerCase() === String(geometry?.type || '').toLowerCase())
  if (!geometryType) throw new Error('设施 GeoJSON 需为 Point、LineString、Polygon 等单个几何对象（支持 Feature 包装）')
  if (!geometry || typeof geometry !== 'object' || !('coordinates' in geometry)) throw new Error('设施 GeoJSON 缺少 coordinates 坐标数组')
  return { geometryType, geometryJson: JSON.stringify(geometry) }
}

const regionOptions = ref<Array<{ code: string; label: string }>>([])
const regionLoading = ref(true)
const regionError = ref('')
/** ADMIN_REGION 是三级树，这里按层级缩进拍平成下拉选项，提交的仍是 adcode。 */
function flattenRegions(nodes: MetadataOption[], depth = 0): Array<{ code: string; label: string }> {
  return nodes.flatMap((node) => {
    const code = String(node.code || '').trim()
    const children = Array.isArray(node.children) ? node.children : []
    return [
      ...(code ? [{ code, label: `${'　'.repeat(depth)}${node.name || code}` }] : []),
      ...flattenRegions(children, depth + (code ? 1 : 0)),
    ]
  })
}
onMounted(async () => {
  try {
    const options = await getMetadataOptions('ADMIN_REGION')
    regionOptions.value = flattenRegions(options)
    if (!regionOptions.value.length) regionError.value = '区划字典（ADMIN_REGION）暂无可选项，可先留空。'
  } catch {
    regionError.value = '行政区划加载失败，可先留空稍后补充。'
  } finally { regionLoading.value = false }
})

async function submit() {
  if (busy.value) return
  if (!form.name.trim()) { error.value = '请输入设施名称'; return }
  if (!form.facilityType) { error.value = '请选择设施类型'; return }
  let geometry: { geometryType: string; geometryJson: string } | undefined
  if (form.geometryJson?.trim()) {
    try { geometry = normalizeGeometry(form.geometryJson) } catch (e) { error.value = message(e); return }
  }
  busy.value = true; error.value = ''
  const payload: FacilityFormInput = {
    deptId: props.deptId,
    facilityNo: form.facilityNo.trim(),
    name: form.name.trim(),
    facilityType: form.facilityType,
    bizStatus: form.bizStatus,
    regionCode: normalizeOptional(form.regionCode),
    villageName: normalizeOptional(form.villageName),
    projectName: normalizeOptional(form.projectName),
    remark: normalizeOptional(form.remark),
    // 成对提交；不填空间信息时两个字段都不传，避免触发后端“必须成对提供”校验。
    ...(geometry ? { geometryType: geometry.geometryType, geometryJson: geometry.geometryJson } : {}),
  }
  try {
    if (editing.value && props.record?.id !== undefined) await updateFacility({ ...payload, id: props.record.id })
    else await addFacility(payload)
    emit('saved')
  } catch (e) { error.value = message(e) }
  finally { busy.value = false }
}
</script>

<template>
  <div class="backdrop" @click.self="!busy && emit('close')">
    <section class="dialog" role="dialog" aria-modal="true" :aria-labelledby="editing ? 'edit-facility-title' : 'add-facility-title'">
      <header><div><h2 :id="editing ? 'edit-facility-title' : 'add-facility-title'">{{ editing ? '编辑设施' : '新增设施' }}</h2><p>带 <b>*</b> 的项目为必填项。</p></div><button type="button" :disabled="busy" aria-label="关闭" @click="emit('close')">×</button></header>
      <form @submit.prevent="submit">
        <div class="fields">
          <label>设施编号<input :value="form.facilityNo" disabled title="设施编号由后端生成，不可手动填写" placeholder="保存后由系统生成" /></label>
          <label>设施名称 <b>*</b><input v-model="form.name" :disabled="busy" maxlength="100" placeholder="请输入设施名称" /></label>
          <label>设施类型 <b>*</b><ElSelect :empty-values="[null, undefined]" class="system-select" popper-class="system-select-options" v-model="form.facilityType" :disabled="busy"><ElOption value="" label="请选择设施类型" /><ElOption v-for="option in typeOptions" :key="String(option.id)" :value="option.code" :label="String(option.name)" /></ElSelect></label>
          <label>设施状态 <ElSelect :empty-values="[null, undefined]" class="system-select" popper-class="system-select-options" v-model="form.bizStatus" :disabled="busy"><ElOption value="NORMAL" label="正常" /><ElOption value="ABNORMAL" label="异常" /><ElOption value="CHECKING" label="核查中" /><ElOption value="DISCARDED" label="废弃" /></ElSelect></label>
          <label>所属区划<ElSelect :empty-values="[null, undefined]" class="system-select" popper-class="system-select-options" v-model="form.regionCode" :disabled="busy || regionLoading"><ElOption value="" :label="String(regionLoading ? '正在加载区划…' : '请选择所属区划')" /><ElOption v-for="option in regionOptions" :key="option.code" :value="option.code" :label="String(option.label)" /></ElSelect><small v-if="regionError" class="hint">{{ regionError }}</small></label>
          <label>行政村<input v-model="form.villageName" :disabled="busy" maxlength="100" placeholder="请输入行政村" /></label>
          <label class="wide">所属项目<input v-model="form.projectName" :disabled="busy" maxlength="100" placeholder="请输入所属项目" /></label>
          <label class="wide">备注<textarea v-model="form.remark" :disabled="busy" rows="2" maxlength="500" placeholder="可填写设施说明、维护信息等" /></label>
          <details class="wide"><summary>空间信息（可选）</summary><label>设施 GeoJSON<textarea v-model="form.geometryJson" :disabled="busy" rows="4" placeholder='例如：{"type":"Point","coordinates":[119.9,32.5]}' /></label><small class="hint">支持 Point / LineString / Polygon 等单个几何，也可粘贴 Feature；保存时会自动带上对应的 geometryType，无需手填。</small></details>
        </div>
        <p v-if="error" class="error" role="alert">{{ error }}</p>
        <footer><button type="button" class="secondary" :disabled="busy" @click="emit('close')">取消</button><button type="submit" :disabled="busy">{{ busy ? '正在保存…' : editing ? '保存修改' : '新增设施' }}</button></footer>
      </form>
    </section>
  </div>
</template>

<style scoped>
.backdrop{position:fixed;z-index:1000;inset:0;display:grid;place-items:center;padding:24px;background:#00131bbd}.dialog{width:min(720px,96vw);max-height:calc(100vh - 48px);overflow:auto;border:1px solid #3f8297;border-radius:8px;background:#103445;color:#d9eff3;box-shadow:0 20px 58px #000a}.dialog header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:18px 22px;border-bottom:1px solid #315e6e}.dialog h2{margin:0;font-size:21px}.dialog header p{margin:7px 0 0;color:#8db6c1;font-size:13px}.dialog header b,.fields>b{color:#ff9e78}.dialog header>button{border:0;background:transparent;color:#cfeaf0;font-size:26px;line-height:1;cursor:pointer}.fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;padding:20px 22px}.fields label{display:grid;gap:7px;color:#b9d9e1;font-size:13px}.fields label>b{color:#ff9e78}.fields input,.fields select,.fields textarea{box-sizing:border-box;width:100%;border:1px solid #457589;border-radius:4px;background:#092635;color:#e2f4f6;padding:9px 10px;font:inherit;font-size:14px;outline:0}.fields textarea{resize:vertical}.fields input:focus,.fields select:focus,.fields textarea:focus{border-color:#58cad7;box-shadow:0 0 0 2px #44b8c51f}.wide{grid-column:1/-1}.fields details{padding:10px 12px;border:1px solid #38697b;border-radius:5px;background:#0c2d3b}.fields summary{cursor:pointer;color:#a6d7df;font-size:13px}.fields details label{margin-top:12px}.error{margin:0 22px;color:#ffb19c;font-size:13px}.dialog footer{display:flex;justify-content:flex-end;gap:10px;padding:16px 22px;border-top:1px solid #315e6e}.dialog footer button{border:1px solid #2996af;border-radius:4px;background:#168eb2;color:#f2feff;padding:9px 16px;cursor:pointer;font-size:14px}.dialog footer button.secondary{border-color:#4e7785;background:#143846;color:#c6e3e8}.dialog button:disabled,.fields :disabled{opacity:.55;cursor:not-allowed}.fields .hint{color:#8db6c1;font-size:12px;line-height:1.6}
@media(max-width:600px){.fields{grid-template-columns:1fr}.wide{grid-column:auto}}
</style>
