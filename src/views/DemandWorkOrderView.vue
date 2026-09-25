<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import PlatformLayout from '@/layouts/PlatformLayout.vue'

type WorkOrder = {
  id: string
  name: string
  description: string
  type: string
  priority: '高' | '中' | '低'
  status: '待执行' | '执行中' | '已完成'
  start: string
  end: string
  owner: string
}

const menu = [
  { label: '任务总览', path: '/task-center/overview', icon: '总' },
  { label: '任务列表', path: '/tasks', icon: '列' },
  { label: '场景任务', path: '/task-center/scenes', icon: '景' },
  { label: '我的待办', path: '/task-center/todo', icon: '待' },
  { label: '需求工单', path: '/task-center/work-orders', icon: '单' },
]
const initialOrders: WorkOrder[] = [
  { id: 'GD260916114956791', name: '九龙镇综合巡检', description: '每周三、周日视频巡检，核对重点区域变化并留存巡查影像。', type: '综合巡检', priority: '高', status: '待执行', start: '2026-09-01', end: '2026-12-31', owner: '自然资源巡查组' },
  { id: 'GD260910093114447', name: '20260910航飞', description: '航拍测试，核验航线覆盖、图传质量与成果回传情况。', type: '地图测试', priority: '高', status: '待执行', start: '2026-09-01', end: '2026-12-31', owner: '无人机作业组' },
  { id: 'GD260908110751262', name: '测试工单', description: '测试图层叠加、地图定位与工单派发链路。', type: '地图测试', priority: '高', status: '待执行', start: '2026-09-08', end: '2026-09-30', owner: '平台运营组' },
]
const orders = ref<WorkOrder[]>(initialOrders.map(item => ({ ...item })))
const filters = reactive({ keyword: '', type: '', priority: '', status: '' })
const page = ref(1)
const pageSize = ref(10)
const dialogMode = ref<'create' | 'edit' | 'view' | null>(null)
const selectedId = ref('')
const notice = ref('')
const form = reactive<WorkOrder>({ id: '', name: '', description: '', type: '综合巡检', priority: '中', status: '待执行', start: '2026-09-22', end: '2026-10-22', owner: '' })

const filteredOrders = computed(() => orders.value.filter(item =>
  (!filters.keyword || `${item.id}${item.name}${item.description}`.toLowerCase().includes(filters.keyword.trim().toLowerCase())) &&
  (!filters.type || item.type === filters.type) &&
  (!filters.priority || item.priority === filters.priority) &&
  (!filters.status || item.status === filters.status),
))
const pageCount = computed(() => Math.max(1, Math.ceil(filteredOrders.value.length / pageSize.value)))
const visibleOrders = computed(() => filteredOrders.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))
const pendingCount = computed(() => orders.value.filter(item => item.status === '待执行').length)
const runningCount = computed(() => orders.value.filter(item => item.status === '执行中').length)
const completedCount = computed(() => orders.value.filter(item => item.status === '已完成').length)
watch(filters, () => { page.value = 1 })
watch(pageSize, () => { page.value = 1 })

function openOrder(mode: 'create' | 'edit' | 'view', item?: WorkOrder) {
  dialogMode.value = mode
  selectedId.value = item?.id || ''
  Object.assign(form, item || { id: '', name: '', description: '', type: '综合巡检', priority: '中', status: '待执行', start: '2026-09-22', end: '2026-10-22', owner: '' })
}
function saveOrder() {
  if (!form.name.trim() || !form.description.trim() || !form.owner.trim()) { notice.value = '请填写工单名称、描述和负责单位。'; return }
  if (form.end < form.start) { notice.value = '工单结束日期不能早于开始日期。'; return }
  if (dialogMode.value === 'create') {
    const id = `GD${new Date().toISOString().slice(2,10).replace(/-/g, '')}${String(Date.now()).slice(-7)}`
    orders.value.unshift({ ...form, id })
    notice.value = `演示工单 ${id} 已加入当前页面，未写入业务系统。`
  } else {
    const index = orders.value.findIndex(item => item.id === selectedId.value)
    if (index >= 0) orders.value[index] = { ...form, id: selectedId.value }
    notice.value = `演示工单 ${selectedId.value} 已在当前页面更新。`
  }
  dialogMode.value = null
  page.value = 1
}
function removeOrder(item: WorkOrder) {
  if (!window.confirm(`确定从当前演示页面删除工单“${item.name}”吗？`)) return
  orders.value = orders.value.filter(order => order.id !== item.id)
  page.value = Math.min(page.value, Math.max(1, Math.ceil(filteredOrders.value.length / pageSize.value)))
  notice.value = `演示工单 ${item.id} 已从当前页面移除。`
}
</script>

<template>
  <PlatformLayout section="task" title="任务中心" subtitle="需求受理、派发与执行进度管理" :menu="menu">
    <div class="work-order-page">
      <div class="page-head"><div><h2>需求工单</h2><p>集中管理巡检、航飞和地图测试需求，跟踪从受理到执行的全过程</p></div><div class="head-actions"><span><i></i> 工单服务运行正常</span><button class="primary" @click="openOrder('create')">＋ 新建工单</button></div></div>

      <div class="overview-cards">
        <article><div class="metric-icon cyan">▣</div><div><span>工单总数</span><strong>{{ orders.length }}<small> 条</small></strong><p>当前单位全部需求</p></div><i class="metric-mark">ALL</i></article>
        <article><div class="metric-icon amber">◷</div><div><span>待执行</span><strong>{{ pendingCount }}<small> 条</small></strong><p>等待排期与资源确认</p></div><i class="metric-mark">WAIT</i></article>
        <article><div class="metric-icon blue">↗</div><div><span>执行中</span><strong>{{ runningCount }}<small> 条</small></strong><p>按计划推进中的工单</p></div><i class="metric-mark">LIVE</i></article>
        <article><div class="metric-icon green">✓</div><div><span>已完成</span><strong>{{ completedCount }}<small> 条</small></strong><p>可查看历史执行记录</p></div><i class="metric-mark">DONE</i></article>
      </div>

      <section class="surface filter-card"><header><div><b>筛选工单</b><span>按名称、类型、优先级和状态快速定位</span></div><button class="reset" @click="Object.assign(filters, { keyword:'', type:'', priority:'', status:'' })">重置筛选</button></header><div class="filter-fields"><label><span>工单名称 / 编号</span><input v-model="filters.keyword" placeholder="搜索工单名称或编号" /></label><label><span>工单类型</span><select v-model="filters.type"><option value="">全部类型</option><option>综合巡检</option><option>地图测试</option><option>专项航飞</option><option>成果复核</option></select></label><label><span>优先级</span><select v-model="filters.priority"><option value="">全部优先级</option><option>高</option><option>中</option><option>低</option></select></label><label><span>工单状态</span><select v-model="filters.status"><option value="">全部状态</option><option>待执行</option><option>执行中</option><option>已完成</option></select></label></div></section>

      <section class="surface table-card"><header><div><b>工单列表</b><span>共 {{ filteredOrders.length }} 条结果 · 演示数据</span></div><div class="legend"><i></i> 需求受理 <em>→</em> 排期确认 <em>→</em> 执行反馈</div></header>
        <div class="table-scroll"><table><thead><tr><th>工单编号</th><th>工单名称</th><th>工单描述</th><th>工单类型</th><th>优先级</th><th>状态</th><th>工单期限</th><th>操作</th></tr></thead><tbody><tr v-for="item in visibleOrders" :key="item.id"><td class="id-cell">{{ item.id }}</td><td><b>{{ item.name }}</b><small>{{ item.owner }}</small></td><td class="description-cell" :title="item.description">{{ item.description }}</td><td><span class="type-chip">{{ item.type }}</span></td><td><span class="priority-chip" :class="item.priority">{{ item.priority }}</span></td><td><span class="status-chip" :class="item.status"><i></i>{{ item.status }}</span></td><td class="date-cell">{{ item.start }}<span>至</span>{{ item.end }}</td><td><div class="row-actions"><button @click="openOrder('view', item)">查看</button><button @click="openOrder('edit', item)">编辑</button><button class="delete" @click="removeOrder(item)">删除</button></div></td></tr><tr v-if="!visibleOrders.length"><td colspan="8" class="empty-cell">没有匹配的工单，请调整筛选条件。</td></tr></tbody></table></div>
        <footer><span>显示 {{ visibleOrders.length ? (page-1)*pageSize+1 : 0 }}–{{ Math.min(page*pageSize, filteredOrders.length) }} 条，共 {{ filteredOrders.length }} 条</span><div class="pagination"><button :disabled="page===1" @click="page--">‹</button><button class="active">{{ page }}</button><button :disabled="page===pageCount" @click="page++">›</button><select v-model.number="pageSize"><option :value="10">10 条 / 页</option><option :value="20">20 条 / 页</option><option :value="30">30 条 / 页</option></select></div></footer></section>

      <div class="help-strip"><span class="help-icon">ⓘ</span><div><b>工单与治理任务如何衔接？</b><p>需求工单用于收集和安排巡检、航飞等作业需求；执行后产生的巡查线索，可进入任务中心开展研判与闭环处置。</p></div><button @click="notice='演示页面：完整的工单配置说明待业务规则确认后接入。'">了解流程 ›</button></div>
      <div v-if="notice" class="notice" role="status">{{ notice }} <button @click="notice=''">×</button></div>
    </div>

    <div v-if="dialogMode" class="dialog-backdrop" @click.self="dialogMode=null"><section class="order-dialog"><header><div><small>WORK ORDER / DEMO</small><h3>{{ dialogMode==='create' ? '新建需求工单' : dialogMode==='edit' ? '编辑需求工单' : '工单详情' }}</h3></div><button @click="dialogMode=null">×</button></header><div class="dialog-form"><label>工单名称<input v-model="form.name" :disabled="dialogMode==='view'" placeholder="请输入工单名称" /></label><label>工单类型<select v-model="form.type" :disabled="dialogMode==='view'"><option>综合巡检</option><option>地图测试</option><option>专项航飞</option><option>成果复核</option></select></label><label class="wide">工单描述<textarea v-model="form.description" :disabled="dialogMode==='view'" rows="3" placeholder="说明作业内容、范围和成果要求"></textarea></label><label>优先级<select v-model="form.priority" :disabled="dialogMode==='view'"><option>高</option><option>中</option><option>低</option></select></label><label>状态<select v-model="form.status" :disabled="dialogMode==='view'"><option>待执行</option><option>执行中</option><option>已完成</option></select></label><label>开始日期<input v-model="form.start" :disabled="dialogMode==='view'" type="date" /></label><label>结束日期<input v-model="form.end" :disabled="dialogMode==='view'" type="date" /></label><label class="wide">负责单位<input v-model="form.owner" :disabled="dialogMode==='view'" placeholder="请输入负责单位" /></label></div><footer><span>当前为效果图演示，操作仅保留在本页面。</span><button @click="dialogMode=null">关闭</button><button v-if="dialogMode!=='view'" class="primary" @click="saveOrder">{{ dialogMode==='create' ? '创建工单' : '保存修改' }}</button></footer></section></div>
  </PlatformLayout>
</template>

<style scoped>
.work-order-page{position:relative;min-height:100%;color:#25495a}.head-actions{display:flex;align-items:center;gap:15px}.head-actions span{color:#77949e;font-size:11px}.head-actions span i{display:inline-block;width:7px;height:7px;margin-right:3px;border-radius:50%;background:#1fc297}.primary{height:36px;padding:0 15px;border:1px solid #098cb1;border-radius:5px;background:#078eb0;color:white;font-size:12px;font-weight:600;cursor:pointer;box-shadow:0 3px 8px #098cb133}.overview-cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:11px;margin:13px 0}.overview-cards article{position:relative;display:flex;align-items:center;gap:12px;height:91px;box-sizing:border-box;padding:13px 15px;background:white;border:1px solid #d7e5ec;border-radius:8px;box-shadow:0 3px 12px #173b5010}.metric-icon{width:43px;height:43px;display:grid;place-items:center;flex:0 0 auto;border-radius:9px;font-size:23px;font-weight:600}.metric-icon.cyan{color:#0c93aa;background:#e5f7f9}.metric-icon.amber{color:#cc8a2c;background:#fff4df}.metric-icon.blue{color:#2185c4;background:#e8f3ff}.metric-icon.green{color:#169778;background:#e5f8f1}.overview-cards article span{color:#68818e;font-size:11px}.overview-cards article strong{display:block;margin:3px 0;color:#123e54;font-size:24px;line-height:26px}.overview-cards article strong small{font-size:11px}.overview-cards article p{margin:0;color:#9aadb6;font-size:9px}.metric-mark{position:absolute;right:13px;top:15px;color:#d2e1e8;font-size:9px;font-style:normal;letter-spacing:1px}.filter-card header,.table-card header{height:44px;display:flex;align-items:center;justify-content:space-between;padding:0 14px;border-bottom:1px solid #e8eff2}.filter-card header b,.table-card header b{font-size:13px}.filter-card header span,.table-card header span{margin-left:10px;color:#96a8b0;font-size:10px}.reset{padding:6px 9px;border:0;background:transparent;color:#158eaa;font-size:10px;cursor:pointer}.filter-fields{display:grid;grid-template-columns:1.25fr repeat(3,1fr);gap:11px;padding:12px 14px}.filter-fields label{color:#6b8591;font-size:10px}.filter-fields input,.filter-fields select{display:block;box-sizing:border-box;width:100%;height:34px;margin-top:6px;padding:0 9px;border:1px solid #d2e1e8;border-radius:4px;background:#f9fcfd;color:#315466;font-size:11px}.filter-fields input::placeholder{color:#a8b8c0}.table-card{margin-top:12px;overflow:hidden}.legend{color:#73909a;font-size:10px}.legend i{display:inline-block;width:7px;height:7px;border-radius:50%;background:#21b4c5}.legend em{margin:0 7px;color:#23a5b6;font-style:normal}.table-scroll{overflow-x:auto;min-height:315px}table{width:100%;border-collapse:collapse;table-layout:fixed}th{height:41px;padding:0 10px;background:#f2f8fa;color:#62808e;text-align:left;font-size:10px;font-weight:600}td{height:61px;padding:0 10px;border-bottom:1px solid #eaf0f3;color:#39596a;font-size:10px;vertical-align:middle}th:nth-child(1){width:143px}th:nth-child(2){width:143px}th:nth-child(3){width:auto}th:nth-child(4){width:88px}th:nth-child(5){width:64px}th:nth-child(6){width:74px}th:nth-child(7){width:171px}th:nth-child(8){width:125px}.id-cell{color:#168eab;font-weight:600;letter-spacing:.1px}td b,td small{display:block}td b{color:#1b4054;font-size:11px}td small{margin-top:5px;color:#9cabb3;font-size:9px}.description-cell{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#728d99}.type-chip{padding:5px 7px;color:#2585a6;background:#e9f5f9;border-radius:3px}.priority-chip{display:inline-block;min-width:30px;padding:5px 4px;text-align:center;border-radius:3px;font-weight:700}.priority-chip.高{color:#c66639;background:#fff0e9}.priority-chip.中{color:#b38627;background:#fff6e2}.priority-chip.低{color:#248d72;background:#e8f8f0}.status-chip{color:#c57d23;white-space:nowrap}.status-chip i{display:inline-block;width:6px;height:6px;margin-right:6px;border-radius:50%;background:#f2aa41}.status-chip.执行中{color:#158cac}.status-chip.执行中 i{background:#1da5bf}.status-chip.已完成{color:#178969}.status-chip.已完成 i{background:#1db885}.date-cell{white-space:nowrap;color:#5e7b89;font-size:9px}.date-cell span{padding:0 5px;color:#a5b5bd}.row-actions{display:flex;gap:8px}.row-actions button{padding:0;border:0;background:none;color:#168baa;font-size:10px;cursor:pointer}.row-actions button.delete{color:#d36d61}.empty-cell{height:160px;text-align:center;color:#9aaab2}.table-card footer{height:52px;display:flex;align-items:center;justify-content:space-between;padding:0 15px;color:#89a0aa;font-size:10px}.pagination{display:flex;align-items:center;gap:6px}.pagination button{width:26px;height:26px;border:1px solid #d6e5ec;border-radius:4px;background:#fff;color:#5e7a88;cursor:pointer}.pagination button.active{background:#138ead;border-color:#138ead;color:#fff}.pagination button:disabled{opacity:.45;cursor:not-allowed}.pagination select{height:27px;margin-left:7px;border:1px solid #d6e5ec;border-radius:4px;background:white;color:#63808c;font-size:10px}.help-strip{display:flex;align-items:center;gap:11px;margin-top:12px;padding:13px 16px;border:1px solid #cde3e9;border-left:3px solid #23b0c3;border-radius:5px;background:#f6fbfc}.help-icon{color:#1a9eb3;font-size:17px}.help-strip div{flex:1}.help-strip b{font-size:10px}.help-strip p{margin:4px 0 0;color:#7b929d;font-size:9px}.help-strip button{border:0;background:transparent;color:#168fa9;font-size:10px;cursor:pointer}.notice{position:fixed;right:26px;bottom:23px;z-index:8;padding:11px 14px;border:1px solid #9ad0dc;border-radius:6px;background:#e9f8fb;color:#167b94;font-size:11px;box-shadow:0 6px 25px #12394a20}.notice button{margin-left:10px;border:0;background:none;color:inherit;cursor:pointer}.dialog-backdrop{position:fixed;inset:0;z-index:30;display:grid;place-items:center;background:#082c3b88}.order-dialog{width:min(620px,90vw);border-radius:9px;background:#fff;box-shadow:0 20px 70px #001b2d55}.order-dialog>header{display:flex;justify-content:space-between;align-items:center;padding:17px 20px;border-bottom:1px solid #e4edf1}.order-dialog header small{color:#189ab0;font-size:9px;letter-spacing:1px}.order-dialog h3{margin:5px 0 0;color:#1c4051;font-size:20px}.order-dialog header button{border:0;background:none;color:#8ba0aa;font-size:23px;cursor:pointer}.dialog-form{display:grid;grid-template-columns:1fr 1fr;gap:13px;padding:20px}.dialog-form label{color:#617e8c;font-size:11px}.dialog-form label.wide{grid-column:1/-1}.dialog-form input,.dialog-form select,.dialog-form textarea{box-sizing:border-box;width:100%;margin-top:6px;padding:8px;border:1px solid #d1e0e7;border-radius:4px;background:#fbfdfe;color:#34566a;font:inherit}.dialog-form textarea{resize:vertical}.order-dialog footer{display:flex;align-items:center;justify-content:flex-end;gap:9px;padding:12px 20px;border-top:1px solid #e7eff2}.order-dialog footer span{flex:1;color:#94a5ad;font-size:10px}.order-dialog footer button:not(.primary){height:36px;padding:0 13px;border:1px solid #d3e0e6;border-radius:4px;background:white;color:#5e7d8c;cursor:pointer}
</style>
