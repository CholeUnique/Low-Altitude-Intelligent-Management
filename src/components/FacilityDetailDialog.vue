<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { getFacilityDetail, type FacilityRecord } from '@/api/facility'

const props = defineProps<{ deptId: string; id: string | number }>()
const emit = defineEmits<{ close: [] }>()
const record = ref<FacilityRecord>()
const loading = ref(true)
const error = ref('')
let request = 0
async function load() {
  const version = ++request
  loading.value = true; error.value = ''
  try { const value = await getFacilityDetail(props.deptId, props.id); if (version === request) record.value = value }
  catch (reason) { if (version === request) error.value = reason instanceof Error ? reason.message : '设施详情读取失败' }
  finally { if (version === request) loading.value = false }
}
function display(value?: string | number | null) { return value === null || value === undefined || value === '' ? '—' : String(value) }
function time(value?: string | null) { return value ? value.replace('T', ' ').slice(0, 19) : '—' }
function keydown(event: KeyboardEvent) { if (event.key === 'Escape') emit('close') }
onMounted(() => { window.addEventListener('keydown', keydown); void load() })
onBeforeUnmount(() => { request++; window.removeEventListener('keydown', keydown) })
</script>

<template>
  <Teleport to="body">
    <div class="facility-detail-backdrop" @click.self="emit('close')">
      <section class="facility-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="facility-detail-title">
        <header><h2 id="facility-detail-title">设施详情</h2><button type="button" aria-label="关闭设施详情" @click="emit('close')">×</button></header>
        <div v-if="loading" class="detail-state" role="status">正在读取设施详情…</div>
        <div v-else-if="error" class="detail-state" role="alert">{{ error }} <button type="button" @click="load">重试</button></div>
        <div v-else-if="record" class="detail-body">
          <dl>
            <div><dt>设施名称</dt><dd>{{ display(record.name) }}</dd></div><div><dt>设施编号</dt><dd>{{ display(record.facilityNo) }}</dd></div>
            <div><dt>设施类型</dt><dd>{{ display(record.typeName || record.facilityType) }}</dd></div><div><dt>设施状态</dt><dd>{{ display(record.bizStatusName || record.bizStatus) }}</dd></div>
            <div><dt>所属区划</dt><dd>{{ display(record.regionName || record.regionCode) }}</dd></div><div><dt>行政村</dt><dd>{{ display(record.villageName) }}</dd></div>
            <div><dt>所属项目</dt><dd>{{ display(record.projectName) }}</dd></div><div><dt>几何类型</dt><dd>{{ display(record.geometryType) }}</dd></div>
            <div><dt>创建时间</dt><dd>{{ time(record.createTime) }}</dd></div><div><dt>更新时间</dt><dd>{{ time(record.updateTime) }}</dd></div>
            <div class="wide"><dt>备注</dt><dd>{{ display(record.remark) }}</dd></div>
          </dl>
          <details v-if="record.geometryJson"><summary>设施几何信息</summary><pre>{{ record.geometryJson }}</pre></details>
        </div>
        <footer><button type="button" @click="emit('close')">关闭</button></footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.facility-detail-backdrop{position:fixed;z-index:2000;inset:0;display:grid;place-items:center;padding:20px;background:#00131bbd}
.facility-detail-dialog{width:min(680px,100%);max-height:calc(100vh - 40px);display:flex;flex-direction:column;overflow:hidden;border:1px solid var(--ui-border,#386379);border-radius:10px;background:var(--ui-modal-background,#123242);color:var(--ui-body,#d7edf3);box-shadow:0 18px 52px #0008}
header,footer{flex:none;display:flex;align-items:center;padding:15px 20px;border-color:var(--ui-divider,#285468)}header{justify-content:space-between;border-bottom:1px solid var(--ui-divider,#285468)}h2{margin:0;color:var(--ui-text,#e6f1ff);font-size:18px}header button{border:0;background:transparent;color:var(--ui-body,#d7edf3);font-size:24px;cursor:pointer}
.detail-body{min-height:0;overflow:auto;padding:16px 20px}dl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 20px;margin:0}dl>div{min-width:0;display:grid;grid-template-columns:80px minmax(0,1fr);gap:10px;padding:11px 0;border-bottom:1px solid var(--ui-divider,#285468);font-size:13px;line-height:1.5}.wide{grid-column:1/-1}dt{color:var(--ui-muted,#9fb7c9)}dd{margin:0;color:var(--ui-text,#e6f1ff);overflow-wrap:anywhere}details{margin-top:16px;font-size:13px}summary{cursor:pointer;color:var(--ui-link,#83cfff)}pre{max-height:180px;overflow:auto;padding:10px;white-space:pre-wrap;overflow-wrap:anywhere;background:var(--ui-input,#092a38);border-radius:5px}.detail-state{padding:32px;text-align:center}.detail-state button,footer button{padding:7px 16px;border:1px solid var(--ui-border,#3a7386);border-radius:5px;background:var(--ui-input,#123a4c);color:var(--ui-body,#d7eef4);cursor:pointer}footer{justify-content:flex-end;border-top:1px solid var(--ui-divider,#285468)}@media(max-width:560px){dl{grid-template-columns:1fr}.wide{grid-column:auto}}
</style>
