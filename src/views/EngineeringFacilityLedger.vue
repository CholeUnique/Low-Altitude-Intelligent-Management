<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { getFacilityPage, getFacilityStatistics, getFacilityTypes, type FacilityOption, type FacilityPage, type FacilityStatistics } from '@/api/facility'
import { useUserStore } from '@/stores/user'
import FacilityImportDialog from '@/components/FacilityImportDialog.vue'
import FacilityLedgerMap from '@/components/FacilityLedgerMap.vue'

const user = useUserStore()
const importOpen = ref(false), mapOpen = ref(false), mapRevision = ref(0)
const canImport = computed(() => user.currentUser?.role === 'ADMIN' || user.isActiveDepartmentAdmin)
const keyword = ref(''), facilityType = ref(''), bizStatus = ref('')
const pageNum = ref(1), pageSize = 20
const applied = ref({ keyword: '', facilityType: '', bizStatus: '' })
const page = ref<FacilityPage>(), statistics = ref<FacilityStatistics>(), options = ref<FacilityOption[]>([])
const pageLoading = ref(false), statsLoading = ref(false), optionsLoading = ref(false)
const pageError = ref(''), statsError = ref(''), optionsError = ref('')
const totalPages = computed(() => Math.max(1, Math.ceil((page.value?.total || 0) / pageSize)))
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
    const result = await getFacilityPage({ deptId, pageNum: pageNum.value, pageSize, ...(applied.value.keyword ? { keyword: applied.value.keyword } : {}), ...(applied.value.facilityType ? { facilityType: applied.value.facilityType } : {}), ...(applied.value.bizStatus ? { bizStatus: applied.value.bizStatus } : {}) })
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
watch(() => user.activeDeptId, () => { importOpen.value = false; keyword.value = ''; facilityType.value = ''; bizStatus.value = ''; applied.value = { keyword: '', facilityType: '', bizStatus: '' }; pageNum.value = 1; void loadContext(); void loadPage() }, { immediate: true })
</script>

<template>
  <section class="ledger">
    <header><div><div class="eyebrow">专题分析 / 高标准农田工程设施管理</div><h1>设施台账</h1><p>查看当前部门的设施台账数据</p></div><div class="actions"><button class="secondary" @click="mapOpen = !mapOpen">{{ mapOpen ? '收起台账地图' : '查看台账地图' }}</button><button class="secondary" :disabled="!user.activeDeptId" @click="importOpen = true">图层导入预览</button><button class="secondary" @click="loadContext(); loadPage()">刷新数据</button></div></header>
    <div v-if="statsError" class="notice" role="alert">统计加载失败：{{ statsError }} <button @click="loadContext">重试</button></div>
    <div class="stats">
      <article v-for="item in [{name:'设施总数',value:statistics?.totalCount},{name:'正常',value:statistics?.normalCount},{name:'异常',value:statistics?.abnormalCount},{name:'核查中',value:statistics?.checkingCount},{name:'废弃',value:statistics?.discardedCount}]" :key="item.name"><span>{{ item.name }}</span><strong>{{ statsLoading ? '—' : item.value ?? '—' }}</strong></article>
    </div>
    <FacilityLedgerMap v-if="mapOpen && user.activeDeptId" :key="`${user.activeDeptId}-${mapRevision}`" :dept-id="user.activeDeptId" />
    <div class="card">
      <form class="filters" @submit.prevent="search"><input v-model="keyword" aria-label="搜索设施" placeholder="搜索名称、编号、项目或行政村" /><select v-model="facilityType" aria-label="设施类型"><option value="">全部设施类型</option><option v-for="option in typeOptions" :key="String(option.id)" :value="option.code">{{ option.name }}</option></select><select v-model="bizStatus" aria-label="设施状态"><option value="">全部状态</option><option value="NORMAL">正常</option><option value="ABNORMAL">异常</option><option value="CHECKING">核查中</option><option value="DISCARDED">废弃</option></select><button type="submit">查询</button><button type="button" class="secondary" @click="reset">重置</button></form>
      <p v-if="optionsError" class="notice" role="alert">设施类型加载失败：{{ optionsError }} <button @click="loadContext">重试</button></p>
      <div class="table-wrap"><table><thead><tr><th>设施编号</th><th>设施名称</th><th>设施类型</th><th>状态</th><th>所属区划</th><th>行政村</th><th>所属项目</th><th>更新时间</th></tr></thead><tbody><tr v-for="item in page?.records || []" :key="String(item.id)"><td>{{ item.facilityNo || '—' }}</td><td>{{ item.name || '—' }}</td><td>{{ item.typeName || item.facilityType || '—' }}</td><td>{{ item.bizStatusName || item.bizStatus || '—' }}</td><td>{{ item.regionName || '—' }}</td><td>{{ item.villageName || '—' }}</td><td>{{ item.projectName || '—' }}</td><td>{{ item.updateTime?.replace('T', ' ') || '—' }}</td></tr></tbody></table>
        <div v-if="pageLoading" class="empty" role="status">正在加载设施台账…</div><div v-else-if="pageError" class="empty" role="alert">加载失败：{{ pageError }} <button @click="loadPage">重试</button></div><div v-else-if="page && !page.records.length" class="empty">{{ applied.keyword || applied.facilityType || applied.bizStatus ? '没有符合筛选条件的设施' : '暂无设施台账数据' }}</div>
      </div>
      <footer><span>共 {{ page ? page.total : '—' }} 条</span><button class="secondary" :disabled="pageLoading || !!pageError || pageNum <= 1" @click="turnPage(pageNum - 1)">上一页</button><span>{{ pageNum }} / {{ page ? totalPages : '—' }}</span><button class="secondary" :disabled="pageLoading || !!pageError || pageNum >= totalPages" @click="turnPage(pageNum + 1)">下一页</button></footer>
    </div>
    <FacilityImportDialog v-if="importOpen && user.activeDeptId" :key="user.activeDeptId" :dept-id="user.activeDeptId" :can-import="canImport" @close="importOpen = false" @imported="loadContext(); loadPage(); mapRevision++" />
  </section>
</template>

<style scoped>
.ledger{height:100%;overflow:auto;box-sizing:border-box;padding:24px;background:#0c2334;color:#d7edf3}.ledger header{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:22px}.actions{display:flex;gap:8px;flex-wrap:wrap}.eyebrow{font-size:11px;color:#7ba9bb}.ledger h1{margin:8px 0;font-size:23px}.ledger p{margin:0;color:#8cb1c1;font-size:12px}.ledger button{cursor:pointer;border:1px solid #2384a2;border-radius:4px;background:#168eb2;color:#effcff;padding:8px 14px}.ledger button:disabled{opacity:.45;cursor:default}.ledger button.secondary{background:#123548;color:#bfe1ed;border-color:#346579}.stats{display:grid;grid-template-columns:repeat(5,minmax(100px,1fr));gap:12px;margin-bottom:18px}.stats article{display:grid;gap:12px;padding:18px;border:1px solid #285468;border-radius:6px;background:#123447}.stats span{color:#95bdc9;font-size:12px}.stats strong{font-size:24px;color:#62d6df}.card{border:1px solid #285468;border-radius:6px;background:#102d40;overflow:hidden}.filters{display:flex;gap:8px;padding:14px;border-bottom:1px solid #285468}.filters input,.filters select{min-width:0;border:1px solid #315a6e;border-radius:4px;background:#0a2231;color:#d7edf3;padding:8px;font:inherit;font-size:12px}.filters input{flex:1}.filters select{width:150px}.notice{padding:10px 14px!important;color:#ffb9a8!important;font-size:12px}.notice button,.empty button{padding:2px 6px;background:transparent;border:0;color:#6ed8e8}.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;font-size:12px;white-space:nowrap}th,td{padding:13px 14px;text-align:left;border-bottom:1px solid #234557}th{color:#8cb9c7;font-weight:500;background:#0c2637}td{color:#d2e8ec}.empty{text-align:center;padding:48px 16px;color:#98b8c5;font-size:13px}footer{display:flex;justify-content:flex-end;align-items:center;gap:10px;padding:12px 14px;color:#9abdc9;font-size:12px}footer button{padding:5px 10px!important}@media(max-width:800px){.stats{grid-template-columns:repeat(2,1fr)}.filters{flex-wrap:wrap}.filters input{flex-basis:100%}}
</style>
