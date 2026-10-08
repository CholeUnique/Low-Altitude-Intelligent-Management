<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import {
  addRequestTicket,
  deleteRequestTicket,
  getRequestTicketDetail,
  getRequestTicketPage,
  getRequestTicketTypes,
  type RequestTicket,
  type RequestTicketTypeOption,
} from '@/api/request-ticket'
import { getDepartmentOptions, getMyDepartments, type DepartmentOption } from '@/api/auth'
import TaskSchedulePicker from '@/components/TaskSchedulePicker.vue'

const records = ref<RequestTicket[]>([])
const types = ref<RequestTicketTypeOption[]>([])
const requesterOptions = ref<DepartmentOption[]>([])
const summaryCounts = ref<{ total?: number; pending?: number; running?: number; completed?: number }>({})
const total = ref(0)
const pageNum = ref(1)
const pageSize = ref(10)
const loading = ref(false)
const error = ref('')
const message = ref('')
const detail = ref<RequestTicket>()
const showCreate = ref(false)
const submitting = ref(false)
const filters = reactive<{ name: string; type: string; priority: string; status: string }>({ name: '', type: '', priority: '', status: '' })
const form = reactive({ name: '', type: '', description: '', requester: '', contactPerson: '', contactNumber: '', startTime: '', endTime: '', frequency: '', priority: '1', resultTypes: [] as string[] })
const resultTypeOptions = [
  ['PHOTO', '照片'], ['VIDEO', '视频'], ['LIVE', '直播'], ['MODEL_2D', '二维成果'],
  ['MODEL_3D', '三维成果'], ['PANORAMA', '全景'], ['EVENT', '事件'], ['REPORT', '巡检报告'],
] as const

const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))
const ticketSchedule = computed<string[]>({
  get: () => form.startTime && form.endTime ? [form.startTime, form.endTime] : [],
  set: (value) => {
    form.startTime = value[0] || ''
    form.endTime = value[1] || ''
  },
})
function statusLabel(status?: number) { return ['待执行', '执行中', '已完成', '已关闭'][status ?? -1] || '--' }
function priorityLabel(priority?: number) { return ['高', '中', '低'][priority ?? -1] || '--' }
function typeLabel(type?: string) { return types.value.find((item) => item.id === type || item.name === type)?.name || type || '--' }
function formatTime(value?: string) {
  if (!value) return '--'
  const text = String(value).trim()
  if (/^\d{10,13}$/.test(text)) {
    const rawTimestamp = Number(text)
    const timestamp = text.length === 10 ? rawTimestamp * 1000 : rawTimestamp
    const date = new Date(timestamp)
    if (!Number.isNaN(date.getTime())) {
      const parts = new Intl.DateTimeFormat('zh-CN', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false,
      }).formatToParts(date)
      const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || ''
      return `${part('year')}-${part('month')}-${part('day')} ${part('hour')}:${part('minute')}`
    }
  }
  return text.replace('T', ' ').slice(0, 16)
}
function toTimestamp(value: string) { return value ? new Date(value).getTime() : undefined }
function displayCount(value?: number) { return value === undefined ? '--' : value }

async function loadPage() {
  loading.value = true
  error.value = ''
  try {
    const data = await getRequestTicketPage({
      pageNum: pageNum.value,
      pageSize: pageSize.value,
      name: filters.name.trim() || undefined,
      type: filters.type || undefined,
      priority: filters.priority === '' ? undefined : Number(filters.priority),
      status: filters.status === '' ? undefined : Number(filters.status),
    })
    records.value = data.records
    total.value = data.total
  } catch (reason) {
    records.value = []
    total.value = 0
    error.value = reason instanceof Error ? reason.message : '工单列表加载失败'
  } finally {
    loading.value = false
  }
}

async function loadSummary() {
  try {
    const [all, pending, running, completed] = await Promise.all([
      getRequestTicketPage({ pageNum: 1, pageSize: 1 }),
      getRequestTicketPage({ pageNum: 1, pageSize: 1, status: 0 }),
      getRequestTicketPage({ pageNum: 1, pageSize: 1, status: 1 }),
      getRequestTicketPage({ pageNum: 1, pageSize: 1, status: 2 }),
    ])
    summaryCounts.value = { total: all.total, pending: pending.total, running: running.total, completed: completed.total }
  } catch { summaryCounts.value = {} }
}

async function loadRequesterOptions() {
  try {
    requesterOptions.value = await getDepartmentOptions()
  } catch {
    try {
      requesterOptions.value = await getMyDepartments()
    } catch {
      requesterOptions.value = []
    }
  }
}

async function loadInitial() {
  await Promise.all([
    getRequestTicketTypes().then((items) => { types.value = items }).catch(() => { types.value = [] }),
    loadRequesterOptions(),
  ])
  await Promise.all([loadPage(), loadSummary()])
}

function applyFilters() { pageNum.value = 1; void loadPage() }
function resetFilters() { Object.assign(filters, { name: '', type: '', priority: '', status: '' }); pageNum.value = 1; void loadPage() }
function changePage(next: number) { if (next < 1 || next > pageCount.value || next === pageNum.value) return; pageNum.value = next; void loadPage() }
function resetForm() { Object.assign(form, { name: '', type: '', description: '', requester: '', contactPerson: '', contactNumber: '', startTime: '', endTime: '', frequency: '', priority: '1', resultTypes: [] }) }
function openCreate() { resetForm(); showCreate.value = true }

async function submitTicket() {
  if (!form.name.trim() || !form.type) { message.value = '请填写工单名称并选择工单类型'; return }
  if (form.startTime && form.endTime && toTimestamp(form.startTime)! > toTimestamp(form.endTime)!) { message.value = '结束时间不能早于开始时间'; return }
  submitting.value = true
  message.value = ''
  try {
    await addRequestTicket({
      name: form.name.trim(), type: form.type, description: form.description.trim() || undefined,
      requester: form.requester.trim() || undefined, contactPerson: form.contactPerson.trim() || undefined,
      contactNumber: form.contactNumber.trim() || undefined, startTime: toTimestamp(form.startTime), endTime: toTimestamp(form.endTime),
      frequency: form.frequency.trim() || undefined, priority: Number(form.priority), resultTypes: form.resultTypes,
    })
    showCreate.value = false
    message.value = '需求工单提交成功'
    pageNum.value = 1
    await Promise.all([loadPage(), loadSummary()])
  } catch (reason) { message.value = reason instanceof Error ? reason.message : '需求工单提交失败' }
  finally { submitting.value = false }
}

async function openDetail(id: string) {
  message.value = ''
  try { detail.value = await getRequestTicketDetail(id) }
  catch (reason) { message.value = reason instanceof Error ? reason.message : '工单详情加载失败' }
}

async function removeTicket(ticket: RequestTicket) {
  if (!window.confirm(`确定删除需求工单“${ticket.name}”吗？`)) return
  try {
    await deleteRequestTicket(ticket.id)
    message.value = '需求工单已删除'
    if (records.value.length === 1 && pageNum.value > 1) pageNum.value -= 1
    await Promise.all([loadPage(), loadSummary()])
  } catch (reason) { message.value = reason instanceof Error ? reason.message : '删除需求工单失败' }
}

onMounted(() => void loadInitial())
</script>

<template>
  <section class="ticket-page">
    <header class="ticket-heading"><button type="button" @click="openCreate">＋ 新建工单</button></header>
    <section class="summary-cards">
      <article><i>▣</i><div><span>工单总数</span><b>{{ displayCount(summaryCounts.total) }}<small>条</small></b><em>当前单位全部需求</em></div></article>
      <article><i>◷</i><div><span>待执行</span><b>{{ displayCount(summaryCounts.pending) }}<small>条</small></b><em>等待排期与资源确认</em></div></article>
      <article><i>↗</i><div><span>执行中</span><b>{{ displayCount(summaryCounts.running) }}<small>条</small></b><em>按计划推进中的工单</em></div></article>
      <article><i>✓</i><div><span>已完成</span><b>{{ displayCount(summaryCounts.completed) }}<small>条</small></b><em>可查看历史执行记录</em></div></article>
    </section>
    <section class="ticket-card filters-card"><header><b>筛选工单</b><button type="button" @click="resetFilters">重置筛选</button></header><div class="filter-grid"><label><span>工单名称</span><input v-model="filters.name" placeholder="搜索工单名称" @keyup.enter="applyFilters" /></label><label><span>工单类型</span><select v-model="filters.type" @change="applyFilters"><option value="">全部类型</option><option v-for="item in types" :key="item.id" :value="item.name">{{ item.name }}</option></select></label><label><span>优先级</span><select v-model="filters.priority" @change="applyFilters"><option value="">全部优先级</option><option value="0">高</option><option value="1">中</option><option value="2">低</option></select></label><label><span>工单状态</span><select v-model="filters.status" @change="applyFilters"><option value="">全部状态</option><option value="0">待执行</option><option value="1">执行中</option><option value="2">已完成</option><option value="3">已关闭</option></select></label></div></section>
    <section class="ticket-card table-card"><header><div><b>工单列表</b><span>共 {{ total }} 条结果</span></div><div class="flow"><span>● 需求受理</span><i>→</i><span>排期确认</span><i>→</i><span>执行反馈</span></div></header><div class="table-wrap"><table><thead><tr><th>工单编号</th><th>工单名称</th><th>工单描述</th><th>工单类型</th><th>优先级</th><th>状态</th><th>工单期限</th><th>操作</th></tr></thead><tbody><tr v-for="ticket in records" :key="ticket.id"><td><b class="number">{{ ticket.number || ticket.id }}</b></td><td><b>{{ ticket.name }}</b><small>{{ ticket.createByName || '--' }}</small></td><td class="description">{{ ticket.description || '--' }}</td><td><span class="type-tag">{{ typeLabel(ticket.type) }}</span></td><td><span class="priority" :class="`p-${ticket.priority}`">{{ priorityLabel(ticket.priority) }}</span></td><td><span class="status" :class="`s-${ticket.status}`">● {{ statusLabel(ticket.status) }}</span></td><td>{{ formatTime(ticket.startTime) }}<br />至 {{ formatTime(ticket.endTime) }}</td><td><button type="button" @click="openDetail(ticket.id)">查看</button><button type="button" class="danger" @click="removeTicket(ticket)">删除</button></td></tr><tr v-if="loading"><td colspan="8" class="empty-row">正在加载需求工单…</td></tr><tr v-else-if="error"><td colspan="8" class="empty-row error">{{ error }}</td></tr><tr v-else-if="!records.length"><td colspan="8" class="empty-row">暂无符合条件的需求工单</td></tr></tbody></table></div><footer><span>第 {{ pageNum }} / {{ pageCount }} 页，共 {{ total }} 条</span><div><button :disabled="pageNum <= 1" @click="changePage(pageNum - 1)">‹</button><b>{{ pageNum }}</b><button :disabled="pageNum >= pageCount" @click="changePage(pageNum + 1)">›</button></div></footer></section>
    <p v-if="message" class="ticket-message" @click="message = ''">{{ message }}</p>

    <div v-if="showCreate" class="modal-mask" @click.self="showCreate = false"><form class="ticket-modal create-modal" @submit.prevent="submitTicket"><header><div><h2>新建需求工单</h2><p>填写需求信息并提交至后端工单服务</p></div><button type="button" @click="showCreate = false">×</button></header><div class="form-grid"><label><span>工单名称 *</span><input v-model="form.name" maxlength="100" required /></label><label><span>工单类型 *</span><select v-model="form.type" required><option value="" disabled>请选择工单类型</option><option v-for="item in types" :key="item.id" :value="item.name">{{ item.name }}</option></select></label><label class="wide"><span>工单描述</span><textarea v-model="form.description" rows="3"></textarea></label><label><span>需求单位</span><select v-model="form.requester"><option value="" disabled>{{ requesterOptions.length ? '请选择需求单位' : '暂无可选需求单位' }}</option><option v-for="item in requesterOptions" :key="item.deptId" :value="item.deptName">{{ item.deptName }}</option></select></label><label><span>执行频率</span><input v-model="form.frequency" placeholder="如：每周一次" /></label><label><span>联系人</span><input v-model="form.contactPerson" /></label><label><span>联系电话</span><input v-model="form.contactNumber" /></label><label class="wide schedule-field"><span>计划时间</span><TaskSchedulePicker v-model="ticketSchedule" theme="light" /></label><label><span>优先级</span><select v-model="form.priority"><option value="0">高</option><option value="1">中</option><option value="2">低</option></select></label><fieldset class="wide"><legend>期望成果类型</legend><label v-for="item in resultTypeOptions" :key="item[0]"><input v-model="form.resultTypes" type="checkbox" :value="item[0]" />{{ item[1] }}</label></fieldset></div><footer><button type="button" @click="showCreate = false">取消</button><button type="submit" class="primary" :disabled="submitting">{{ submitting ? '提交中…' : '提交工单' }}</button></footer></form></div>
    <div v-if="detail" class="modal-mask" @click.self="detail = undefined"><section class="ticket-modal detail-modal"><header><div><h2>{{ detail.name }}</h2><p>{{ detail.number || detail.id }}</p></div><button type="button" @click="detail = undefined">×</button></header><dl><div><dt>工单类型</dt><dd>{{ typeLabel(detail.type) }}</dd></div><div><dt>状态</dt><dd>{{ statusLabel(detail.status) }}</dd></div><div><dt>优先级</dt><dd>{{ priorityLabel(detail.priority) }}</dd></div><div><dt>需求单位</dt><dd>{{ detail.requester || '--' }}</dd></div><div><dt>联系人</dt><dd>{{ detail.contactPerson || '--' }}</dd></div><div><dt>联系电话</dt><dd>{{ detail.contactNumber || '--' }}</dd></div><div><dt>执行频率</dt><dd>{{ detail.frequency || '--' }}</dd></div><div><dt>工单期限</dt><dd>{{ formatTime(detail.startTime) }} 至 {{ formatTime(detail.endTime) }}</dd></div><div class="wide"><dt>期望成果</dt><dd>{{ detail.resultTypes?.map(item => resultTypeOptions.find(row => row[0] === item)?.[1] || item).join('、') || '--' }}</dd></div><div class="wide"><dt>工单描述</dt><dd>{{ detail.description || '--' }}</dd></div></dl></section></div>
  </section>
</template>

<style scoped lang="scss">
.ticket-page{box-sizing:border-box;height:100%;min-height:0;display:grid;grid-template-rows:auto auto auto minmax(0,1fr);gap:12px;padding:16px;overflow:hidden;color:#29475a;background:#edf4f7}.ticket-heading{display:flex;justify-content:flex-end}.ticket-heading>button{height:38px;padding:0 18px;color:#fff;background:#0c91b8;border:1px solid #28b9d7;border-radius:5px;box-shadow:0 4px 10px #087d9b35;cursor:pointer}.summary-cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:11px}.summary-cards article{min-height:82px;display:flex;align-items:center;gap:13px;padding:10px 16px;background:#fff;border:1px solid #d4e1e8;border-radius:7px}.summary-cards i{width:42px;height:42px;display:grid;place-items:center;color:#0792a8;background:#e5f6f8;border-radius:8px;font-size:21px;font-style:normal}.summary-cards article:nth-child(2) i{color:#d9941e;background:#fff4dc}.summary-cards article:nth-child(3) i{color:#198fe0;background:#e8f3ff}.summary-cards article:nth-child(4) i{color:#17a77d;background:#e5f7f1}.summary-cards span,.summary-cards b,.summary-cards em{display:block}.summary-cards span{color:#708997;font-size:12px}.summary-cards b{margin:2px 0;color:#173f57;font-size:25px}.summary-cards b small{margin-left:4px;font-size:11px}.summary-cards em{color:#91a3ac;font-size:10px;font-style:normal}.ticket-card{background:#fff;border:1px solid #d4e1e8;border-radius:7px;box-shadow:0 2px 8px #23485a0c;overflow:hidden}.ticket-card>header{height:42px;display:flex;align-items:center;justify-content:space-between;padding:0 15px;border-bottom:1px solid #e4edf2}.ticket-card>header b{color:#24485d;font-size:14px}.ticket-card>header button{color:#118aac;background:transparent;border:0;cursor:pointer}.filter-grid{display:grid;grid-template-columns:1.2fr repeat(3,1fr);gap:12px;padding:12px 15px}.filter-grid label span{display:block;margin-bottom:6px;color:#718895;font-size:11px}.filter-grid input,.filter-grid select{box-sizing:border-box;width:100%;height:34px;padding:0 10px;color:#35576a;background:#fbfdfe;border:1px solid #c9dce7;border-radius:4px;outline:0}.filter-grid input:focus,.filter-grid select:focus{border-color:#189abd;box-shadow:0 0 0 2px #189abd1c}.table-card{min-height:0;display:flex;flex-direction:column}.table-card>header>div{display:flex;align-items:center;gap:12px}.table-card>header span{color:#7a919d;font-size:11px}.flow i{color:#8bb2c1;font-style:normal}.flow span:first-child{color:#15a9b4}.table-wrap{min-height:0;flex:1;overflow:auto}.table-wrap table{width:100%;min-width:1120px;border-collapse:collapse;font-size:11px}.table-wrap th{height:40px;padding:0 12px;color:#66818f;background:#f2f7f9;text-align:left;font-weight:600}.table-wrap td{height:57px;padding:7px 12px;color:#58717f;border-bottom:1px solid #e7eef2}.table-wrap td>b,.table-wrap td>small{display:block}.table-wrap td>b{color:#274b60;font-size:12px}.table-wrap td>small{margin-top:4px;color:#8a9da7;font-size:9px}.table-wrap .number{color:#088bac}.description{max-width:280px}.type-tag,.priority{display:inline-block;padding:4px 7px;border-radius:3px}.type-tag{color:#198aac;background:#e9f6fa}.priority{color:#697d88;background:#edf2f4}.priority.p-0{color:#c66d25;background:#fff0e6}.priority.p-1{color:#ad7c18;background:#fff5d9}.status{white-space:nowrap}.status.s-0{color:#d68d18}.status.s-1{color:#178fc4}.status.s-2{color:#168a68}.status.s-3{color:#7b8d96}.table-wrap td button{padding:3px 5px;color:#0788aa;background:transparent;border:0;cursor:pointer}.table-wrap td button.danger{color:#d3595f}.empty-row{height:150px!important;color:#8298a4!important;text-align:center}.empty-row.error{color:#c8555f!important}.table-card>footer{height:43px;display:flex;align-items:center;justify-content:space-between;padding:0 15px;color:#78909d;font-size:11px}.table-card>footer div{display:flex;align-items:center;gap:7px}.table-card>footer button,.table-card>footer b{width:28px;height:28px;display:grid;place-items:center;border:1px solid #d0e0e7;border-radius:4px;background:#fff;color:#66818f}.table-card>footer b{color:#fff;background:#1196b8;border-color:#1196b8}.table-card>footer button:disabled{opacity:.4}.ticket-message{position:fixed;z-index:1200;top:82px;left:50%;margin:0;padding:10px 18px;transform:translateX(-50%);color:#fff;background:#125c73;border:1px solid #2eb8d2;border-radius:5px;box-shadow:0 8px 24px #183d4f55;cursor:pointer}.modal-mask{position:fixed;z-index:2000;inset:0;display:grid;place-items:center;padding:25px;background:#102b3b75}.ticket-modal{width:min(760px,94vw);max-height:92vh;overflow:auto;color:#29475a;background:#fff;border:1px solid #9fc4d3;border-radius:8px;box-shadow:0 20px 60px #17384a66}.ticket-modal>header{display:flex;align-items:center;justify-content:space-between;padding:15px 19px;border-bottom:1px solid #dce8ed}.ticket-modal h2,.ticket-modal p{margin:0}.ticket-modal h2{font-size:20px}.ticket-modal header p{margin-top:4px;color:#7e929d;font-size:11px}.ticket-modal header button{color:#78909d;background:transparent;border:0;font-size:25px;cursor:pointer}.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:13px;padding:18px}.form-grid label>span,.form-grid legend{display:block;margin-bottom:6px;color:#607987;font-size:12px}.form-grid input,.form-grid select,.form-grid textarea{box-sizing:border-box;width:100%;min-height:36px;padding:7px 9px;color:#29475a;background:#fbfdfe;border:1px solid #c8dae4;border-radius:4px;outline:0}.form-grid textarea{resize:vertical}.form-grid .wide,.form-grid fieldset.wide{grid-column:1/-1}.form-grid fieldset{margin:0;padding:11px;border:1px solid #d3e1e7;border-radius:4px}.form-grid fieldset label{display:inline-flex;align-items:center;gap:5px;margin:4px 14px 4px 0;font-size:12px}.form-grid fieldset input{width:auto;min-height:auto}.ticket-modal>footer{display:flex;justify-content:flex-end;gap:9px;padding:12px 18px;background:#f5f8fa;border-top:1px solid #dce8ed}.ticket-modal>footer button{min-width:84px;height:35px;color:#496a7a;background:#fff;border:1px solid #bfd3dc;border-radius:4px;cursor:pointer}.ticket-modal>footer button.primary{color:#fff;background:#0c91b8;border-color:#0c91b8}.ticket-modal>footer button:disabled{opacity:.6}.detail-modal dl{display:grid;grid-template-columns:1fr 1fr;margin:0;padding:18px;gap:0 22px}.detail-modal dl>div{display:grid;grid-template-columns:86px 1fr;padding:10px 0;border-bottom:1px solid #edf2f4}.detail-modal dl>div.wide{grid-column:1/-1}.detail-modal dt{color:#7a909c}.detail-modal dd{margin:0;color:#29475a;font-weight:600}.detail-modal .wide dd{line-height:1.6}@media(max-height:760px){.ticket-page{gap:8px;padding:10px}.summary-cards article{min-height:62px;padding:7px 12px}.summary-cards i{width:34px;height:34px}.summary-cards b{font-size:20px}.filter-grid{padding:8px 12px}.ticket-card>header{height:36px}.table-wrap td{height:48px}}
.filter-grid select:hover,.filter-grid select:focus{color:#fff;background:#075273;border-color:#1599c1}
.filter-grid select option{color:#35576a;background:#fff}
.filter-grid input:focus::placeholder{color:transparent}
.form-grid select:hover,.form-grid select:focus{color:#fff;background:#075273;border-color:#1599c1;box-shadow:0 0 0 2px #189abd1c}
.form-grid select option{color:#29475a;background:#fff}
.form-grid input:focus::placeholder,.form-grid textarea:focus::placeholder{color:transparent}
</style>
