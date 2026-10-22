<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { getMyDepartments, type DepartmentOption } from '@/api/auth'
import { getDepartmentList } from '@/api/account-management'
import { useUserStore } from '@/stores/user'
import { formatBeijingDateTime } from '@/utils/date-time'
import {
  addMapService,
  deleteMapService,
  getMapServiceDetail,
  getMapServiceTypeOptions,
  listMapServices,
  listMapServicesForDepartments,
  updateMapService,
  updateMapServiceStatus,
  type MapServiceCreateInput,
  type MapServiceItem,
} from '@/api/map-service'

type EditorMode = 'add' | 'edit' | 'view'
type DepartmentScope = 'all' | 'selected'
const serviceTypeOptions = ref<{ value: string; label: string }[]>([])
const dataTypeOptions = ref<{ value: string; label: string }[]>([])
const metadataError = ref('')
async function loadMapEnums() {
  try {
    const result = await getMapServiceTypeOptions()
    serviceTypeOptions.value = (result.serviceTypes || []).map((item) => ({ value: item.code, label: item.name }))
    dataTypeOptions.value = (result.dataTypes || []).map((item) => ({ value: item.code, label: item.name }))
    metadataError.value = serviceTypeOptions.value.length && dataTypeOptions.value.length ? '' : '服务类型或数据类型暂无可用选项，请联系管理员配置。'
  } catch (error) {
    metadataError.value = error instanceof Error ? error.message : '地图服务类型读取失败，请重试。'
  }
}

function serviceTypeLabel(type: string) {
  return serviceTypeOptions.value.find((option) => option.value === type)?.label || type || '未配置'
}

const user = useUserStore()
const services = ref<MapServiceItem[]>([])
const loading = ref(false)
const busy = ref(false)
const departments = ref<DepartmentOption[]>([])
const adminDepartmentIds = ref<string[]>([])
const departmentsLoading = ref(false)
const departmentsError = ref('')
const notice = ref('')
const errorMessage = ref('')
const filters = reactive<{ keyword: string; status: '' | 0 | 1; topicCode: string; dataType: string }>({ keyword: '', status: '', topicCode: '', dataType: '' })
const editorOpen = ref(false)
const editorMode = ref<EditorMode>('add')
const originalTopicCode = ref('')
const statusConfirm = ref<{ service: MapServiceItem; nextStatus: 0 | 1 }>()
const editorTitle = computed(() => ({ add: '新增地图服务', edit: '编辑地图服务', view: '地图服务详情' })[editorMode.value])
const form = reactive({ id: '' as string | number, name: '', serviceUrl: '', type: '', dataType: '', topicCode: '', sort: 0, serviceTime: '', status: 1, preset: 0, remark: '', createTime: '', updateTime: '', departmentScope: 'all' as DepartmentScope, deptIds: [] as string[], deptNames: [] as string[] })
const serviceUrlWarnings = computed(() => getServiceUrlWarnings(form.serviceUrl))

function getServiceUrlWarnings(address: string): string[] {
  const warnings: string[] = []
  try {
    const url = new URL(address.trim())
    const protocol = [...url.searchParams.entries()].find(([key]) => key.toUpperCase() === 'SERVICE')?.[1].toUpperCase()
    if (protocol === 'WFS' || /\/wfs\/?$/i.test(url.pathname)) {
      warnings.push('当前地址是 WFS 要素查询服务，首页暂不支持直接加载。请向服务方获取同图层的 WMS / WMTS 地址，并同步修改服务类型；只改类型不能转换协议。')
    }
    if (/^(?:localhost|127(?:\.\d{1,3}){3}|\[::1\])$/i.test(url.hostname) || url.hostname.toLowerCase().endsWith('.localhost')) {
      warnings.push('localhost / 回环地址指向访问者自己的电脑。供其他电脑访问时，请改用所有访问者均可连通的服务器 IP 或域名，并确认跨域配置。')
    }
  } catch { /* 输入过程中不打断编辑，地址可用性由实际加载结果确认。 */ }
  return warnings
}
const selectableDepartments = computed(() => {
  const options = new Map(departments.value.map((department) => [department.deptId, department]))
  form.deptIds.forEach((id, index) => {
    if (!options.has(id)) options.set(id, { deptId: id, deptName: form.deptNames[index] || `部门 ${id}` })
  })
  return [...options.values()]
})
let serviceRequestVersion = 0

const enabledCount = computed(() => services.value.filter((item) => Number(item.status) === 1).length)
const disabledCount = computed(() => services.value.length - enabledCount.value)
const presetCount = computed(() => services.value.filter((item) => Number(item.preset) === 1).length)

function showSuccess(message: string) {
  notice.value = message
  errorMessage.value = ''
  window.setTimeout(() => { if (notice.value === message) notice.value = '' }, 2600)
}

function showError(error: unknown) {
  errorMessage.value = error instanceof Error ? error.message : '操作失败，请稍后重试'
  notice.value = ''
}

function resetForm() {
  originalTopicCode.value = ''
  Object.assign(form, { id: '', name: '', serviceUrl: '', type: '', dataType: '', topicCode: '', sort: 0, serviceTime: '', status: 1, preset: 0, remark: '', createTime: '', updateTime: '', departmentScope: 'all', deptIds: [], deptNames: [] })
}

function toDateTimeLocal(value?: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function toServiceTime(value: string) {
  if (!value) return undefined
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

function fillForm(service: MapServiceItem) {
  originalTopicCode.value = service.topicCode || ''
  const deptIds = (service.deptIds || []).map(String)
  Object.assign(form, {
    id: service.id,
    name: service.name || '',
    serviceUrl: service.serviceUrl || '',
    type: service.type || '',
    dataType: service.dataType || '',
    topicCode: service.topicCode || '',
    sort: Number(service.sort) || 0,
    serviceTime: toDateTimeLocal(service.serviceTime),
    status: Number(service.status) === 0 ? 0 : 1,
    preset: Number(service.preset) || 0,
    remark: service.remark || '',
    createTime: service.createTime || '',
    updateTime: service.updateTime || '',
    departmentScope: deptIds.length ? 'selected' : 'all',
    deptIds,
    deptNames: deptIds.map((id, index) => service.deptNames?.[index] || departments.value.find((item) => item.deptId === id)?.deptName || `部门 ${id}`),
  })
}

async function loadDepartments() {
  departmentsLoading.value = true
  departmentsError.value = ''
  try {
    if (user.currentUser?.role === 'ADMIN') {
      const allDepartments = await getDepartmentList()
      adminDepartmentIds.value = allDepartments.map((item) => String(item.id))
      departments.value = allDepartments
        .filter((item) => Number(item.status) === 1)
        .map((item) => ({ deptId: String(item.id), deptName: item.name, deptCode: item.code }))
    } else {
      departments.value = await getMyDepartments()
    }
  } catch (error) {
    departments.value = []
    adminDepartmentIds.value = []
    departmentsError.value = error instanceof Error ? error.message : '部门列表加载失败'
  } finally {
    departmentsLoading.value = false
  }
}

function toggleDepartment(deptId: string, selected: boolean) {
  if (selected) {
    if (form.deptIds.includes(deptId)) return
    form.deptIds = [...form.deptIds, deptId]
    form.deptNames = [...form.deptNames, departments.value.find((item) => item.deptId === deptId)?.deptName || `部门 ${deptId}`]
    return
  }
  const index = form.deptIds.indexOf(deptId)
  if (index < 0) return
  form.deptIds = form.deptIds.filter((id) => id !== deptId)
  form.deptNames = form.deptNames.filter((_, nameIndex) => nameIndex !== index)
}

function departmentSummary(service: MapServiceItem) {
  if (!service.deptIds?.length) return '全部部门'
  return service.deptIds.map((id, index) => service.deptNames?.[index] || departments.value.find((item) => item.deptId === String(id))?.deptName || `部门 ${id}`).join('、')
}

async function loadServices() {
  const requestVersion = ++serviceRequestVersion
  loading.value = true
  errorMessage.value = ''
  services.value = []
  try {
    const query = {
      keyword: filters.keyword.trim() || undefined,
      status: filters.status === '' ? undefined : filters.status,
      topicCode: filters.topicCode.trim() || undefined,
      dataType: filters.dataType || undefined,
    }
    const isAdmin = user.currentUser?.role === 'ADMIN'
    if (isAdmin && !adminDepartmentIds.value.length) throw new Error('无法读取全部部门，暂不能展示完整的地图服务列表')
    const result = isAdmin
      ? await listMapServicesForDepartments(adminDepartmentIds.value, query)
      : await listMapServices({ ...query, deptId: user.activeDeptId })
    if (requestVersion === serviceRequestVersion) services.value = result
  } catch (error) {
    if (requestVersion === serviceRequestVersion) showError(error)
  } finally {
    if (requestVersion === serviceRequestVersion) loading.value = false
  }
}

async function resetFilters() {
  Object.assign(filters, { keyword: '', status: '', topicCode: '', dataType: '' })
  await loadServices()
}

async function openEditor(mode: EditorMode, row?: MapServiceItem) {
  editorMode.value = mode
  resetForm()
  if (row) {
    busy.value = true
    try {
      fillForm(await getMapServiceDetail(row.id))
    } catch (error) {
      showError(error)
      return
    } finally {
      busy.value = false
    }
  }
  editorOpen.value = true
}

async function submitService() {
  if (editorMode.value === 'view' || busy.value) return
  if (!form.name.trim()) return showError(new Error('请输入服务名称'))
  if (!form.serviceUrl.trim()) return showError(new Error('请输入服务地址'))
  if (!form.type) return showError(new Error('请选择服务类型'))
  if (!form.dataType) return showError(new Error('请选择数据类型'))
  if (editorMode.value === 'edit' && originalTopicCode.value && !form.topicCode.trim()) {
    return showError(new Error('后端更新接口仅处理非空字段，暂不能通过编辑清空原有适用项目'))
  }
  if (metadataError.value || !serviceTypeOptions.value.length || !dataTypeOptions.value.length) return showError(new Error('地图服务枚举尚未加载，请重试'))
  if (form.departmentScope === 'selected' && !form.deptIds.length) return showError(new Error('请至少选择一个适用部门，或改选全部部门适用'))
  busy.value = true
  try {
    const serviceTime = toServiceTime(form.serviceTime)
    const payload: MapServiceCreateInput = {
      name: form.name.trim(),
      serviceUrl: form.serviceUrl.trim(),
      ...(form.type ? { type: form.type } : {}),
      dataType: form.dataType,
      topicCode: form.topicCode.trim() || undefined,
      sort: Number(form.sort) || 0,
      ...(serviceTime ? { serviceTime } : {}),
      remark: form.remark.trim() || undefined,
      deptIds: form.departmentScope === 'all' ? [] : [...form.deptIds],
    }
    if (editorMode.value === 'add') await addMapService(payload)
    else await updateMapService({ id: form.id, ...payload })
    editorOpen.value = false
    showSuccess(editorMode.value === 'add' ? '地图服务已新增' : '地图服务已更新')
    await loadServices()
  } catch (error) {
    showError(error)
  } finally {
    busy.value = false
  }
}

function toggleService(row: MapServiceItem) {
  const nextStatus: 0 | 1 = Number(row.status) === 1 ? 0 : 1
  statusConfirm.value = { service: row, nextStatus }
}

async function confirmToggleService() {
  const pending = statusConfirm.value
  if (!pending) return
  busy.value = true
  try {
    await updateMapServiceStatus(pending.service.id, pending.nextStatus)
    showSuccess(`地图服务已${pending.nextStatus ? '启用' : '停用'}`)
    statusConfirm.value = undefined
    await loadServices()
  } catch (error) {
    showError(error)
  } finally {
    busy.value = false
  }
}

async function removeService(row: MapServiceItem) {
  if (!window.confirm(`确认删除地图服务“${row.name}”吗？已被业务关联时后端可能拒绝删除。`)) return
  busy.value = true
  try {
    await deleteMapService(row.id)
    showSuccess('地图服务已删除')
    await loadServices()
  } catch (error) {
    showError(error)
  } finally {
    busy.value = false
  }
}

onMounted(async () => { await Promise.all([loadDepartments(), loadMapEnums()]); await loadServices() })
watch(() => user.activeDeptId, () => {
  if (user.currentUser?.role === 'ADMIN') return
  services.value = []
  editorOpen.value = false
  void loadServices()
})
</script>

<template>
  <div class="map-service-panel">
    <div v-if="notice" class="service-message service-message--success">{{ notice }}</div>
    <div v-if="errorMessage" class="service-message service-message--error">{{ errorMessage }}<button type="button" @click="errorMessage = ''">×</button></div>
    <div v-if="metadataError" class="service-enum-warning" role="status">{{ metadataError }} <button type="button" @click="loadMapEnums">重试</button></div>

    <div class="service-heading">
      <div><h2>地图服务管理</h2><p>注册和维护第三方地图服务，配置适用部门、排序及启停状态</p></div>
      <button class="service-button service-button--primary" type="button" @click="openEditor('add')">＋ 新增地图服务</button>
    </div>

    <section class="service-overview">
      <article><span>服务总数</span><strong>{{ services.length }}</strong><small>当前查询结果</small></article>
      <article><span>已启用</span><strong>{{ enabledCount }}</strong><small>可供业务页面加载</small></article>
      <article><span>已停用</span><strong>{{ disabledCount }}</strong><small>不会显示在图层列表</small></article>
      <article><span>预置服务</span><strong>{{ presetCount }}</strong><small>系统内置地图资源</small></article>
    </section>

    <section class="service-card">
      <form class="service-filter" @submit.prevent="loadServices">
        <input v-model.trim="filters.keyword" placeholder="搜索服务名称">
        <input v-model.trim="filters.topicCode" placeholder="筛选适用项目">
        <select v-model="filters.dataType"><option value="">全部数据类型</option><option v-for="option in dataTypeOptions" :key="option.value" :value="option.value">{{ option.label }}</option></select>
        <select v-model="filters.status"><option value="">全部状态</option><option :value="1">已启用</option><option :value="0">已停用</option></select>
        <button class="service-button service-button--primary" type="submit">查询</button>
        <button class="service-button" type="button" @click="resetFilters">重置</button>
      </form>
      <div class="service-table-wrap">
        <table>
          <thead><tr><th>服务名称</th><th>服务类型</th><th>数据类型</th><th>适用项目</th><th>服务地址</th><th>适用部门</th><th>服务时间</th><th>排序</th><th>来源</th><th>状态</th><th>更新时间</th><th class="actions-column">操作</th></tr></thead>
          <tbody>
            <tr v-if="loading"><td colspan="12" class="empty-cell">正在加载地图服务…</td></tr>
            <tr v-else-if="!services.length"><td colspan="12" class="empty-cell">暂无符合条件的地图服务</td></tr>
            <tr v-for="row in services" v-else :key="row.id">
              <td><strong>{{ row.name }}</strong><small>ID：{{ row.id }}</small></td>
              <td><span class="type-tag">{{ row.type || '未配置' }}</span></td>
              <td>{{ dataTypeOptions.find((option) => option.value === row.dataType)?.label || row.dataType || '-' }}</td>
              <td>{{ row.topicCode || '部门通用' }}</td>
              <td><a :href="row.serviceUrl" target="_blank" rel="noopener noreferrer" :title="row.serviceUrl">{{ row.serviceUrl }}</a></td>
              <td><span class="department-summary" :title="departmentSummary(row)">{{ departmentSummary(row) }}</span></td>
              <td>{{ formatBeijingDateTime(row.serviceTime) }}</td>
              <td>{{ row.sort ?? 0 }}</td>
              <td>{{ Number(row.preset) === 1 ? '系统预置' : '自定义' }}</td>
              <td><span class="service-status" :class="Number(row.status) === 1 ? 'on' : 'off'">{{ Number(row.status) === 1 ? '启用' : '停用' }}</span></td>
              <td>{{ formatBeijingDateTime(row.updateTime || row.createTime) }}</td>
              <td class="row-actions"><button @click="openEditor('view', row)">详情</button><button @click="openEditor('edit', row)">编辑</button><button @click="toggleService(row)">{{ Number(row.status) === 1 ? '停用' : '启用' }}</button><button class="danger" @click="removeService(row)">删除</button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <div v-if="editorOpen" class="service-modal-mask" @mousedown.self="editorOpen = false">
      <section class="service-modal" role="dialog" aria-modal="true">
        <header><div><h2>{{ editorTitle }}</h2><p>地图服务注册信息</p></div><button type="button" @click="editorOpen = false">×</button></header>
        <form @submit.prevent="submitService">
          <label><span>服务名称 *</span><input v-model.trim="form.name" maxlength="100" :disabled="editorMode === 'view'" required></label>
          <label v-if="editorMode !== 'view'"><span>服务类型 *</span><select v-model="form.type" required aria-label="服务类型"><option value="" disabled>请选择服务类型</option><option v-if="form.type && !serviceTypeOptions.some(option => option.value === form.type)" :value="form.type">{{ form.type }}（原配置）</option><option v-for="option in serviceTypeOptions" :key="option.value" :value="option.value">{{ option.label }}</option></select></label>
          <label v-else><span>服务类型</span><input :value="serviceTypeLabel(form.type)" readonly aria-readonly="true"></label>
          <label v-if="editorMode !== 'view'"><span>数据类型 *</span><select v-model="form.dataType" required aria-label="数据类型"><option value="" disabled>请选择数据类型</option><option v-if="form.dataType && !dataTypeOptions.some(option => option.value === form.dataType)" :value="form.dataType">{{ form.dataType }}（原配置）</option><option v-for="option in dataTypeOptions" :key="option.value" :value="option.value">{{ option.label }}</option></select></label>
          <label v-else><span>数据类型</span><input :value="dataTypeOptions.find((option) => option.value === form.dataType)?.label || form.dataType || '-'" readonly aria-readonly="true"></label>
          <label class="wide"><span>适用项目</span><input v-model.trim="form.topicCode" maxlength="100" placeholder="新增时不填则当前适用部门通用" :disabled="editorMode === 'view'"><small v-if="editorMode === 'edit' && originalTopicCode" class="department-hint">后端更新接口仅处理非空字段，现有项目无法通过清空输入框移除。</small></label>
          <label class="wide"><span>服务地址 *</span><textarea v-model.trim="form.serviceUrl" maxlength="500" :disabled="editorMode === 'view'" required></textarea><small v-if="editorMode !== 'view'" class="department-hint">GeoServer 请按发布协议选择 WMS / WMTS，可填写服务入口或 GetCapabilities 地址；多个图层时指定 layers / LAYER，WMTS 可用 TILEMATRIXSET 指定矩阵集。ArcGIS 请填写 MapServer / ImageServer 服务根地址。</small></label>
          <div v-if="serviceUrlWarnings.length" class="wide service-config-warnings" role="status"><p v-for="warning in serviceUrlWarnings" :key="warning">{{ warning }}</p></div>
          <label><span>排序</span><input v-model.number="form.sort" type="number" :disabled="editorMode === 'view'"></label>
          <label><span>服务时间</span><input v-model="form.serviceTime" type="datetime-local" :disabled="editorMode === 'view'"></label>
          <label v-if="editorMode === 'view'"><span>状态</span><input :value="form.status === 1 ? '启用' : '停用'" disabled></label>
          <label v-if="editorMode === 'view'"><span>数据来源</span><input :value="form.preset === 1 ? '系统预置' : '自定义'" disabled></label>
          <fieldset class="department-selector wide">
            <legend>适用部门</legend>
            <div class="department-scope">
              <label><input v-model="form.departmentScope" type="radio" value="all" :disabled="editorMode === 'view'"><span>全部部门</span></label>
              <label><input v-model="form.departmentScope" type="radio" value="selected" :disabled="editorMode === 'view'"><span>指定部门</span></label>
            </div>
            <p v-if="form.departmentScope === 'all'" class="department-hint">所有部门登录后均可使用此服务。</p>
            <template v-else>
              <p v-if="departmentsLoading" class="department-hint">正在读取部门…</p>
              <p v-if="departmentsError" class="department-hint department-hint--error">部门列表读取失败：{{ departmentsError }} <button v-if="editorMode !== 'view'" type="button" @click="loadDepartments">重试</button></p>
              <div v-if="selectableDepartments.length" class="department-options">
                <label v-for="department in selectableDepartments" :key="department.deptId">
                  <input type="checkbox" :checked="form.deptIds.includes(department.deptId)" :disabled="editorMode === 'view'" @change="toggleDepartment(department.deptId, ($event.target as HTMLInputElement).checked)">
                  <span>{{ department.deptName }}</span>
                </label>
              </div>
              <p v-else-if="!departmentsLoading && !departmentsError" class="department-hint">暂无可选部门。</p>
              <p v-if="editorMode !== 'view'" class="department-hint">已选择 {{ form.deptIds.length }} 个部门；请至少选择一个。</p>
            </template>
          </fieldset>
          <label class="wide"><span>备注</span><textarea v-model.trim="form.remark" maxlength="255" :disabled="editorMode === 'view'"></textarea></label>
          <label v-if="editorMode === 'view'"><span>创建时间</span><input :value="formatBeijingDateTime(form.createTime)" disabled></label>
          <label v-if="editorMode === 'view'"><span>更新时间</span><input :value="formatBeijingDateTime(form.updateTime)" disabled></label>
          <footer><button type="button" @click="editorOpen = false">{{ editorMode === 'view' ? '关闭' : '取消' }}</button><button v-if="editorMode !== 'view'" class="primary" type="submit" :disabled="busy">{{ busy ? '保存中…' : '保存' }}</button></footer>
        </form>
      </section>
    </div>

    <div v-if="statusConfirm" class="status-confirm-mask" @mousedown.self="!busy && (statusConfirm = undefined)">
      <section class="status-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="status-confirm-title">
        <div class="status-confirm-icon" :class="statusConfirm.nextStatus ? 'enable' : 'disable'">{{ statusConfirm.nextStatus ? '✓' : '!' }}</div>
        <div class="status-confirm-copy">
          <h3 id="status-confirm-title">确认{{ statusConfirm.nextStatus ? '启用' : '停用' }}地图服务</h3>
          <p v-if="statusConfirm.nextStatus">启用后，该服务将重新出现在相关业务的影像服务列表中。</p>
          <p v-else>停用后，该服务将不再出现在业务页面，但不会删除服务配置和已有业务数据。</p>
          <div class="status-confirm-service"><span>服务名称</span><strong>{{ statusConfirm.service.name }}</strong></div>
        </div>
        <footer><button type="button" :disabled="busy" @click="statusConfirm = undefined">取消</button><button type="button" class="confirm" :class="statusConfirm.nextStatus ? 'enable' : 'disable'" :disabled="busy" @click="confirmToggleService">{{ busy ? '处理中…' : `确认${statusConfirm.nextStatus ? '启用' : '停用'}` }}</button></footer>
      </section>
    </div>
  </div>
</template>

<style scoped>
.map-service-panel{color:#dceef5}.service-heading{min-height:54px;margin-bottom:18px;display:flex;align-items:center;justify-content:space-between}.service-heading h2,.service-heading p,.service-modal h2,.service-modal p{margin:0}.service-heading h2{font-size:25px;color:#fff}.service-heading p{margin-top:6px;color:#75a2b4;font-size:14px}.service-button{min-height:40px;padding:0 17px;color:#a9d3e2;background:#0b2b3e;border:1px solid #28657d;border-radius:3px;font-size:14px;cursor:pointer}.service-button--primary{color:#fff;background:linear-gradient(135deg,#1488b5,#16a9c6);border-color:#42cbe9}.service-overview{margin-bottom:18px;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.service-overview article{min-height:88px;padding:14px 17px;display:grid;grid-template-columns:1fr auto;align-content:center;background:linear-gradient(135deg,#0c2b3f,#092334);border:1px solid #1b526a;border-radius:5px}.service-overview span{color:#77a4b5;font-size:12px}.service-overview strong{grid-row:1/3;grid-column:2;color:#61d8f3;font-size:28px}.service-overview small{margin-top:8px;color:#5f8797;font-size:11px}.service-card{min-height:620px;overflow:hidden;background:#0b2638e8;border:1px solid #1b536b;border-radius:6px;box-shadow:0 12px 30px #00121d44}.service-filter{padding:13px;display:grid;grid-template-columns:minmax(200px,1fr) 150px 150px 130px auto auto;gap:9px;background:#0a2435;border-bottom:1px solid #173e51}.service-filter input,.service-filter select{width:100%;min-height:40px;padding:0 11px;box-sizing:border-box;color:#e9f8fc;background:#071d2b;border:1px solid #20546a;border-radius:3px;font-size:13px}.service-table-wrap{max-height:calc(100vh - 345px);overflow:auto}.service-table-wrap table{width:100%;min-width:1180px;border-collapse:collapse;font-size:13px}.service-table-wrap th{height:44px;padding:0 12px;position:sticky;top:0;z-index:1;color:#78a7b8;background:#081f2e;text-align:left;font-weight:500}.service-table-wrap td{height:58px;max-width:300px;padding:8px 12px;color:#c4dae3;border-top:1px solid #153d50}.service-table-wrap tbody tr:hover{background:#0f3043}.service-table-wrap td strong,.service-table-wrap td small{display:block}.service-table-wrap td strong{color:#edfaff;font-weight:500}.service-table-wrap td small{margin-top:4px;color:#668d9d;font-size:11px}.service-table-wrap td a{display:block;overflow:hidden;color:#5fc9e7;text-overflow:ellipsis;white-space:nowrap}.type-tag{padding:4px 7px;color:#76d6ed;background:#123d51;border-radius:3px;font-size:11px}.service-status{padding:3px 8px;border-radius:3px;font-size:11px}.service-status.on{color:#79e5c4;background:#174a43}.service-status.off{color:#e9a4ad;background:#512b34}.row-actions{white-space:nowrap}.row-actions button{padding:3px 6px;color:#77d6f1;background:transparent;border:0;font-size:12px;cursor:pointer}.row-actions button.danger{color:#ef8794}.empty-cell{height:260px!important;color:#6f98a8!important;text-align:center!important}.service-message{position:fixed;top:82px;left:50%;z-index:120;max-width:560px;padding:11px 40px 11px 16px;transform:translateX(-50%);color:#fff;border-radius:4px;box-shadow:0 10px 30px #00131faa;font-size:13px}.service-message--success{background:#167b6a;border:1px solid #42c9a8}.service-message--error{background:#8e3544;border:1px solid #e26d7b}.service-message button{position:absolute;top:4px;right:7px;color:#fff;background:transparent;border:0;font-size:20px;cursor:pointer}.service-modal-mask{position:fixed;inset:0;z-index:110;padding:30px;display:grid;place-items:center;background:#00111ccc;backdrop-filter:blur(3px)}.service-modal{width:min(760px,95vw);max-height:92vh;overflow:auto;background:#0b2638;border:1px solid #2583a5;border-radius:7px;box-shadow:0 22px 70px #000b}.service-modal>header{padding:18px 22px;display:flex;justify-content:space-between;align-items:center;background:#0d3045;border-bottom:1px solid #205f78}.service-modal h2{color:#fff;font-size:20px}.service-modal header p{margin-top:4px;color:#6f9bab;font-size:13px}.service-modal header button{width:32px;height:32px;color:#9fc5d2;background:transparent;border:0;font-size:24px;cursor:pointer}.service-modal form{padding:22px;display:grid;grid-template-columns:1fr 1fr;gap:16px}.service-modal label span{display:block;margin-bottom:7px;color:#85aab8;font-size:13px}.service-modal input,.service-modal select,.service-modal textarea{width:100%;min-height:42px;padding:0 11px;box-sizing:border-box;color:#e9f8fc;background:#071d2b;border:1px solid #20546a;border-radius:3px;font-size:14px}.service-modal textarea{min-height:82px;padding-top:9px;resize:vertical}.service-modal input:disabled,.service-modal select:disabled,.service-modal textarea:disabled{color:#7894a0;background:#102530}.service-modal .wide{grid-column:1/-1}.service-modal form>footer{grid-column:1/-1;display:flex;justify-content:flex-end;gap:10px}.service-modal form>footer button{min-height:40px;padding:0 18px;color:#aedbea;background:#0a2738;border:1px solid #276781;border-radius:3px;cursor:pointer}.service-modal form>footer .primary{color:#fff;background:linear-gradient(135deg,#1488b5,#16a9c6);border-color:#42cbe9}.service-modal form>footer button:disabled{opacity:.5;cursor:wait}@media(max-width:1000px){.service-overview{grid-template-columns:repeat(2,1fr)}.service-filter{grid-template-columns:1fr 140px}.service-card{min-height:500px}.service-table-wrap{max-height:520px}}@media(max-width:620px){.service-heading{align-items:flex-start;gap:12px}.service-overview,.service-filter,.service-modal form{grid-template-columns:1fr}.service-modal .wide,.service-modal form>footer{grid-column:auto}}
.department-summary{display:block;max-width:190px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#99d8e8}.department-selector{min-width:0;margin:0;padding:13px 15px 14px;border:1px solid #20546a;border-radius:4px;background:#092334}.department-selector legend{padding:0 6px;color:#a6d3e1;font-size:13px;font-weight:700}.department-scope{display:flex;flex-wrap:wrap;gap:10px}.department-scope label,.department-options label{display:flex;align-items:center;gap:8px;cursor:pointer}.department-scope label{min-height:36px;padding:0 13px;color:#d9edf4;background:#0b2c40;border:1px solid #26617a;border-radius:4px}.service-modal .department-selector input[type=radio],.service-modal .department-selector input[type=checkbox]{width:16px;height:16px;min-height:0;flex:none;margin:0;padding:0;accent-color:#24b7d6}.service-modal .department-selector label span{display:inline;margin:0;color:inherit;font-size:13px}.department-options{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin-top:10px;max-height:170px;overflow-y:auto}.department-options label{min-width:0;min-height:36px;padding:6px 9px;box-sizing:border-box;color:#c7e1e9;background:#0c2b3d;border:1px solid #1b4e64;border-radius:4px}.department-options label:hover{border-color:#40a9c4;background:#10374d}.department-options label span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.department-hint{margin:9px 0 0;color:#7ba4b5;font-size:12px;line-height:1.5}.department-hint--error{color:#ef9da9}.department-hint button{padding:0 4px;color:#65d4eb;background:transparent;border:0;cursor:pointer}@media(max-width:620px){.department-options{grid-template-columns:repeat(2,minmax(0,1fr))}}
.status-confirm-mask{position:fixed;inset:0;z-index:130;padding:24px;display:grid;place-items:center;background:#00111cc7;backdrop-filter:blur(4px)}.status-confirm-dialog{width:min(510px,calc(100vw - 40px));display:grid;grid-template-columns:58px minmax(0,1fr);gap:16px;padding:24px 24px 0;color:#c7e0e9;background:linear-gradient(145deg,#0d3045,#081f2f);border:1px solid #26718b;border-radius:8px;box-shadow:0 24px 70px #000c}.status-confirm-icon{width:54px;height:54px;display:grid;place-items:center;border-radius:50%;font-size:25px;font-weight:800}.status-confirm-icon.enable{color:#70ebc5;background:#123f3b;border:1px solid #2a9b7d;box-shadow:0 0 18px #2fd3a333}.status-confirm-icon.disable{color:#ffc07a;background:#48351f;border:1px solid #b97a34;box-shadow:0 0 18px #e6974033}.status-confirm-copy h3{margin:1px 0 8px;color:#f1fbff;font-size:20px}.status-confirm-copy>p{margin:0;color:#8fb2c0;font-size:13px;line-height:1.7}.status-confirm-service{margin-top:16px;padding:11px 13px;display:grid;grid-template-columns:78px minmax(0,1fr);align-items:center;gap:10px;background:#071c2a;border:1px solid #17475b;border-radius:4px}.status-confirm-service span{color:#668e9e;font-size:12px}.status-confirm-service strong{overflow:hidden;color:#dff7ff;font-size:13px;text-overflow:ellipsis;white-space:nowrap}.status-confirm-dialog>footer{grid-column:1/-1;margin:6px -24px 0;padding:14px 24px;display:flex;justify-content:flex-end;gap:10px;background:#071c2a;border-top:1px solid #17475b;border-radius:0 0 8px 8px}.status-confirm-dialog footer button{min-width:92px;height:38px;padding:0 17px;color:#a9d3e2;background:#0b2b3e;border:1px solid #28657d;border-radius:4px;font-size:14px;font-weight:700;cursor:pointer}.status-confirm-dialog footer button.confirm.enable{color:#fff;background:linear-gradient(135deg,#168e79,#20af91);border-color:#4bd0b3}.status-confirm-dialog footer button.confirm.disable{color:#fff;background:linear-gradient(135deg,#a96628,#d48235);border-color:#e9a258}.status-confirm-dialog footer button:disabled{opacity:.55;cursor:wait}
.service-modal input[readonly]{color:#d7ecf3;background:#102c3b;border-color:#286078;cursor:default}
.service-config-warnings{padding:10px 12px;color:#f2ce91;background:#47381d66;border:1px solid #8b713d;border-radius:4px;font-size:12px;line-height:1.7}.service-config-warnings p+p{margin-top:7px}
.service-enum-warning{margin-bottom:12px;padding:10px 13px;color:#f2ce91;background:#47381d66;border:1px solid #8b713d;border-radius:4px;font-size:13px}.service-enum-warning button{margin-left:8px;color:#eafaff;background:transparent;border:0;text-decoration:underline;cursor:pointer}
</style>
