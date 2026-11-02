<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, reactive, ref } from 'vue'
import { getOperationLogs, type OperationLog } from '@/api/operation-log'
import { formatBeijingDateTime } from '@/utils/date-time'

const filters = reactive({ module: '', operateType: '', operatorName: '', targetId: '', startTime: '', endTime: '' })
const records = ref<OperationLog[]>([])
const page = ref(1)
const total = ref(0)
const pageSize = 20
const pages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))
const loading = ref(false)
const error = ref('')
const selected = ref<OperationLog>()
const observed = reactive({ module: new Map<string, string>(), operateType: new Map<string, string>(), operatorName: new Map<string, string>(), targetId: new Map<string, string>() })
const moduleNames: Record<string, string> = {
  USER: '用户管理', DEPT: '部门管理', DEPARTMENT: '部门管理', PERMISSION: '权限管理', PERM: '权限管理',
  SCENE: '场景管理', MAP_SERVICE: '地图服务', METADATA: '元数据管理', META_TYPE: '元数据类型',
  META_ITEM: '元数据条目', SPATIAL_ANALYSIS: '空间分析', TASK: '业务任务', WORKFLOW: '工作流',
}
const operationNames: Record<string, string> = {
  ADD: '新增', CREATE: '创建', UPDATE: '修改', EDIT: '编辑', DELETE: '删除', STATUS: '修改状态',
  ENABLE: '启用', DISABLE: '停用', LOGIN: '登录', LOGOUT: '退出登录',
  RESET_PASSWORD: '重置密码', PASSWORD_RESET: '重置密码', PASSWORD: '修改密码',
  GRANT: '授予权限', REVOKE: '回收权限', SAVE: '保存', BIND: '关联', UNBIND: '解绑',
  OVERLAY: '叠加分析', EXPORT: '导出', IMPORT: '导入', QUERY: '查询',
  TASK_CREATE: '创建任务', TASK_UPDATE: '修改任务', TASK_EXECUTE: '触发执行',
  GEOMETRY_UPSERT: '保存任务范围', WORKFLOW_START: '启动工作流',
}
function moduleLabel(row: OperationLog) { return row.moduleDesc || row.moduleName || moduleNames[row.module || ''] || row.module || '—' }
function operationLabel(row: OperationLog) {
  const code = row.operateType || ''
  if (row.operateTypeDesc || row.operateTypeName) return row.operateTypeDesc || row.operateTypeName!
  if (operationNames[code]) return operationNames[code]
  // 带模块前缀的操作编码仅在两部分均已知时翻译，其他编码保留原值。
  for (const [prefix, label] of Object.entries(moduleNames)) {
    if (code.startsWith(`${prefix}_`) && operationNames[code.slice(prefix.length + 1)]) return `${label} · ${operationNames[code.slice(prefix.length + 1)]}`
  }
  return code || '—'
}
function rememberOptions(rows: OperationLog[]) {
  for (const row of rows) {
    if (row.module) observed.module.set(row.module, moduleLabel(row))
    if (row.operateType) observed.operateType.set(row.operateType, operationLabel(row))
    if (row.operatorName) observed.operatorName.set(row.operatorName, row.operatorName)
    if (row.targetId != null && String(row.targetId).trim()) observed.targetId.set(String(row.targetId), row.targetDesc ? `${row.targetDesc}（${row.targetId}）` : String(row.targetId))
  }
}
let requestVersion = 0
let optionsVersion = 0
const optionsLoading = ref(false)
const optionsError = ref('')
async function loadAllOptions() {
  const request = ++optionsVersion
  optionsLoading.value = true
  optionsError.value = ''
  try {
    // 接口暂未提供去重选项，独立分页读取全部日志，不改变主列表的查询条件。
    const size = 200
    let index = 1
    let fetched = 0
    while (request === optionsVersion) {
      const result = await getOperationLogs({ pageNum: index, pageSize: size })
      if (request !== optionsVersion) return
      const rows = result.records || []
      rememberOptions(rows)
      fetched += rows.length
      if (fetched >= Number(result.total) || rows.length === 0) {
        if (rows.length === 0 && fetched < Number(result.total)) throw new Error('日志选项未能完整读取')
        break
      }
      index++
    }
  } catch (reason) {
    if (request === optionsVersion) optionsError.value = reason instanceof Error ? reason.message : '筛选选项读取失败'
  } finally {
    if (request === optionsVersion) optionsLoading.value = false
  }
}

async function load() {
  const request = ++requestVersion
  loading.value = true
  error.value = ''
  try {
    if (filters.startTime && filters.endTime && filters.startTime > filters.endTime) throw new Error('开始时间不能晚于结束时间')
    const optional = Object.fromEntries(Object.entries(filters).filter(([, value]) => value.trim()).map(([key, value]) => [key, value.trim()]))
    const result = await getOperationLogs({ pageNum: page.value, pageSize, ...optional })
    if (request !== requestVersion) return
    records.value = result.records || []
    rememberOptions(records.value)
    total.value = Number(result.total) || 0
  } catch (reason) {
    if (request !== requestVersion) return
    error.value = reason instanceof Error ? reason.message : '操作日志加载失败'
  } finally {
    if (request === requestVersion) loading.value = false
  }
}
function search() { page.value = 1; void load() }
function reset() { Object.assign(filters, { module: '', operateType: '', operatorName: '', targetId: '', startTime: '', endTime: '' }); search() }
function changePage(next: number) { if (next >= 1 && next <= pages.value && next !== page.value) { page.value = next; void load() } }
function detailText(value?: string) {
  if (!value) return '暂无参数摘要'
  try { return JSON.stringify(JSON.parse(value), null, 2) } catch { return value }
}
onMounted(() => { void load(); void loadAllOptions() })
onBeforeUnmount(() => { requestVersion++; optionsVersion++ })
</script>

<template>
  <div class="logs-page">
    <div class="logs-heading"><div><h2>操作日志</h2><p>查询系统管理操作记录</p></div></div>
    <div class="logs-panel">
      <form class="logs-filters" @submit.prevent="search">
        <el-select v-model="filters.module" filterable allow-create clearable :value-on-clear="''" default-first-option placeholder="全部模块" aria-label="模块">
          <el-option v-for="[value, label] in observed.module" :key="value" :value="value" :label="label" />
        </el-select>
        <el-select v-model="filters.operateType" filterable allow-create clearable :value-on-clear="''" default-first-option placeholder="全部操作类型" aria-label="操作类型">
          <el-option v-for="[value, label] in observed.operateType" :key="value" :value="value" :label="label" />
        </el-select>
        <el-select v-model="filters.operatorName" filterable allow-create clearable :value-on-clear="''" default-first-option placeholder="全部操作人" aria-label="操作人">
          <el-option v-for="[value, label] in observed.operatorName" :key="value" :value="value" :label="label" />
        </el-select>
        <el-select v-model="filters.targetId" filterable allow-create clearable :value-on-clear="''" default-first-option placeholder="全部目标 ID" aria-label="目标 ID">
          <el-option v-for="[value, label] in observed.targetId" :key="value" :value="value" :label="label" />
        </el-select>
        <input v-model="filters.startTime" type="datetime-local" aria-label="开始时间" />
        <input v-model="filters.endTime" type="datetime-local" aria-label="结束时间" />
        <button type="submit">查询</button><button type="button" @click="reset">重置</button>
      </form>
      <p v-if="optionsLoading" class="logs-options-hint" role="status">正在读取全部日志的筛选选项…</p>
      <p v-else-if="optionsError" class="logs-error" role="alert">筛选选项读取不完整：{{ optionsError }} <button type="button" @click="loadAllOptions">重试</button></p>
      <p v-if="error" class="logs-error" role="alert">{{ error }}</p>
      <div class="logs-table-wrap"><table><thead><tr><th>操作时间</th><th>模块</th><th>操作类型</th><th>操作对象</th><th>操作人</th><th>IP</th><th>结果</th><th>详情</th></tr></thead>
        <tbody><tr v-for="row in records" :key="String(row.id)"><td>{{ row.createTime ? formatBeijingDateTime(row.createTime) : '—' }}</td><td :title="row.module">{{ moduleLabel(row) }}</td><td :title="row.operateType">{{ operationLabel(row) }}</td><td>{{ row.targetDesc || row.targetId || '—' }}</td><td>{{ row.operatorName || '—' }}</td><td>{{ row.operatorIp || '—' }}</td><td>{{ row.success === true || row.success === 1 ? '成功' : row.success === false || row.success === 0 ? '失败' : '—' }}</td><td><button class="logs-link" type="button" @click="selected = row">查看</button></td></tr></tbody>
      </table><div v-if="!records.length" class="logs-empty">{{ loading ? '正在加载…' : '暂无操作记录' }}</div></div>
      <div class="logs-pagination"><span>共 {{ total }} 条</span><button type="button" :disabled="loading || page <= 1" @click="changePage(page - 1)">上一页</button><span>{{ page }} / {{ pages }}</span><button type="button" :disabled="loading || page >= pages" @click="changePage(page + 1)">下一页</button></div>
    </div>
    <div v-if="selected" class="logs-overlay" @click.self="selected = undefined"><div class="logs-dialog" role="dialog" aria-modal="true" aria-label="操作日志详情"><header><strong>操作日志详情</strong><button type="button" aria-label="关闭" @click="selected = undefined">×</button></header><div class="logs-detail"><p>操作对象：{{ selected.targetDesc || selected.targetId || '—' }}</p><p>目标类型：{{ selected.targetType || '—' }}</p><p v-if="selected.errorMsg">错误信息：{{ selected.errorMsg }}</p><p>请求参数摘要</p><pre>{{ detailText(selected.detailJson) }}</pre></div></div></div>
  </div>
</template>

<style scoped>
.logs-options-hint{margin:8px 12px;color:#7896a6;font-size:12px}.logs-filters :deep(.el-select){flex:1 1 135px;min-width:110px}.logs-filters :deep(.el-select__wrapper){min-height:36px;background:#081e2d;box-shadow:0 0 0 1px #24516a inset}.logs-filters :deep(.el-select__selected-item),.logs-filters :deep(.el-select__placeholder){color:#b9d5e1}.logs-filters :deep(.el-select__input){color:#d6e8ef}
.logs-page{color:#c8dfed}.logs-heading{margin-bottom:18px}.logs-heading h2{margin:0;color:#fff;font-size:20px}.logs-heading p{margin:6px 0 0;color:#7195a8;font-size:12px}.logs-panel{border:1px solid #214b60;border-radius:5px;background:#10283b}.logs-filters{display:flex;gap:8px;flex-wrap:wrap;padding:12px;border-bottom:1px solid #214b60}.logs-filters input{flex:1 1 135px;min-width:110px;padding:9px;color:#d6e8ef;background:#081e2d;border:1px solid #24516a;border-radius:3px;color-scheme:dark}.logs-filters button,.logs-pagination button{padding:8px 14px;color:#bde9f6;background:#16445c;border:1px solid #286984;border-radius:3px;cursor:pointer}.logs-filters button[type=submit]{background:#249bc0;color:white}.logs-table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;font-size:12px;text-align:left}th,td{padding:12px;border-bottom:1px solid #1c4053;white-space:nowrap}th{color:#78a6b9;background:#0b2031}td{color:#bbd4e1}.logs-link{border:0;background:none;color:#46bfe4;cursor:pointer}.logs-empty{text-align:center;padding:36px;color:#7896a6}.logs-error{color:#ff8585;padding:0 12px}.logs-pagination{display:flex;align-items:center;justify-content:flex-end;gap:10px;padding:12px;font-size:12px}.logs-pagination button:disabled{opacity:.4;cursor:default}.logs-overlay{position:fixed;inset:0;background:#00101dbb;display:grid;place-items:center;z-index:1000}.logs-dialog{width:min(600px,90vw);max-height:80vh;overflow:auto;border:1px solid #286984;border-radius:5px;background:#10283b;box-shadow:0 12px 36px #0008}.logs-dialog header{display:flex;justify-content:space-between;padding:16px;border-bottom:1px solid #24516a;color:white}.logs-dialog header button{background:none;border:0;color:#bce0ec;font-size:22px;cursor:pointer}.logs-detail{padding:18px;font-size:13px}.logs-detail pre{white-space:pre-wrap;overflow-wrap:anywhere;padding:12px;background:#081e2d;border-radius:4px;color:#c6e4ed}
</style>
