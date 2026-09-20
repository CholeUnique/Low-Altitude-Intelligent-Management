<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import TaskRangeMap from '@/components/TaskRangeMap.vue'
import { isMockMode } from '@/api/client'
import {
  bindGovernanceTaskMedia,
  createGovernanceTask,
  getGovernanceTaskGeometry,
  getTaskAbnormalPage,
  setGovernanceTaskMediaCover,
  updateGovernanceTask,
  upsertGovernanceTaskGeometry,
} from '@/api/governance-task'
import { getFlightTaskMedia } from '@/api/patrol'
import { addSessionTask } from '@/mocks/portal'
import { useUserStore } from '@/stores/user'
import { getDepartmentOptions, getMyDepartments } from '@/api/auth'
import TaskSchedulePicker from '@/components/TaskSchedulePicker.vue'
import type { GovernanceTask, TaskAbnormal } from '@/api/governance-task'
import type { SceneDictionaryItem } from '@/api/scene'
import type { PortalTask, TaskPriority, UserDepartment } from '@/types'
import { getSharedWorkspaceConfig } from '@/workspace/config/registry'

const props = defineProps<{ sceneId?: string; scenes: SceneDictionaryItem[]; task?: GovernanceTask }>()
const emit = defineEmits<{ created: [task: { id: string }]; updated: [task: { id: string }] }>()
const visible = defineModel<boolean>({ default: false })
const user = useUserStore()
const scenes = computed(() => props.scenes)
const isEditing = computed(() => Boolean(props.task))
const selectedScene = computed(() => scenes.value.find((scene) => scene.id === form.sceneId))
const submitError = ref('')
const submitting = ref(false)
const departments = ref<UserDepartment[]>([])
const departmentsLoading = ref(false)
const departmentsError = ref('')
const schedule = ref<string[]>([])
const availableMedia = ref<Array<{ id: string; name: string; thumbnail?: string }>>([])
const selectedMediaIds = ref<string[]>([])
const coverMediaId = ref('')
const mediaLoading = ref(false)
const mediaError = ref('')
const createdTaskId = ref('')
const rangeLoading = ref(false)
const rangeError = ref('')
const rangeDirty = ref(false)
const rangeName = ref('')
const rangeAbnormalPoints = ref<TaskAbnormal[]>([])
let rangeLoadVersion = 0
const form = reactive({
  name: '',
  sceneId: '',
  area: '',
  owner: '',
  priority: '1',
  deptId: '',
  description: '',
  contact: '',
  phone: '',
  requirements: ['照片'] as string[],
  coordinates: [[117.75, 31.97], [118.08, 32.08], [118.35, 31.92], [118.22, 31.60], [117.82, 31.56]] as [number, number][],
  refType: 'NONE' as 'PLAN' | 'TASK' | 'NONE',
  refId: '',
  assigneeId: '',
  remark: '',
  mediaIds: '',
})

const departmentOptions = computed(() => {
  if (!form.deptId || departments.value.some((department) => department.deptId === form.deptId)) return departments.value
  if (!props.task?.deptName) return departments.value
  return [{ deptId: form.deptId, deptName: props.task.deptName }, ...departments.value]
})

const defaultMockCoordinates: [number, number][] = [[117.75, 31.97], [118.08, 32.08], [118.35, 31.92], [118.22, 31.60], [117.82, 31.56]]

function toDateTimeInput(value?: string) {
  if (!value) return ''
  const normalized = value.replace(' ', 'T').slice(0, 19)
  return normalized.length === 16 ? `${normalized}:00` : normalized
}

function toApiDateTime(value: string) {
  return value.length === 16 ? `${value}:00` : value
}

function toMockPriority(value: string): TaskPriority {
  return value === '2' ? '高' : value === '0' ? '低' : '中'
}

function resetForm() {
  submitError.value = ''
  form.name = props.task?.name || ''
  form.sceneId = props.task
    ? scenes.value.find((scene) => scene.code === props.task?.sceneCode)?.id || props.task.sceneCode
    : props.sceneId || scenes.value[0]?.id || ''
  form.priority = String(props.task?.priority ?? 1)
  form.deptId = props.task?.deptId || user.activeDeptId || user.currentUser?.deptId || ''
  schedule.value = [
    toDateTimeInput(props.task?.planStartTime) || (isMockMode() ? '2026-09-10T08:00:00' : ''),
    toDateTimeInput(props.task?.planEndTime) || (isMockMode() ? '2026-09-12T18:00:00' : ''),
  ].filter(Boolean)
  form.refType = props.task?.refType === 'PLAN' || props.task?.refType === 'TASK' ? props.task.refType : 'NONE'
  form.refId = props.task?.refId || ''
  form.assigneeId = props.task?.assigneeId || ''
  form.remark = ''
  form.area = ''
  form.mediaIds = ''
  form.coordinates = isMockMode() ? [...defaultMockCoordinates] : []
  rangeLoading.value = false
  rangeError.value = ''
  rangeDirty.value = false
  rangeName.value = ''
  rangeAbnormalPoints.value = []
  availableMedia.value = []
  selectedMediaIds.value = []
  coverMediaId.value = ''
  mediaError.value = ''
  createdTaskId.value = ''
}

function coordinatesFromGeometry(geometry: Awaited<ReturnType<typeof getGovernanceTaskGeometry>>) {
  const feature = geometry.features.find((item) => {
    const type = item.geometry?.type.toUpperCase()
    const abnormalId = item.properties?.abnormalId
    return (type === 'POLYGON' || type === 'MULTIPOLYGON') && !abnormalId
  })
  if (!feature?.geometry) return [] as [number, number][]
  const coordinates = feature.geometry.coordinates
  const ring = feature.geometry.type.toUpperCase() === 'MULTIPOLYGON'
    ? (coordinates as number[][][][])?.[0]?.[0]
    : (coordinates as number[][][])?.[0]
  if (!Array.isArray(ring)) return []
  const points = ring.map((point) => [Number(point[0]), Number(point[1])] as [number, number])
    .filter(([longitude, latitude]) => Number.isFinite(longitude) && Number.isFinite(latitude))
  const lastPoint = points[points.length - 1]
  if (points.length > 1 && lastPoint && points[0]![0] === lastPoint[0] && points[0]![1] === lastPoint[1]) points.pop()
  return points
}

async function loadExistingRange() {
  if (!props.task || isMockMode()) return
  const requestVersion = ++rangeLoadVersion
  rangeLoading.value = true
  rangeError.value = ''
  try {
    // 任务范围必须优先可编辑；异常图斑作为后台追加的红色参考点，不能阻塞弹窗。
    const geometry = await getGovernanceTaskGeometry(props.task.id, undefined, false)
    if (requestVersion !== rangeLoadVersion) return
    form.coordinates = coordinatesFromGeometry(geometry)
    const feature = geometry.features.find((item) => item.geometry?.type.toUpperCase() === 'POLYGON' || item.geometry?.type.toUpperCase() === 'MULTIPOLYGON')
    rangeName.value = typeof feature?.properties?.name === 'string' ? feature.properties.name : ''
    if (form.coordinates.length < 3) rangeError.value = '当前任务未读取到可编辑的范围面，请在地图上重新绘制。'
    // 范围渲染完成后再异步加载异常点，取消/关闭后由 requestVersion 阻止旧响应回写。
    void loadRangeAbnormalPoints(props.task.id, requestVersion)
  } catch (error) {
    if (requestVersion !== rangeLoadVersion) return
    form.coordinates = []
    rangeAbnormalPoints.value = []
    rangeError.value = error instanceof Error ? `任务范围读取失败：${error.message}` : '任务范围读取失败，请在地图上重新绘制。'
  } finally {
    if (requestVersion !== rangeLoadVersion) return
    rangeDirty.value = false
    rangeLoading.value = false
  }
}

async function loadRangeAbnormalPoints(taskId: string, requestVersion: number) {
  try {
    const records = await getAllTaskAbnormals(taskId, () => requestVersion === rangeLoadVersion)
    if (requestVersion === rangeLoadVersion) rangeAbnormalPoints.value = records
  } catch {
    // 异常图斑无法读取时不影响任务范围编辑和保存。
    if (requestVersion === rangeLoadVersion) rangeAbnormalPoints.value = []
  }
}

/** 后端单页上限为 10 条；编辑地图需要完整显示当前任务的异常图斑。 */
async function getAllTaskAbnormals(taskId: string, isCurrent = () => true) {
  const pageSize = 10
  const firstPage = await getTaskAbnormalPage({ bizTaskId: taskId, pageNum: 1, pageSize })
  const records = [...firstPage.records]
  const pageCount = Math.ceil(firstPage.total / pageSize)
  for (let pageNum = 2; pageNum <= pageCount; pageNum += 1) {
    if (!isCurrent()) return []
    try {
      const page = await getTaskAbnormalPage({ bizTaskId: taskId, pageNum, pageSize })
      records.push(...page.records)
    } catch {
      // 不能因后一页异常导致已成功读取的红色图斑全部消失。
    }
  }
  return records
}

function updateRangeCoordinates(value: [number, number][]) {
  form.coordinates = value
  rangeDirty.value = true
}

async function loadDepartments() {
  if (isMockMode()) return
  departmentsLoading.value = true
  departmentsError.value = ''
  try {
    // 管理员创建/调整任务时优先读取全部已启用部门；旧接口仅返回当前账号的授权部门，
    // 在部分管理员账号上会返回空数组，导致下拉框不可选。
    let result = await getDepartmentOptions()
    if (!result.length) result = await getMyDepartments()
    departments.value = result
    if (!result.some((department) => department.deptId === form.deptId)) form.deptId = result[0]?.deptId || ''
  } catch (optionsError) {
    try {
      const result = await getMyDepartments()
      departments.value = result
      if (!result.some((department) => department.deptId === form.deptId)) form.deptId = result[0]?.deptId || ''
    } catch (fallbackError) {
      departments.value = []
      const error = fallbackError || optionsError
      departmentsError.value = error instanceof Error ? error.message : '部门列表加载失败。'
    }
  } finally {
    departmentsLoading.value = false
  }
}

watch(visible, (open) => {
  if (!open) return
  resetForm()
  void loadDepartments()
  if (isEditing.value) void loadExistingRange()
})

function validateRealForm() {
  if (!form.name.trim() || !selectedScene.value) return '请填写任务名称并选择所属场景。'
  if (!form.deptId) return '请选择主责部门。管理员在全局视角下创建任务时必须明确指定部门。'
  if (schedule.value.length !== 2) return '请选择计划开始和结束时间。'
  if (new Date(schedule.value[1]!) < new Date(schedule.value[0]!)) return '计划结束时间不能早于计划开始时间。'
  if (form.refType !== 'NONE' && !/^\d+$/.test(form.refId)) return '关联飞行计划/任务时，请填写有效的数字 ID。'
  if (form.assigneeId && !/^\d+$/.test(form.assigneeId)) return '负责人 ID 必须为数字。'
  if (form.coordinates.length && form.coordinates.length < 3) return '任务范围至少需要绘制 3 个点。'
  if (isEditing.value && rangeDirty.value && form.coordinates.length < 3) return '修改任务范围后，请至少保留或重新绘制 3 个点。'
  if (form.mediaIds.trim() && !parseMediaIds().length) return '影像素材 ID 请使用逗号或换行分隔的数字。'
  return ''
}

function parseMediaIds() {
  const ids = form.mediaIds.split(/[，,\s]+/).map((item) => item.trim()).filter((item) => /^\d+$/.test(item))
  return [...new Set([...selectedMediaIds.value, ...ids])]
}

function toRangeGeometry() {
  const points = form.coordinates
  return {
    type: 'FeatureCollection' as const,
    features: points.length < 3 ? [] : [{
      type: 'Feature' as const,
      geometry: { type: 'Polygon', coordinates: [[...points, points[0]!]] },
      properties: form.area.trim() ? { name: form.area.trim() } : {},
    }],
  }
}

function toggleMedia(mediaId: string) {
  selectedMediaIds.value = selectedMediaIds.value.includes(mediaId)
    ? selectedMediaIds.value.filter((id) => id !== mediaId)
    : [...selectedMediaIds.value, mediaId]
  if (!selectedMediaIds.value.includes(coverMediaId.value)) coverMediaId.value = selectedMediaIds.value[0] || ''
}

async function loadTaskMedia() {
  if (form.refType !== 'TASK' || !/^\d+$/.test(form.refId)) {
    mediaError.value = '请先选择“飞行任务”关联类型并填写有效的飞行任务 ID。'
    return
  }
  mediaLoading.value = true
  mediaError.value = ''
  try {
    const result = await getFlightTaskMedia({ taskId: form.refId, pageNum: 1, pageSize: 100 })
    availableMedia.value = result.list.map((item) => ({
      id: item.id,
      name: item.name,
      thumbnail: /^https?:\/\//.test(item.thumbnail) ? item.thumbnail : undefined,
    }))
    if (!availableMedia.value.length) mediaError.value = '该飞行任务暂无可关联影像。'
  } catch (error) {
    availableMedia.value = []
    mediaError.value = error instanceof Error ? error.message : '读取飞行任务影像失败。'
  } finally {
    mediaLoading.value = false
  }
}

async function saveRealTask() {
  if (!isEditing.value && createdTaskId.value) {
    submitError.value = `任务已创建（ID：${createdTaskId.value}），请关闭弹窗后刷新列表查看，避免重复创建。`
    return
  }
  const validationError = validateRealForm()
  if (validationError) {
    submitError.value = validationError
    return
  }
  const common = {
    name: form.name.trim(),
    refType: form.refType,
    refId: form.refType === 'NONE' ? undefined : form.refId,
    priority: Number(form.priority),
    planStartTime: toApiDateTime(schedule.value[0]!),
    planEndTime: toApiDateTime(schedule.value[1]!),
    assigneeId: form.assigneeId || undefined,
    remark: form.remark.trim() || undefined,
  }
  submitting.value = true
  submitError.value = ''
  try {
    if (props.task) {
      await updateGovernanceTask({ id: props.task.id, deptId: form.deptId, ...common })
      if (rangeDirty.value) {
        await upsertGovernanceTaskGeometry({
          deptId: form.deptId,
          bizTaskId: props.task.id,
          geometry: toRangeGeometry(),
          coordinateSystem: 'EPSG:4326',
          geometryType: 'POLYGON',
          rangeName: rangeName.value || undefined,
        })
      }
      emit('updated', { id: props.task.id })
    } else {
      const mediaIds = parseMediaIds()
      const created = await createGovernanceTask({
        deptId: form.deptId,
        sceneCode: selectedScene.value!.code,
        executeMode: 'MANUAL',
        ...common,
      })
      createdTaskId.value = created.id
      if (form.coordinates.length >= 3) {
        await upsertGovernanceTaskGeometry({
          deptId: form.deptId,
          bizTaskId: created.id,
          geometry: toRangeGeometry(),
          coordinateSystem: 'EPSG:4326',
          geometryType: 'POLYGON',
          rangeName: form.area.trim() || undefined,
        })
      }
      if (mediaIds.length) {
        await bindGovernanceTaskMedia({ deptId: form.deptId, bizTaskId: created.id, mediaIds })
        if (coverMediaId.value && mediaIds.includes(coverMediaId.value)) {
          await setGovernanceTaskMediaCover({ deptId: form.deptId, bizTaskId: created.id, mediaId: coverMediaId.value })
        }
      }
      emit('created', created)
    }
    visible.value = false
    // 弹窗关闭后不再接受尚未返回的异常图斑响应，避免旧数据回写到下一次编辑。
    rangeLoadVersion += 1
  } catch (error) {
    const message = error instanceof Error ? error.message : '任务保存失败，请稍后重试。'
    submitError.value = createdTaskId.value
      ? `任务已创建（ID：${createdTaskId.value}），但范围或影像关联失败：${message}。请关闭弹窗后在任务详情补充，不要重复创建。`
      : message
  } finally {
    submitting.value = false
  }
}

function createMockTask() {
  if (!form.name || !form.sceneId || !form.area || !form.owner) {
    submitError.value = '请填写任务名称、所属场景、所属区域和执行单位。'
    return
  }
  const workspaceConfig = getSharedWorkspaceConfig()
  const now = new Date()
  const task: PortalTask = {
    id: `TASK-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(Date.now()).slice(-3)}`,
    organizationId: user.organizationId,
    sceneId: form.sceneId,
    name: form.name,
    status: '待处理',
    priority: toMockPriority(form.priority),
    area: form.area,
    areaSize: Math.max(form.coordinates.length * 657.3, 1),
    owner: form.owner,
    assignee: form.contact || '待指派',
    createdAt: now.toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-'),
    updatedAt: now.toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-'),
    plannedStart: (schedule.value[0] || '').replace('T', ' '),
    plannedEnd: (schedule.value[1] || '').replace('T', ' '),
    progress: 0,
    description: form.description || '暂无任务描述',
    contact: form.contact || '待指派',
    phone: form.phone || '-',
    resultRequirements: [...form.requirements],
    coordinates: [...form.coordinates],
    workflow: workspaceConfig.nodes.map((node, index) => ({
      key: node.key,
      name: node.name,
      status: index === 0 ? 'active' as const : 'pending' as const,
      ...(index === 0 ? { time: '刚刚' } : {}),
    })),
    metrics: { flights: 0, flightHours: 0, patrolArea: 0, issues: 0, completedNodes: 0, totalNodes: workspaceConfig.nodes.length },
  }
  addSessionTask(task)
  emit('created', task)
  visible.value = false
}

function saveTask() {
  if (submitting.value) return
  if (!isMockMode()) {
    void saveRealTask()
    return
  }
  if (isEditing.value) {
    submitError.value = 'Mock 模式暂不支持编辑会话任务。'
    return
  }
  createMockTask()
}

function cancelTaskEdit() {
  if (submitting.value) return
  // 表单和范围均是弹窗内副本；销毁弹窗即可丢弃修改。不要在地图仍挂载时清空坐标，
  // 否则 Leaflet 会短暂重绘为空，造成“取消后卡住/范围消失”的视觉问题。
  rangeLoadVersion += 1
  visible.value = false
}
</script>

<template>
  <el-dialog v-model="visible" :title="isEditing ? '▮ 编辑任务' : '▮ 新增任务'" width="1040px" class="new-task-dialog" :show-close="false" :close-on-click-modal="false" :close-on-press-escape="false" destroy-on-close>
    <div class="new-task-grid">
      <section class="task-form">
        <label>任务名称 *</label><input v-model="form.name" placeholder="请输入任务名称" />
        <div class="form-columns"><div><label>所属场景 *</label><select v-model="form.sceneId" :disabled="isEditing"><option v-for="scene in scenes" :key="scene.id" :value="scene.id">{{ scene.name }}</option></select></div><div><label>优先级</label><select v-model="form.priority"><option value="2">高</option><option value="1">中</option><option value="0">低</option></select></div></div>
        <p v-if="submitError" class="task-form-error">{{ submitError }}</p>
        <template v-if="isMockMode()">
          <label>所属区域 *</label><input v-model="form.area" placeholder="请输入任务区域" />
          <label>执行单位 *</label><input v-model="form.owner" placeholder="请输入执行单位" />
        </template>
        <template v-if="!isMockMode()">
          <label>主责部门 *</label>
          <select v-model="form.deptId" :disabled="departmentsLoading || !departmentOptions.length">
            <option value="" disabled>{{ departmentsLoading ? '正在读取主责部门…' : departmentsError ? '主责部门读取失败' : '请选择主责部门' }}</option>
            <option v-for="dept in departmentOptions" :key="dept.deptId" :value="dept.deptId">{{ dept.deptName }}</option>
          </select>
          <p v-if="departmentsError" class="task-form-error">{{ departmentsError }} <button type="button" class="department-retry" :disabled="departmentsLoading" @click="loadDepartments">重新读取</button></p>
          <p v-else-if="!departmentsLoading && !departmentOptions.length" class="task-form-error">当前登录账号没有可选择的主责部门，请确认部门数据和账号权限。</p>
        </template>
        <label>计划时间 *</label>
        <TaskSchedulePicker v-model="schedule" />
        <template v-if="isMockMode()">
          <label>任务描述</label><textarea v-model="form.description" maxlength="300" placeholder="请输入任务背景、目标和具体说明"></textarea>
          <label>成果要求</label>
          <div class="requirement-list"><label v-for="item in ['照片','视频','直播','二维成果','三维成果','全景','事件','巡检报告']" :key="item"><input v-model="form.requirements" type="checkbox" :value="item" />{{ item }}</label></div>
          <label>联系人</label><div class="form-columns"><input v-model="form.contact" placeholder="联系人姓名" /><input v-model="form.phone" placeholder="联系人手机号" /></div>
        </template>
        <template v-else>
          <div class="form-columns"><div><label>负责人 ID</label><input v-model="form.assigneeId" inputmode="numeric" placeholder="可暂不填写" /></div><div><label>关联类型</label><select v-model="form.refType"><option value="NONE">不关联</option><option value="PLAN">飞行计划</option><option value="TASK">飞行任务</option></select></div></div>
          <label v-if="form.refType !== 'NONE'">关联对象 ID *</label><input v-if="form.refType !== 'NONE'" v-model="form.refId" inputmode="numeric" placeholder="请输入飞行计划或飞行任务 ID" />
          <label>内部备注</label><textarea v-model="form.remark" maxlength="1000" placeholder="仅管理员可见，可暂不填写"></textarea>
          <template v-if="!isEditing">
            <label>范围名称</label><input v-model="form.area" maxlength="100" placeholder="例如：城东农田巡查区域（可选）" />
            <label>关联影像素材</label>
            <textarea v-model="form.mediaIds" maxlength="1000" placeholder="输入已有影像素材 ID，多个 ID 使用逗号或换行分隔"></textarea>
            <button class="load-media-button" type="button" :disabled="mediaLoading" @click="loadTaskMedia">{{ mediaLoading ? '正在读取影像…' : '从关联飞行任务读取影像' }}</button>
            <p class="task-form-hint">可直接填写已有素材 ID；若任务关联类型为“飞行任务”，可读取该任务的影像并勾选。首选影像会作为任务封面。</p>
            <div v-if="availableMedia.length" class="media-picker">
              <label v-for="media in availableMedia" :key="media.id" class="media-option" :class="{ selected: selectedMediaIds.includes(media.id) }">
                <img v-if="media.thumbnail" :src="media.thumbnail" :alt="media.name" />
                <i v-else>▧</i>
                <span><b>{{ media.name }}</b><small>素材 ID：{{ media.id }}</small></span>
                <input type="checkbox" :checked="selectedMediaIds.includes(media.id)" @change="toggleMedia(media.id)" />
                <input v-if="selectedMediaIds.includes(media.id)" v-model="coverMediaId" type="radio" :value="media.id" name="task-cover-media" title="设为封面" />
              </label>
            </div>
            <p v-if="mediaError" class="task-form-error">{{ mediaError }}</p>
          </template>
        </template>
      </section>
      <section class="task-range">
        <div class="range-title"><b>任务地理范围</b><span v-if="!isEditing">在地图上绘制 WGS84 多边形，至少选择 3 个点</span></div>
        <div v-if="rangeLoading" class="range-waiting"><b>正在读取任务范围…</b></div>
        <div v-else class="range-editor"><TaskRangeMap :coordinates="form.coordinates" :abnormal-points="rangeAbnormalPoints" :fit-abnormal-points="true" :initial-drawing-complete="isEditing" editable @update:coordinates="updateRangeCoordinates" /><p v-if="rangeError" class="range-error">{{ rangeError }}</p></div>
      </section>
    </div>
    <template #footer><button class="dialog-cancel" :disabled="submitting" @click="cancelTaskEdit">取消</button><button class="dialog-confirm" :disabled="submitting" @click="saveTask">{{ submitting ? '正在保存…' : isEditing ? '保存修改' : '确认创建' }}</button></template>
  </el-dialog>
</template>

<style lang="scss">
.new-task-dialog { --el-dialog-bg-color: #04213b; --el-text-color-primary: #d5f4ff; width: min(1040px, calc(100vw - 32px)); max-height: 88vh; overflow: hidden; border: 1px solid #1384b0; border-radius: 5px; box-shadow: 0 0 22px #0877b166; }
.new-task-dialog .el-dialog__header { margin: 0; padding: 13px 18px; border-bottom: 1px solid #0d5a80; background: #063052; }.new-task-dialog .el-dialog__title { color: #d8f7ff; font-size: 16px; font-weight: bold; }.new-task-dialog .el-dialog__close { color: #9bc9d8; }.new-task-dialog .el-dialog__body { padding: 0; }.new-task-dialog .el-dialog__footer { padding: 12px 18px; border-top: 1px solid #0c5578; }
.new-task-grid { height: min(570px, calc(88vh - 132px)); min-height: 420px; display: grid; grid-template-columns: minmax(340px, 36%) minmax(0, 64%); }.task-form { min-width: 0; overflow-y: auto; overflow-x: hidden; padding: 14px 16px; border-right: 1px solid #0c5174; }.task-form>label,.task-form div>label { display: block; margin: 10px 0 5px; color: #a8d3df; font-size: 16px; }.task-form input:not([type=checkbox]),.task-form select,.task-form textarea { box-sizing: border-box; width: 100%; min-width: 0; padding: 8px 9px; color: #d8f5fb; background: #03182d; border: 1px solid #155a7e; outline: none; font-size: 15px; }.task-form select:disabled { opacity: .7; cursor: not-allowed; }.task-form textarea { height: 64px; resize: none; }.form-columns { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 9px; }.form-columns>div { min-width: 0; }.department-retry { margin-left: 7px; padding: 0; color: #55cce9; background: transparent; border: 0; cursor: pointer; text-decoration: underline; }.department-retry:disabled { opacity: .6; cursor: wait; }.requirement-list { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }.requirement-list label { margin: 0!important; font-size: 14px!important; }.requirement-list input { accent-color: #139dcc; }
.task-range { min-width: 0; display: grid; grid-template-rows: 45px 1fr; padding: 14px; }.range-title { display: flex; align-items: center; justify-content: space-between; }.range-title span { color: #678fa1; font-size: 14px; }.range-waiting { min-width: 0; display: grid; place-content: center; gap: 10px; color: #83b7c9; text-align: center; background: repeating-linear-gradient(135deg,#063151 0 12px,#042641 12px 24px); border: 1px dashed #176b91; }.range-waiting b { color: #c9eef7; font-size: 18px; }.range-waiting span { max-width: 360px; color: #78a3b5; font-size: 14px; line-height: 1.7; }
.range-editor { position: relative; min-width: 0; min-height: 0; }.range-editor :deep(.task-range-map) { min-height: 0; }.range-error { position: absolute; z-index: 600; right: 10px; bottom: 10px; max-width: 75%; margin: 0; padding: 6px 8px; color: #ffd2d6; background: #3c1d2ae8; border: 1px solid #9e4051; font-size: 12px; }
.task-form-error { margin: 8px 0 0; color: #ff9fa9; font-size: 13px; line-height: 1.5; }.task-form-hint { margin: 8px 0; padding: 8px; color: #99c3d0; background: #063452; border-left: 2px solid #2aaed6; font-size: 12px; line-height: 1.6; }.load-media-button { width: 100%; margin-top: 7px; padding: 8px; color: #bcefff; background: #06466a; border: 1px solid #1880aa; cursor: pointer; }.load-media-button:hover { background: #0875a2; }.load-media-button:disabled { cursor: wait; opacity: .65; }.media-picker { display: grid; gap: 6px; margin-top: 9px; }.media-option { display: grid!important; grid-template-columns: 42px minmax(0, 1fr) auto auto; align-items: center; gap: 7px; margin: 0!important; padding: 5px; color: #a9dce9; background: #031b31; border: 1px solid #155a7e; cursor: pointer; }.media-option.selected { border-color: #20b9de; background: #07506d; }.media-option img,.media-option i { width: 42px; height: 32px; display: grid; place-items: center; overflow: hidden; color: #69d9ed; object-fit: cover; background: #073a55; font-style: normal; }.media-option span { min-width: 0; }.media-option b,.media-option small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.media-option b { color: #d4f7ff; font-size: 12px; }.media-option small { margin-top: 2px; color: #6d9db0; font-size: 11px; }.media-option input { width: auto!important; accent-color: #1dc8e4; }
.dialog-cancel,.dialog-confirm { min-width: 90px; padding: 9px 18px; color: #b9dbe6; background: #05213b; border: 1px solid #176084; cursor: pointer; }.dialog-confirm { color: white; background: #087fe7; border-color: #199fff; box-shadow: 0 0 10px #158be766; margin-left: 8px; }.dialog-cancel:disabled,.dialog-confirm:disabled { opacity: .55; cursor: wait; }
</style>
