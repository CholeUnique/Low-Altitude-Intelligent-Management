<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import TaskRangeMap from '@/components/TaskRangeMap.vue'
import { addSessionTask } from '@/mocks/portal'
import { useUserStore } from '@/stores/user'
import type { PortalTask, TaskPriority } from '@/types'
import { getWorkspaceConfig } from '@/workspace/config/registry'

const props = defineProps<{ sceneId?: string }>()
const emit = defineEmits<{ created: [task: PortalTask] }>()
const visible = defineModel<boolean>({ default: false })
const user = useUserStore()
const scenes = computed(() => user.organization.scenes)
const form = reactive({
  name: '',
  sceneId: '',
  area: '',
  owner: '',
  priority: '中' as TaskPriority,
  start: '2026-09-10T08:00',
  end: '2026-09-12T18:00',
  description: '',
  contact: '',
  phone: '',
  requirements: ['照片'] as string[],
  coordinates: [[117.75,31.97],[118.08,32.08],[118.35,31.92],[118.22,31.60],[117.82,31.56]] as [number, number][],
})

watch(visible, (open) => {
  if (open) form.sceneId = props.sceneId || scenes.value[0]?.id || ''
})

function createTask() {
  if (!form.name || !form.sceneId || !form.area || !form.owner) return
  const workspaceConfig = getWorkspaceConfig(form.sceneId)
  if (!workspaceConfig) return
  const now = new Date()
  const task: PortalTask = {
    id: `TASK-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(Date.now()).slice(-3)}`,
    organizationId: user.organizationId,
    sceneId: form.sceneId,
    name: form.name,
    status: '待处理',
    priority: form.priority,
    area: form.area,
    areaSize: Math.max(form.coordinates.length * 657.3, 1),
    owner: form.owner,
    assignee: form.contact || '待指派',
    createdAt: now.toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-'),
    updatedAt: now.toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-'),
    plannedStart: form.start.replace('T', ' '),
    plannedEnd: form.end.replace('T', ' '),
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
    metrics: {
      flights: 0,
      flightHours: 0,
      patrolArea: 0,
      issues: 0,
      completedNodes: 0,
      totalNodes: workspaceConfig.nodes.length,
    },
  }
  addSessionTask(task)
  emit('created', task)
  visible.value = false
}
</script>

<template>
  <el-dialog v-model="visible" title="▮ 新增任务" width="1040px" class="new-task-dialog" destroy-on-close>
    <div class="new-task-grid">
      <section class="task-form">
        <label>任务名称 *</label><input v-model="form.name" placeholder="请输入任务名称" />
        <div class="form-columns"><div><label>所属场景 *</label><select v-model="form.sceneId"><option v-for="scene in scenes" :key="scene.id" :value="scene.id">{{ scene.name }}</option></select></div><div><label>优先级</label><select v-model="form.priority"><option>高</option><option>中</option><option>低</option></select></div></div>
        <label>所属区域 *</label><input v-model="form.area" placeholder="请输入任务区域" />
        <label>执行单位 *</label><input v-model="form.owner" placeholder="请输入执行单位" />
        <label>计划时间</label><div class="form-columns"><input v-model="form.start" type="datetime-local" /><input v-model="form.end" type="datetime-local" /></div>
        <label>任务描述</label><textarea v-model="form.description" maxlength="300" placeholder="请输入任务背景、目标和具体说明"></textarea>
        <label>成果要求</label>
        <div class="requirement-list"><label v-for="item in ['照片','视频','直播','二维成果','三维成果','全景','事件','巡检报告']" :key="item"><input v-model="form.requirements" type="checkbox" :value="item" />{{ item }}</label></div>
        <label>联系人</label><div class="form-columns"><input v-model="form.contact" placeholder="联系人姓名" /><input v-model="form.phone" placeholder="联系人手机号" /></div>
      </section>
      <section class="task-range">
        <div class="range-title"><b>作业范围</b><span>在地图上绘制任务区域</span></div>
        <TaskRangeMap v-model:coordinates="form.coordinates" editable />
      </section>
    </div>
    <template #footer><button class="dialog-cancel" @click="visible = false">取消</button><button class="dialog-confirm" @click="createTask">确认创建</button></template>
  </el-dialog>
</template>

<style lang="scss">
.new-task-dialog { --el-dialog-bg-color: #04213b; --el-text-color-primary: #d5f4ff; border: 1px solid #1384b0; box-shadow: 0 0 22px #0877b166; }
.new-task-dialog .el-dialog__header { margin: 0; padding: 13px 18px; border-bottom: 1px solid #0d5a80; background: #063052; }.new-task-dialog .el-dialog__title { color: #d8f7ff; font-size: 16px; font-weight: bold; }.new-task-dialog .el-dialog__close { color: #9bc9d8; }.new-task-dialog .el-dialog__body { padding: 0; }.new-task-dialog .el-dialog__footer { padding: 12px 18px; border-top: 1px solid #0c5578; }
.new-task-grid { height: 570px; display: grid; grid-template-columns: 36% 64%; }.task-form { overflow-y: auto; padding: 14px 16px; border-right: 1px solid #0c5174; }.task-form>label,.task-form div>label { display: block; margin: 10px 0 5px; color: #a8d3df; font-size: 16px; }.task-form input:not([type=checkbox]),.task-form select,.task-form textarea { width: 100%; padding: 8px 9px; color: #d8f5fb; background: #03182d; border: 1px solid #155a7e; outline: none; font-size: 15px; }.task-form textarea { height: 64px; resize: none; }.form-columns { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; }.requirement-list { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }.requirement-list label { margin: 0!important; font-size: 14px!important; }.requirement-list input { accent-color: #139dcc; }
.task-range { display: grid; grid-template-rows: 45px 1fr; padding: 14px; }.range-title { display: flex; align-items: center; justify-content: space-between; }.range-title span { color: #678fa1; font-size: 14px; }
.dialog-cancel,.dialog-confirm { min-width: 90px; padding: 9px 18px; color: #b9dbe6; background: #05213b; border: 1px solid #176084; cursor: pointer; }.dialog-confirm { color: white; background: #087fe7; border-color: #199fff; box-shadow: 0 0 10px #158be766; margin-left: 8px; }
</style>
