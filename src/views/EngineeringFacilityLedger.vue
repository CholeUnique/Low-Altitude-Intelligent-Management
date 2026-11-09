<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { deleteFacility, getFacilityPage, getFacilityStatistics, getFacilityTypes, type FacilityOption, type FacilityPage, type FacilityRecord, type FacilityStatistics } from '@/api/facility'
import { useUserStore } from '@/stores/user'
import FacilityEditDialog from '@/components/FacilityEditDialog.vue'
import FacilityReportDialog from '@/components/FacilityReportDialog.vue'
import FacilityQrcodeDialog from '@/components/FacilityQrcodeDialog.vue'

const user = useUserStore()
const canManage = computed(() => user.currentUser?.role === 'ADMIN' || user.isActiveDepartmentAdmin)
const editOpen = ref(false), editRecord = ref<FacilityRecord>(), pendingDelete = ref<FacilityRecord>(), deleteBusy = ref(false), deleteError = ref('')
const reportRecord = ref<FacilityRecord>(), qrcodeRecord = ref<FacilityRecord>()
const keyword = ref(''), facilityType = ref(''), bizStatus = ref('')
const pageNum = ref(1), pageSize = ref(10)
const applied = ref({ keyword: '', facilityType: '', bizStatus: '' })
const page = ref<FacilityPage>(), statistics = ref<FacilityStatistics>(), options = ref<FacilityOption[]>([])
const pageLoading = ref(false), statsLoading = ref(false), optionsLoading = ref(false)
const pageError = ref(''), statsError = ref(''), optionsError = ref('')
const totalPages = computed(() => Math.max(1, Math.ceil((page.value?.total || 0) / pageSize.value)))
const typeOptions = computed(() => {
  const flattened: FacilityOption[] = []
  const visit = (items: FacilityOption[]) => items.forEach(item => { flattened.push(item); if (Array.isArray(item.children)) visit(item.children) })
  visit(options.value)
  return flattened
})
let listVersion = 0, contextVersion = 0
const message = (e: unknown) => e instanceof Error ? e.message : '请求失败，请重试'
async function loadPage() {
  const version = ++listVersion, deptId = user.activeDeptId
  page.value = undefined; pageError.value = ''
  if (!deptId) { pageLoading.value = false; pageError.value = '当前未选择部门，无法查询设施台账。'; return }
  pageLoading.value = true
  try {
    const result = await getFacilityPage({ deptId, pageNum: pageNum.value, pageSize: pageSize.value, ...(applied.value.keyword ? { keyword: applied.value.keyword } : {}), ...(applied.value.facilityType ? { facilityType: applied.value.facilityType } : {}), ...(applied.value.bizStatus ? { bizStatus: applied.value.bizStatus } : {}) })
    if (version === listVersion) page.value = result
  } catch (e) { if (version === listVersion) pageError.value = message(e) }
  finally { if (version === listVersion) pageLoading.value = false }
}
async function loadContext() {
  const version = ++contextVersion, deptId = user.activeDeptId
  statistics.value = undefined; options.value = []; statsError.value = ''; optionsError.value = ''
  if (!deptId) { statsLoading.value = false; optionsLoading.value = false; statsError.value = '当前未选择部门'; return }
  statsLoading.value = true; optionsLoading.value = true
  void getFacilityStatistics(deptId).then(result => { if (version === contextVersion) statistics.value = result }).catch(e => { if (version === contextVersion) statsError.value = message(e) }).finally(() => { if (version === contextVersion) statsLoading.value = false })
  void getFacilityTypes().then(result => { if (version === contextVersion) options.value = result }).catch(e => { if (version === contextVersion) optionsError.value = message(e) }).finally(() => { if (version === contextVersion) optionsLoading.value = false })
}
function search() { applied.value = { keyword: keyword.value.trim(), facilityType: facilityType.value, bizStatus: bizStatus.value }; pageNum.value = 1; void loadPage() }
function reset() { keyword.value = ''; facilityType.value = ''; bizStatus.value = ''; search() }
function turnPage(n: number) { if (n < 1 || n > totalPages.value) return; pageNum.value = n; void loadPage() }
function openAdd() { editRecord.value = undefined; editOpen.value = true }
function openEdit(record: FacilityRecord) { editRecord.value = record; editOpen.value = true }
function afterSaved() { editOpen.value = false; editRecord.value = undefined; void loadContext(); void loadPage() }
function openReport(record: FacilityRecord) { reportRecord.value = record }
function openQrcode(record: FacilityRecord) { qrcodeRecord.value = record }
function afterReported() { void loadContext(); void loadPage() }
function askDelete(record: FacilityRecord) { deleteError.value = ''; pendingDelete.value = record }
async function confirmDelete() {
  const record = pendingDelete.value, deptId = user.activeDeptId
  if (!record || !deptId || deleteBusy.value) return
  deleteBusy.value = true; deleteError.value = ''
  try {
    await deleteFacility(deptId, record.id)
    if ((page.value?.records.length || 0) === 1 && pageNum.value > 1) pageNum.value--
    pendingDelete.value = undefined
    await Promise.all([loadContext(), loadPage()])
  } catch (e) { deleteError.value = message(e) }
  finally { deleteBusy.value = false }
}
/** 表格可视高度决定每页条数：一屏内显示完整一页，不依赖表格内部纵向滚动。 */
const tableWrap = ref<HTMLElement>()
let tableObserver: ResizeObserver | undefined
function updatePageSize() {
  const height = tableWrap.value?.clientHeight || 0
  if (height < 80) return
  // 43px 为表头与数据行的高度（padding 13*2 + 行高），首行表头占一行的空间。
  const rows = Math.max(4, Math.floor((height - 43) / 43))
  if (rows === pageSize.value) return
  const firstIndex = (pageNum.value - 1) * pageSize.value
  pageSize.value = rows
  pageNum.value = Math.min(Math.floor(firstIndex / rows) + 1, totalPages.value)
  void loadPage()
}
onMounted(() => {
  tableObserver = new ResizeObserver(updatePageSize)
  if (tableWrap.value) tableObserver.observe(tableWrap.value)
  updatePageSize()
})
onBeforeUnmount(() => { tableObserver?.disconnect(); tableObserver = undefined })
watch(() => user.activeDeptId, () => { keyword.value = ''; facilityType.value = ''; bizStatus.value = ''; applied.value = { keyword: '', facilityType: '', bizStatus: '' }; pageNum.value = 1; void loadContext(); void loadPage() }, { immediate: true })
</script>

<template>
  <section class="ledger">
    <header><div><div class="eyebrow">专题分析 / 高标准农田工程设施管理 / 设施台账</div></div><div class="actions"><button v-if="canManage" :disabled="!user.activeDeptId" @click="openAdd">＋ 新增设施</button><button class="secondary" @click="loadContext(); loadPage()">刷新数据</button></div></header>
    <div v-if="statsError" class="notice" role="alert">统计加载失败：{{ statsError }} <button @click="loadContext">重试</button></div>
    <div class="stats">
      <article v-for="item in [{name:'设施总数',value:statistics?.totalCount},{name:'正常',value:statistics?.normalCount},{name:'异常',value:statistics?.abnormalCount},{name:'核查中',value:statistics?.checkingCount},{name:'废弃',value:statistics?.discardedCount}]" :key="item.name"><span>{{ item.name }}</span><strong>{{ statsLoading ? '—' : item.value ?? '—' }}</strong></article>
    </div>
    <div class="card">
      <form class="filters" @submit.prevent="search"><input v-model="keyword" aria-label="搜索设施" placeholder="搜索名称、编号、项目或行政村" /><ElSelect :empty-values="[null, undefined]" class="system-select" popper-class="system-select-options" v-model="facilityType" aria-label="设施类型"><ElOption value="" label="全部设施类型" /><ElOption v-for="option in typeOptions" :key="String(option.id)" :value="option.code" :label="String(option.name)" /></ElSelect><ElSelect :empty-values="[null, undefined]" class="system-select" popper-class="system-select-options" v-model="bizStatus" aria-label="设施状态"><ElOption value="" label="全部状态" /><ElOption value="NORMAL" label="正常" /><ElOption value="ABNORMAL" label="异常" /><ElOption value="CHECKING" label="核查中" /><ElOption value="DISCARDED" label="废弃" /></ElSelect><button type="submit">查询</button><button type="button" class="secondary" @click="reset">重置</button></form>
      <p v-if="optionsError" class="notice" role="alert">设施类型加载失败：{{ optionsError }} <button @click="loadContext">重试</button></p>
      <div ref="tableWrap" class="table-wrap"><table><thead><tr><th>设施编号</th><th>设施名称</th><th>设施类型</th><th>状态</th><th>所属区划</th><th>行政村</th><th>所属项目</th><th>更新时间</th><th>操作</th></tr></thead><tbody><tr v-for="item in page?.records || []" :key="String(item.id)"><td>{{ item.facilityNo || '—' }}</td><td>{{ item.name || '—' }}</td><td>{{ item.typeName || item.facilityType || '—' }}</td><td>{{ item.bizStatusName || item.bizStatus || '—' }}</td><td>{{ item.regionName || '—' }}</td><td>{{ item.villageName || '—' }}</td><td>{{ item.projectName || '—' }}</td><td>{{ item.updateTime?.replace('T', ' ') || '—' }}</td><td class="row-actions"><button type="button" class="text-action" @click="openReport(item)">上报</button><button type="button" class="text-action" @click="openQrcode(item)">二维码</button><button v-if="canManage" type="button" class="text-action" @click="openEdit(item)">编辑</button><button v-if="canManage" type="button" class="text-action danger" @click="askDelete(item)">删除</button></td></tr></tbody></table>
        <div v-if="pageLoading" class="empty" role="status">正在加载设施台账…</div><div v-else-if="pageError" class="empty" role="alert">加载失败：{{ pageError }} <button @click="loadPage">重试</button></div><div v-else-if="page && !page.records.length" class="empty">{{ applied.keyword || applied.facilityType || applied.bizStatus ? '没有符合筛选条件的设施' : '暂无设施台账数据' }}</div>
      </div>
      <footer><span>共 {{ page ? page.total : '—' }} 条</span><button class="secondary" :disabled="pageLoading || !!pageError || pageNum <= 1" @click="turnPage(pageNum - 1)">上一页</button><span>{{ pageNum }} / {{ page ? totalPages : '—' }}</span><button class="secondary" :disabled="pageLoading || !!pageError || pageNum >= totalPages" @click="turnPage(pageNum + 1)">下一页</button></footer>
    </div>
    <FacilityReportDialog v-if="reportRecord && user.activeDeptId" :key="`report-${reportRecord.id}`" :record="reportRecord" :dept-id="user.activeDeptId" @close="reportRecord = undefined" @reported="afterReported" />
    <FacilityQrcodeDialog v-if="qrcodeRecord && user.activeDeptId" :key="`qrcode-${qrcodeRecord.id}`" :record="qrcodeRecord" :dept-id="user.activeDeptId" @close="qrcodeRecord = undefined" />
    <FacilityEditDialog v-if="editOpen && user.activeDeptId" :key="editRecord ? `edit-${editRecord.id}` : 'add'" :dept-id="user.activeDeptId" :record="editRecord" :type-options="typeOptions" @close="editOpen = false; editRecord = undefined" @saved="afterSaved" />
    <div v-if="pendingDelete" class="delete-backdrop" @click.self="!deleteBusy && (pendingDelete = undefined)"><section class="delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-facility-title"><h2 id="delete-facility-title">确认删除设施</h2><p>确定删除“{{ pendingDelete.name || pendingDelete.facilityNo || '未命名设施' }}”吗？此操作无法恢复。</p><p v-if="deleteError" class="delete-error" role="alert">{{ deleteError }}</p><footer><button type="button" :disabled="deleteBusy" @click="pendingDelete = undefined">取消</button><button type="button" class="danger-button" :disabled="deleteBusy" @click="confirmDelete">{{ deleteBusy ? '正在删除…' : '确认删除' }}</button></footer></section></div>
  </section>
</template>

<style scoped>
.ledger{height:100%;overflow:hidden;display:flex;flex-direction:column;box-sizing:border-box;padding:24px;background:#0c2334;color:#d7edf3}.ledger header{flex:none;display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:22px}.actions{display:flex;gap:8px;flex-wrap:wrap}.eyebrow{font-size:12px;color:#7ba9bb}.ledger h1{margin:8px 0;font-size:23px}.ledger p{margin:0;color:#8cb1c1;font-size:12px}.ledger button{cursor:pointer;border:1px solid #2384a2;border-radius:4px;background:#168eb2;color:#effcff;padding:8px 14px}.ledger button:disabled{opacity:.45;cursor:default}.ledger button.secondary{background:#123548;color:#bfe1ed;border-color:#346579}.stats{flex:none;display:grid;grid-template-columns:repeat(5,minmax(100px,1fr));gap:12px;margin-bottom:18px}.stats article{display:grid;gap:12px;padding:18px;border:1px solid #285468;border-radius:6px;background:#123447}.stats span{color:#95bdc9;font-size:12px}.stats strong{font-size:24px;color:#62d6df}.card{flex:1;min-height:0;display:flex;flex-direction:column;border:1px solid #285468;border-radius:6px;background:#102d40;overflow:hidden}.filters{flex:none;display:flex;gap:8px;padding:14px;border-bottom:1px solid #285468}.filters input,.filters select{min-width:0;border:1px solid #315a6e;border-radius:4px;background:#0a2231;color:#d7edf3;padding:8px;font:inherit;font-size:12px}.filters input{flex:1}.filters select{width:150px}.notice{padding:10px 14px!important;color:#ffb9a8!important;font-size:12px}.notice button,.empty button{padding:2px 6px;background:transparent;border:0;color:#6ed8e8}.table-wrap{flex:1;min-height:0;overflow:auto}table{width:100%;border-collapse:collapse;font-size:12px;white-space:nowrap}th,td{padding:13px 14px;text-align:left;border-bottom:1px solid #234557}th{color:#8cb9c7;font-weight:500;background:#0c2637}td{color:#d2e8ec}.row-actions{display:flex;gap:6px;flex-wrap:wrap}.ledger .row-actions .text-action{padding:4px 7px;border-color:#39768c;background:#123b4c;color:#9ce4ed;font-size:12px}.ledger .row-actions .text-action.danger{border-color:#8a4d48;background:#482d31;color:#ffb6ad}.empty{text-align:center;padding:48px 16px;color:#98b8c5;font-size:13px}footer{flex:none;display:flex;justify-content:flex-end;align-items:center;gap:10px;padding:12px 14px;color:#9abdc9;font-size:12px}footer button{padding:5px 10px!important}.delete-backdrop{position:fixed;z-index:1000;inset:0;display:grid;place-items:center;padding:24px;background:#00131bbd}.delete-dialog{width:min(430px,95vw);border:1px solid #6c5554;border-radius:8px;background:#123242;box-shadow:0 18px 52px #000a}.delete-dialog h2{margin:0;padding:18px 20px;border-bottom:1px solid #456170;font-size:20px}.delete-dialog p{margin:0;padding:17px 20px;color:#c4dde3;font-size:14px;line-height:1.7}.delete-dialog .delete-error{padding-top:0;color:#ffafa4}.delete-dialog footer{padding:14px 20px;border-top:1px solid #456170}.delete-dialog .danger-button{border-color:#a45048;background:#9a3d37;color:#fff}@media(max-width:800px){.stats{grid-template-columns:repeat(2,1fr)}.filters{flex-wrap:wrap}.filters input{flex-basis:100%}}
</style>
