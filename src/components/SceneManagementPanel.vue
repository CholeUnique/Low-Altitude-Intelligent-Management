<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { getDepartmentList, getUserPage, type DepartmentInfo } from '@/api/account-management'
import {
  addBizScene,
  addBizSceneAssignee,
  deleteBizScene,
  getBizSceneAssignees,
  getBizSceneDetail,
  getBizSceneList,
  updateBizScene,
  updateBizSceneAssignee,
  updateBizSceneStatus,
  type BizSceneAssignee,
  type BizSceneDto,
} from '@/api/scene'
import { useUserStore } from '@/stores/user'
import type { CurrentUser } from '@/types'

type EditorMode = 'add' | 'edit' | 'view'

const userStore = useUserStore()
const scenes = ref<BizSceneDto[]>([])
const assignees = ref<BizSceneAssignee[]>([])
const users = ref<CurrentUser[]>([])
const departments = ref<DepartmentInfo[]>([])
const selectedDeptId = ref('')
const departmentSceneCounts = ref<Record<string, number>>({})
const loading = ref(false)
const busy = ref(false)
const notice = ref('')
const errorMessage = ref('')
const filters = reactive<{ keyword: string; category: string; status: number | '' }>({ keyword: '', category: '', status: '' })

const categoryOptions = [
  ['LAND_SUPERVISION', '自然资源监管'],
  ['AGRICULTURE', '农业农村'],
  ['AQUATIC', '水域监管'],
] as const
const refTypeOptions = [
  ['NONE', '不默认关联'],
  ['PLAN', '飞行计划'],
  ['TASK', '飞行任务'],
] as const

const totalCount = computed(() => scenes.value.length)
const enabledCount = computed(() => scenes.value.filter((item) => item.status === 1).length)
const governanceCount = computed(() => scenes.value.filter((item) => item.governanceEnabled === 1).length)
const configuredCount = computed(() => assignees.value.filter((item) => item.assigneeId != null).length)
const selectedDepartment = computed(() => departments.value.find((item) => String(item.id) === selectedDeptId.value))
const sortedDepartments = computed(() => [...departments.value].sort((left, right) => {
  const leftCount = departmentSceneCounts.value[String(left.id)]
  const rightCount = departmentSceneCounts.value[String(right.id)]
  const rank = (count: number | undefined) => count === 0 ? 2 : count == null ? 1 : 0
  return rank(leftCount) - rank(rightCount)
    || (left.sort ?? 0) - (right.sort ?? 0)
    || left.name.localeCompare(right.name, 'zh-CN')
}))

function showResult(message: string) {
  notice.value = message
  errorMessage.value = ''
  window.setTimeout(() => { if (notice.value === message) notice.value = '' }, 2600)
}

function showError(error: unknown) {
  errorMessage.value = error instanceof Error ? error.message : '操作失败，请稍后重试'
  notice.value = ''
}

function categoryLabel(value?: string) {
  return categoryOptions.find((item) => item[0] === value)?.[1] || value || '未分类'
}

function refTypeLabel(value?: string) {
  return refTypeOptions.find((item) => item[0] === value)?.[1] || value || '不默认关联'
}

function formatTime(value?: string) {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false })
}

function assigneeFor(sceneCode: string) {
  return assignees.value.find((item) => item.sceneCode === sceneCode)
}

async function loadAssignees() {
  assignees.value = (await getBizSceneAssignees(selectedDeptId.value || undefined)) || []
}

async function loadUsers() {
  const result = await getUserPage({ deptId: selectedDeptId.value || undefined, pageNum: 1, pageSize: 100, status: 1 })
  users.value = result.records || []
}

async function loadScenes() {
  loading.value = true
  try {
    scenes.value = (await getBizSceneList({ ...filters, deptId: selectedDeptId.value || undefined, groupByCategory: false })) || []
    await loadAssignees()
  } catch (error) {
    showError(error)
  } finally {
    loading.value = false
  }
}

async function loadDepartments() {
  departments.value = (await getDepartmentList()) || []
  const activeDeptId = userStore.activeDeptId ? String(userStore.activeDeptId) : ''
  selectedDeptId.value = departments.value.some((item) => String(item.id) === activeDeptId)
    ? activeDeptId
    : String(departments.value[0]?.id || '')
  const countResults = await Promise.allSettled(departments.value.map(async (department) => {
    const deptId = String(department.id)
    const items = await getBizSceneList({ deptId, groupByCategory: false })
    return [deptId, items?.length || 0] as const
  }))
  departmentSceneCounts.value = Object.fromEntries(
    countResults.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []),
  )
}

function departmentOptionLabel(department: DepartmentInfo) {
  return `${department.name}${department.status === 0 ? '（停用）' : ''}`
}

async function changeDepartment() {
  users.value = []
  await loadScenes()
}

async function resetFilters() {
  Object.assign(filters, { keyword: '', category: '', status: '' })
  await loadScenes()
}

const editorOpen = ref(false)
const editorMode = ref<EditorMode>('add')
const editorTitle = computed(() => ({ add: '新增场景', edit: '编辑场景', view: '场景详情' })[editorMode.value])
const sceneForm = reactive({
  id: '', sceneCode: '', sceneName: '', category: '', description: '', governanceEnabled: 0,
  defaultRefType: 'NONE', metricJson: '', sort: 0, status: 1, deptName: '', createTime: '', updateTime: '',
})

function fillSceneForm(value?: BizSceneDto) {
  Object.assign(sceneForm, value ? {
    id: String(value.id), sceneCode: value.sceneCode || '', sceneName: value.sceneName || '', category: value.category || '',
    description: value.description || '', governanceEnabled: value.governanceEnabled ?? 0,
    defaultRefType: value.defaultRefType || 'NONE', metricJson: value.metricJson || '', sort: value.sort ?? 0,
    status: value.status ?? 1, deptName: value.deptName || '', createTime: value.createTime || '', updateTime: value.updateTime || '',
  } : {
    id: '', sceneCode: '', sceneName: '', category: '', description: '', governanceEnabled: 0,
    defaultRefType: 'NONE', metricJson: '', sort: 0, status: 1, deptName: '', createTime: '', updateTime: '',
  })
}

async function openEditor(mode: EditorMode, row?: BizSceneDto) {
  editorMode.value = mode
  fillSceneForm()
  if (row) {
    busy.value = true
    try {
      fillSceneForm(await getBizSceneDetail(String(row.id), selectedDeptId.value || undefined))
    } catch (error) {
      showError(error)
      return
    } finally {
      busy.value = false
    }
  }
  editorOpen.value = true
}

function normalizeMetricJson() {
  const value = sceneForm.metricJson.trim()
  if (!value) return undefined
  try {
    const parsed = JSON.parse(value)
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error()
    return JSON.stringify(parsed)
  } catch {
    throw new Error('指标与成果配置必须是有效的 JSON 对象')
  }
}

function formatMetricJson() {
  if (!sceneForm.metricJson.trim()) return
  try {
    sceneForm.metricJson = JSON.stringify(JSON.parse(sceneForm.metricJson), null, 2)
  } catch {
    showError(new Error('当前内容不是有效的 JSON，无法格式化'))
  }
}

async function submitScene() {
  const sceneCode = sceneForm.sceneCode.trim().toUpperCase()
  if (!sceneForm.sceneName.trim()) return showError(new Error('请输入场景名称'))
  if (editorMode.value === 'add' && !/^[A-Z0-9_]{2,64}$/.test(sceneCode)) {
    return showError(new Error('场景编码需为 2–64 位大写字母、数字或下划线'))
  }
  busy.value = true
  try {
    const metricJson = normalizeMetricJson()
    const common = {
      deptId: selectedDeptId.value || undefined,
      sceneName: sceneForm.sceneName.trim(), category: sceneForm.category || undefined,
      description: sceneForm.description.trim() || undefined, governanceEnabled: sceneForm.governanceEnabled,
      defaultRefType: sceneForm.defaultRefType, metricJson, sort: Number(sceneForm.sort || 0),
    }
    if (editorMode.value === 'add') {
      await addBizScene({ ...common, sceneCode, status: sceneForm.status })
      showResult('场景已新增')
    } else {
      await updateBizScene({ ...common, id: sceneForm.id })
      showResult('场景信息已更新')
    }
    editorOpen.value = false
    await loadScenes()
  } catch (error) {
    showError(error)
  } finally {
    busy.value = false
  }
}

async function toggleScene(row: BizSceneDto) {
  const nextStatus = row.status === 1 ? 0 : 1
  if (!window.confirm(`确认${nextStatus === 1 ? '启用' : '停用'}场景“${row.sceneName}”吗？`)) return
  try {
    await updateBizSceneStatus(String(row.id), nextStatus, selectedDeptId.value || undefined)
    showResult(`场景已${nextStatus === 1 ? '启用' : '停用'}`)
    await loadScenes()
  } catch (error) {
    showError(error)
  }
}

async function removeScene(row: BizSceneDto) {
  if (!window.confirm(`确认删除场景“${row.sceneName}”吗？该操作不可撤销。`)) return
  try {
    await deleteBizScene(String(row.id), selectedDeptId.value || undefined)
    showResult('场景已删除')
    await loadScenes()
  } catch (error) {
    showError(error)
  }
}

const assigneeOpen = ref(false)
const assigneeScene = ref<BizSceneDto>()
const assigneeId = ref('')
const assigneeSaving = ref(false)

async function openAssigneeEditor(row: BizSceneDto) {
  assigneeScene.value = row
  assigneeId.value = assigneeFor(row.sceneCode)?.assigneeId == null ? '' : String(assigneeFor(row.sceneCode)?.assigneeId)
  assigneeOpen.value = true
  if (users.value.length) return
  try {
    await loadUsers()
  } catch (error) {
    showError(error)
  }
}

function userLabel(user: CurrentUser) {
  return user.realName || user.nickname || user.username
}

async function saveAssignee() {
  const scene = assigneeScene.value
  if (!scene || !assigneeId.value) return showError(new Error('请选择初始派发负责人'))
  assigneeSaving.value = true
  try {
    const current = assigneeFor(scene.sceneCode)
    if (current?.assigneeId == null) {
      await addBizSceneAssignee(scene.sceneCode, assigneeId.value, selectedDeptId.value || undefined)
    } else {
      await updateBizSceneAssignee(scene.sceneCode, assigneeId.value, selectedDeptId.value || undefined)
    }
    await loadAssignees()
    assigneeOpen.value = false
    showResult('初始派发负责人已保存')
  } catch (error) {
    showError(error)
  } finally {
    assigneeSaving.value = false
  }
}

async function loadInitial() {
  loading.value = true
  try {
    await loadDepartments()
    await loadScenes()
  } catch (error) {
    showError(error)
    loading.value = false
  }
}

onMounted(() => void loadInitial())
</script>

<template>
  <section class="scene-management">
    <div v-if="notice" class="scene-message scene-message--success">{{ notice }}</div>
    <div v-if="errorMessage" class="scene-message scene-message--error">{{ errorMessage }}<button type="button" @click="errorMessage = ''">×</button></div>

    <div class="scene-heading">
      <div><h2>场景管理</h2><p>维护业务场景、运行状态及任务初始派发负责人</p></div>
      <button class="scene-button scene-button--primary" type="button" @click="openEditor('add')">＋ 新增场景</button>
    </div>

    <section class="scene-summary">
      <article><i>景</i><div><span>场景总数</span><b>{{ totalCount }}</b><small>{{ selectedDepartment?.name || '当前部门' }}全部场景</small></div></article>
      <article><i>启</i><div><span>已启用</span><b>{{ enabledCount }}</b><small>当前可用于业务任务</small></div></article>
      <article><i>治</i><div><span>治理场景</span><b>{{ governanceCount }}</b><small>需要后续治理闭环</small></div></article>
      <article><i>人</i><div><span>已配置负责人</span><b>{{ configuredCount }}</b><small>已设置初始派发人员</small></div></article>
    </section>

    <section class="scene-panel">
      <form class="scene-filters" @submit.prevent="loadScenes">
        <label class="department-filter"><span>管理部门</span><select v-model="selectedDeptId" :disabled="loading || !departments.length" @change="changeDepartment"><option value="" disabled>{{ departments.length ? '请选择管理部门' : '暂无可选部门' }}</option><option v-for="item in sortedDepartments" :key="String(item.id)" :value="String(item.id)">{{ departmentOptionLabel(item) }}</option></select></label>
        <label class="keyword-filter"><span>场景关键字</span><input v-model.trim="filters.keyword" placeholder="搜索场景名称或编码"></label>
        <label><span>场景分类</span><select v-model="filters.category"><option value="">全部分类</option><option v-for="item in categoryOptions" :key="item[0]" :value="item[0]">{{ item[1] }}</option></select></label>
        <label><span>运行状态</span><select v-model="filters.status"><option value="">全部状态</option><option :value="1">启用</option><option :value="0">停用</option></select></label>
        <div><button class="scene-button scene-button--primary" type="submit">查询</button><button class="scene-button scene-button--ghost" type="button" @click="resetFilters">重置</button></div>
      </form>
      <div class="scene-table-wrap">
        <table>
          <thead><tr><th>场景名称</th><th>场景分类</th><th>归属部门</th><th>业务配置</th><th>初始派发负责人</th><th>排序</th><th>状态</th><th>更新时间</th><th>操作</th></tr></thead>
          <tbody>
            <tr v-if="loading"><td colspan="9" class="scene-empty">正在加载场景数据…</td></tr>
            <tr v-else-if="!scenes.length"><td colspan="9" class="scene-empty">暂无符合条件的场景</td></tr>
            <tr v-for="row in scenes" v-else :key="String(row.id)">
              <td><strong>{{ row.sceneName }}</strong><small>{{ row.sceneCode }}</small></td>
              <td><span class="scene-category">{{ categoryLabel(row.category) }}</span></td>
              <td>{{ row.deptName || '-' }}</td>
              <td><span :class="row.governanceEnabled === 1 ? 'scene-governance on' : 'scene-governance'">{{ row.governanceEnabled === 1 ? '需要治理' : '无需治理' }}</span><small>{{ refTypeLabel(row.defaultRefType) }}</small></td>
              <td><strong>{{ assigneeFor(row.sceneCode)?.assigneeName || '未配置' }}</strong><small v-if="assigneeFor(row.sceneCode)?.assigneeId">用户 ID：{{ assigneeFor(row.sceneCode)?.assigneeId }}</small></td>
              <td>{{ row.sort ?? 0 }}</td>
              <td><span class="scene-status" :class="row.status === 1 ? 'scene-status--on' : 'scene-status--off'">{{ row.status === 1 ? '启用' : '停用' }}</span></td>
              <td>{{ formatTime(row.updateTime || row.createTime) }}</td>
              <td class="scene-actions"><button type="button" @click="openEditor('view', row)">详情</button><button type="button" @click="openEditor('edit', row)">编辑</button><button type="button" @click="openAssigneeEditor(row)">配置负责人</button><button type="button" @click="toggleScene(row)">{{ row.status === 1 ? '停用' : '启用' }}</button><button class="danger" type="button" @click="removeScene(row)">删除</button></td>
            </tr>
          </tbody>
        </table>
      </div>
      <footer>共 {{ scenes.length }} 个场景<span>数据来自当前部门场景服务</span></footer>
    </section>

    <div v-if="editorOpen" class="scene-mask" @mousedown.self="editorOpen = false">
      <section class="scene-modal scene-modal--wide" role="dialog" aria-modal="true">
        <header><div><h2>{{ editorTitle }}</h2><p>配置业务场景的基础信息与运行规则</p></div><button type="button" @click="editorOpen = false">×</button></header>
        <form class="scene-form" @submit.prevent="submitScene">
          <section class="scene-form-section">
            <h3><span>01</span>基础信息</h3>
            <div class="scene-form-grid">
              <label><span>场景名称 *</span><input v-model.trim="sceneForm.sceneName" maxlength="200" :disabled="editorMode === 'view'" required></label>
              <label><span>场景编码 *</span><input v-model.trim="sceneForm.sceneCode" maxlength="64" placeholder="例如 FOREST_LAW_ENFORCE" :disabled="editorMode !== 'add'" required></label>
              <label><span>场景分类</span><select v-model="sceneForm.category" :disabled="editorMode === 'view'"><option value="">请选择场景分类</option><option v-for="item in categoryOptions" :key="item[0]" :value="item[0]">{{ item[1] }}</option></select></label>
              <label><span>排序</span><input v-model.number="sceneForm.sort" type="number" :disabled="editorMode === 'view'"></label>
              <label class="wide"><span>场景说明</span><textarea v-model.trim="sceneForm.description" maxlength="1000" rows="3" :disabled="editorMode === 'view'" placeholder="请输入场景的业务用途和适用范围"></textarea></label>
            </div>
          </section>
          <section class="scene-form-section">
            <h3><span>02</span>业务规则</h3>
            <div class="scene-form-grid">
              <label><span>后续治理</span><select v-model.number="sceneForm.governanceEnabled" :disabled="editorMode === 'view'"><option :value="1">需要后续治理</option><option :value="0">无需后续治理</option></select></label>
              <label><span>默认关联类型</span><select v-model="sceneForm.defaultRefType" :disabled="editorMode === 'view'"><option v-for="item in refTypeOptions" :key="item[0]" :value="item[0]">{{ item[1] }}</option></select></label>
              <label v-if="editorMode === 'add'"><span>初始状态</span><select v-model.number="sceneForm.status"><option :value="1">启用</option><option :value="0">停用</option></select></label>
              <label v-else><span>当前状态</span><input :value="sceneForm.status === 1 ? '启用' : '停用'" disabled></label>
              <label v-if="editorMode !== 'add'"><span>归属部门</span><input :value="sceneForm.deptName || '-'" disabled></label>
            </div>
          </section>
          <section class="scene-form-section metric-section">
            <div class="metric-heading"><h3><span>03</span>指标与成果配置</h3><button v-if="editorMode !== 'view'" type="button" @click="formatMetricJson">格式化 JSON</button></div>
            <p>配置统计指标字典和成果类型字典；留空时由后端使用空字典。</p>
            <textarea v-model="sceneForm.metricJson" :disabled="editorMode === 'view'" rows="8" spellcheck="false" placeholder='{ "metrics": [], "resultTypes": [] }'></textarea>
          </section>
          <div v-if="editorMode === 'view'" class="scene-audit"><span>创建时间：{{ formatTime(sceneForm.createTime) }}</span><span>更新时间：{{ formatTime(sceneForm.updateTime) }}</span></div>
          <div class="scene-form-actions"><button class="scene-button scene-button--ghost" type="button" @click="editorOpen = false">{{ editorMode === 'view' ? '关闭' : '取消' }}</button><button v-if="editorMode !== 'view'" class="scene-button scene-button--primary" type="submit" :disabled="busy">{{ busy ? '保存中…' : '保存场景' }}</button></div>
        </form>
      </section>
    </div>

    <div v-if="assigneeOpen" class="scene-mask" @mousedown.self="assigneeOpen = false">
      <section class="scene-modal assignee-modal" role="dialog" aria-modal="true">
        <header><div><h2>配置初始派发负责人</h2><p>新任务进入该场景时的默认接收人</p></div><button type="button" @click="assigneeOpen = false">×</button></header>
        <div class="assignee-scene"><i>景</i><div><small>当前场景</small><strong>{{ assigneeScene?.sceneName }}</strong><span>{{ assigneeScene?.sceneCode }}</span></div></div>
        <form class="assignee-form" @submit.prevent="saveAssignee">
          <label><span>初始派发负责人 *</span><select v-model="assigneeId" required><option value="" disabled>{{ users.length ? '请选择负责人' : '暂无可选用户' }}</option><option v-if="assigneeId && !users.some(item => String(item.id) === assigneeId)" :value="assigneeId">{{ assigneeFor(assigneeScene?.sceneCode || '')?.assigneeName || `用户 ${assigneeId}` }}（当前负责人）</option><option v-for="item in users" :key="String(item.id)" :value="String(item.id)">{{ userLabel(item) }}（{{ item.username }}）</option></select></label>
          <p>负责人必须是当前场景归属部门的成员或系统管理员。</p>
          <div class="scene-form-actions"><button class="scene-button scene-button--ghost" type="button" @click="assigneeOpen = false">取消</button><button class="scene-button scene-button--primary" type="submit" :disabled="assigneeSaving || !assigneeId">{{ assigneeSaving ? '保存中…' : '保存负责人' }}</button></div>
        </form>
      </section>
    </div>
  </section>
</template>

<style scoped>
.scene-management{color:#dceef5}.scene-heading{min-height:54px;margin-bottom:18px;display:flex;align-items:center;justify-content:space-between}.scene-heading h2,.scene-heading p{margin:0}.scene-heading h2{color:#fff;font-size:25px}.scene-heading p{margin-top:6px;color:#75a2b4;font-size:14px}.scene-button{min-height:40px;padding:0 17px;border-radius:3px;font-size:14px;cursor:pointer}.scene-button:disabled{opacity:.55;cursor:not-allowed}.scene-button--primary{color:#fff;background:linear-gradient(135deg,#1488b5,#16a9c6);border:1px solid #42cbe9}.scene-button--primary:hover{filter:brightness(1.12)}.scene-button--ghost{color:#a8d8e8;background:#0a2738;border:1px solid #276781}.scene-button--ghost:hover{color:#fff;border-color:#3aa9d0}
.scene-summary{margin-bottom:16px;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:13px}.scene-summary article{min-height:98px;padding:15px 17px;display:flex;align-items:center;gap:13px;background:linear-gradient(135deg,#0d2d41,#0a2435);border:1px solid #1b536b;border-radius:6px;box-shadow:0 9px 22px #00121d35}.scene-summary i{width:46px;height:46px;display:grid;place-items:center;flex:0 0 auto;color:#92efff;background:#0d526b;border:1px solid #2685a3;border-radius:50%;font-size:17px;font-style:normal}.scene-summary div{min-width:0}.scene-summary span,.scene-summary b,.scene-summary small{display:block}.scene-summary span{color:#80a9b8;font-size:12px}.scene-summary b{margin:3px 0;color:#f0fbff;font-size:25px}.scene-summary small{overflow:hidden;color:#5f8b9d;font-size:11px;text-overflow:ellipsis;white-space:nowrap}
.scene-panel{overflow:hidden;background:#0b2638e8;border:1px solid #1b536b;border-radius:6px;box-shadow:0 12px 30px #00121d44}.scene-filters{padding:14px 15px;display:grid;grid-template-columns:minmax(220px,250px) minmax(280px,400px) minmax(210px,1fr) minmax(200px,1fr) auto;gap:11px;align-items:end;background:#0d2d41;border-bottom:1px solid #1b536b}.scene-filters label span{margin-bottom:6px;display:block;color:#7ea6b6;font-size:12px}.scene-filters input,.scene-filters select,.scene-form input,.scene-form select,.scene-form textarea,.assignee-form select{width:100%;min-height:40px;padding:0 11px;box-sizing:border-box;color:#e9f8fc;background:#071d2b;border:1px solid #20546a;border-radius:3px;outline:none;font-size:13px}.scene-filters input:focus,.scene-filters select:focus,.scene-form input:focus,.scene-form select:focus,.scene-form textarea:focus,.assignee-form select:focus{border-color:#37b7df;box-shadow:0 0 0 2px #1683aa22}.scene-filters>div{display:flex;gap:8px}.department-filter select{border-color:#287794;background:#0a2a3b}
.scene-table-wrap{overflow:auto}.scene-table-wrap table{width:100%;min-width:1320px;border-collapse:collapse;font-size:13px}.scene-table-wrap th{height:44px;padding:0 12px;color:#78a7b8;background:#081f2e;text-align:left;font-weight:500;white-space:nowrap}.scene-table-wrap td{height:62px;padding:9px 12px;color:#c4dae3;border-top:1px solid #153d50}.scene-table-wrap tbody tr:hover{background:#0f3043}.scene-table-wrap td strong,.scene-table-wrap td small{display:block}.scene-table-wrap td strong{color:#edfaff;font-weight:500}.scene-table-wrap td small{margin-top:4px;color:#668d9d;font-size:11px}.scene-category,.scene-status,.scene-governance{padding:4px 8px;border-radius:3px;white-space:nowrap}.scene-category{color:#7adcf6;background:#0b4c65}.scene-status--on,.scene-governance.on{color:#79e5c4;background:#174a43}.scene-status--off{color:#e9a4ad;background:#512b34}.scene-governance{color:#91aab4;background:#223743}.scene-actions{min-width:270px;white-space:nowrap}.scene-actions button{padding:3px 5px;color:#68c7e6;background:transparent;border:0;font-size:12px;cursor:pointer}.scene-actions button:hover{color:#fff;text-decoration:underline}.scene-actions button.danger{color:#ef8794}.scene-empty{height:260px!important;color:#6f98a8!important;text-align:center}.scene-panel>footer{height:46px;padding:0 15px;display:flex;align-items:center;gap:15px;color:#83a7b5;border-top:1px solid #1b536b;font-size:12px}.scene-panel>footer span{color:#5e8797}
.scene-message{position:fixed;top:82px;left:50%;z-index:130;max-width:560px;padding:11px 40px 11px 16px;transform:translateX(-50%);color:#fff;border-radius:4px;box-shadow:0 10px 30px #00131faa;font-size:13px}.scene-message--success{background:#167b6a;border:1px solid #42c9a8}.scene-message--error{background:#8e3544;border:1px solid #e26d7b}.scene-message button{position:absolute;top:4px;right:7px;color:#fff;background:transparent;border:0;font-size:20px;cursor:pointer}
.scene-mask{position:fixed;inset:0;z-index:110;padding:28px;display:grid;place-items:center;background:#00111cdd;backdrop-filter:blur(4px)}.scene-modal{width:min(620px,95vw);max-height:92vh;overflow:auto;color:#dceef5;background:#0b2638;border:1px solid #2583a5;border-radius:7px;box-shadow:0 22px 70px #000b}.scene-modal--wide{width:min(940px,95vw)}.scene-modal>header{position:sticky;top:0;z-index:2;padding:18px 22px;display:flex;align-items:center;justify-content:space-between;background:#0d3045;border-bottom:1px solid #205f78}.scene-modal>header h2,.scene-modal>header p{margin:0}.scene-modal>header h2{color:#fff;font-size:20px}.scene-modal>header p{margin-top:4px;color:#6f9bab;font-size:13px}.scene-modal>header>button{width:32px;height:32px;color:#9fc5d2;background:transparent;border:0;font-size:24px;cursor:pointer}
.scene-form{padding:20px}.scene-form-section{margin-bottom:15px;padding:17px;background:#092232;border:1px solid #17485d;border-radius:5px}.scene-form-section h3{margin:0 0 15px;color:#e8f9ff;font-size:15px}.scene-form-section h3 span{margin-right:8px;padding:3px 6px;color:#64d5ee;background:#0d526b;border-radius:3px;font-size:10px}.scene-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.scene-form-grid label>span,.assignee-form label>span{margin-bottom:6px;display:block;color:#85aab8;font-size:12px}.scene-form-grid .wide{grid-column:1/-1}.scene-form textarea{min-height:76px;padding:9px 11px;resize:vertical}.scene-form input:disabled,.scene-form select:disabled,.scene-form textarea:disabled{color:#7895a1;background:#102530;cursor:not-allowed}.metric-heading{display:flex;align-items:center;justify-content:space-between}.metric-heading h3{margin-bottom:0}.metric-heading button{color:#62cbe7;background:transparent;border:0;font-size:12px;cursor:pointer}.metric-section>p{margin:8px 0 11px;color:#648d9d;font-size:11px}.metric-section>textarea{min-height:154px;font-family:Consolas,monospace;line-height:1.55}.scene-audit{margin:-2px 2px 17px;display:flex;gap:25px;color:#668d9d;font-size:11px}.scene-form-actions{padding-top:4px;display:flex;justify-content:flex-end;gap:9px}
.assignee-modal{width:min(520px,95vw);overflow:hidden}.assignee-scene{margin:20px 22px 0;padding:14px 16px;display:flex;align-items:center;gap:13px;background:linear-gradient(135deg,#0e3449,#0a293b);border:1px solid #20576e;border-radius:6px}.assignee-scene i{width:44px;height:44px;display:grid;place-items:center;color:#effcff;background:linear-gradient(135deg,#1689b2,#17b8c7);border-radius:50%;font-style:normal}.assignee-scene small,.assignee-scene strong,.assignee-scene span{display:block}.assignee-scene small{color:#719baa;font-size:11px}.assignee-scene strong{margin-top:3px;color:#f0fbff}.assignee-scene span{margin-top:3px;color:#69bad2;font-size:11px}.assignee-form{padding:20px 22px}.assignee-form>p{margin:11px 0 18px;padding:10px 12px;color:#d6b77b;background:#46391f55;border:1px solid #786032;border-radius:4px;font-size:11px;line-height:1.6}
@media(max-width:1100px){.scene-summary{grid-template-columns:repeat(2,1fr)}.scene-filters{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:720px){.scene-heading{align-items:flex-start;gap:12px}.scene-summary,.scene-filters,.scene-form-grid{grid-template-columns:1fr}.scene-summary{gap:8px}.scene-filters>div{justify-content:flex-end}.scene-form-grid .wide{grid-column:auto}.scene-mask{padding:10px}.scene-audit{flex-direction:column;gap:5px}}
</style>
