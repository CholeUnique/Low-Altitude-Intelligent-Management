<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import {
  aircraftOptions,
  buildRouteMetrics,
  createDefaultWaypoints,
  routeGroups,
  routeTypeOptions,
  type FlightRoute,
  type RouteType,
} from '@/mocks/route-planning'
import type { UavDeviceOption } from '@/api/patrol'

const props = withDefaults(defineProps<{
  devices?: UavDeviceOption[]
  devicesLoading?: boolean
  realMode?: boolean
}>(), {
  devices: () => [],
  devicesLoading: false,
  realMode: false,
})

const visible = defineModel<boolean>({ default: false })
const emit = defineEmits<{ created: [route: FlightRoute] }>()

const form = reactive({
  group: '测试',
  aircraft: '',
  routeType: '' as RouteType | '',
  kmlName: '',
})
const submitMessage = ref('')
const aircraftChoices = computed(() => props.realMode
  ? props.devices.map((item) => ({ value: item.id, label: item.label }))
  : aircraftOptions.map((item) => ({ value: item, label: item })))
const canNext = computed(() => Boolean(form.aircraft && form.routeType))
const allRouteTypes = routeTypeOptions.flatMap((group) => [...group.items])

watch(visible, (open) => {
  if (!open) return
  form.group = '测试'
  form.aircraft = ''
  form.routeType = ''
  form.kmlName = ''
  submitMessage.value = ''
})

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  if (!file.name.toLowerCase().endsWith('.kml')) {
    form.kmlName = ''
    window.alert('仅支持 KML 格式')
    return
  }
  form.kmlName = file.name
}

function submit() {
  if (!canNext.value || !form.routeType) return
  if (props.realMode) {
    submitMessage.value = '已完成航线类型、飞行器与范围文件选择；当前后端尚未提供新建/导入航线接口，无法提交保存。'
    return
  }
  const typeMeta = allRouteTypes.find((item) => item.key === form.routeType)
  const waypoints = createDefaultWaypoints()
  const metrics = buildRouteMetrics(waypoints)
  const route: FlightRoute = {
    id: `RT-NEW-${Date.now().toString().slice(-6)}`,
    name: `${typeMeta?.label || '新建航线'}-${form.aircraft.split(' ').pop()}`,
    group: form.group,
    aircraft: form.aircraft,
    routeType: form.routeType,
    routeTypeLabel: typeMeta?.label || '航点巡检',
    area: '泰州市新建作业区',
    status: '草稿',
    waypoints,
    polygon: [[119.88, 32.48], [119.97, 32.51], [120.02, 32.46], [119.96, 32.41], [119.89, 32.43]],
    height: 120,
    speed: 8,
    overlapFront: 75,
    overlapSide: 65,
    createdAt: new Date().toISOString().slice(0, 10),
    lengthKm: metrics.lengthKm,
    durationMin: metrics.durationMin,
    photoEstimate: metrics.photoEstimate,
  }
  emit('created', route)
  visible.value = false
}
</script>

<template>
  <el-dialog v-model="visible" title="创建新航线" width="344px" class="new-route-dialog" destroy-on-close append-to-body>
    <label class="field-label">选择航线分组</label>
    <select v-model="form.group" class="field-control">
      <option value="测试">测试</option>
      <option v-for="item in routeGroups" :key="item" :value="item">{{ item }}</option>
    </select>

    <label class="field-label required">选择飞行器</label>
    <select v-model="form.aircraft" class="field-control" :disabled="devicesLoading">
      <option value="" disabled>{{ devicesLoading ? '正在读取飞行器…' : '请选择' }}</option>
      <option v-for="item in aircraftChoices" :key="item.value" :value="item.value">{{ item.label }}</option>
    </select>
    <p v-if="realMode && !devicesLoading && !aircraftChoices.length" class="field-hint">当前账号下未读取到可用飞行器。</p>

    <label class="field-label required">航线类型</label>
    <div v-for="group in routeTypeOptions" :key="group.group" class="type-group">
      <div class="type-group-title">{{ group.group }}</div>
      <div class="type-grid">
        <button v-for="item in group.items" :key="item.key" type="button" :class="{ active: form.routeType === item.key }" @click="form.routeType = item.key">
          <i aria-hidden="true">{{ item.icon }}</i><span>{{ item.label }}</span>
        </button>
      </div>
    </div>

    <label class="field-label">导入航飞范围</label>
    <label class="upload-box">
      <input type="file" accept=".kml" @change="onFileChange" />
      <span class="upload-icon">◴</span>
      <b>{{ form.kmlName || '格式支持：KML' }}</b>
      <small>{{ form.kmlName ? 'KML 文件已选择' : '请保证数据仅存在一个多边形' }}</small>
    </label>
    <p v-if="submitMessage" class="submit-message">{{ submitMessage }}</p>

    <template #footer>
      <button class="btn-cancel" @click="visible = false">取消</button>
      <button class="btn-next" :disabled="!canNext" @click="submit">下一步</button>
    </template>
  </el-dialog>
</template>

<style lang="scss">
.new-route-dialog {
  --el-dialog-bg-color: #292932;
  --el-text-color-primary: #f5f6f8;
  overflow: hidden;
  border: 1px solid #4a4b59;
  border-radius: 13px;
  box-shadow: 0 24px 60px #000a;
}
.new-route-dialog .el-dialog__header { margin: 0; padding: 19px 18px 10px; }
.new-route-dialog .el-dialog__title { color: #f7f8fb; font-size: 16px; font-weight: 700; }
.new-route-dialog .el-dialog__headerbtn { top: 16px; right: 15px; width: 24px; height: 24px; }
.new-route-dialog .el-dialog__close { color: #c6c6cf; font-size: 18px; font-weight: 700; }
.new-route-dialog .el-dialog__headerbtn:hover .el-dialog__close { color: #fff; }
.new-route-dialog .el-dialog__body { padding: 0 18px 2px; }
.new-route-dialog .el-dialog__footer { display: flex; justify-content: flex-end; gap: 8px; padding: 14px 18px 18px; }
.new-route-dialog .field-label { display: block; margin: 13px 0 7px; color: #e5e5eb; font-size: 14px; font-weight: 600; }
.new-route-dialog .field-label.required::before { content: '*'; margin-right: 5px; color: #ff696b; }
.new-route-dialog .field-control { width: 100%; height: 34px; padding: 0 10px; color: #e9e9ef; background: #3b3b45; border: 1px solid #3f404b; border-radius: 4px; outline: none; font-size: 14px; }
.new-route-dialog .field-control:focus { border-color: #5c9dff; box-shadow: 0 0 0 1px #5c9dff; }
.new-route-dialog .field-control:disabled { color: #7f8290; cursor: wait; }
.new-route-dialog .field-hint { margin: 6px 1px 0; color: #e7b36d; font-size: 12px; }
.new-route-dialog .type-group { padding: 7px 9px 9px; background: #31313a; border: 1px solid #3f404a; border-radius: 4px; }
.new-route-dialog .type-group + .type-group { margin-top: 8px; }
.new-route-dialog .type-group-title { margin-bottom: 7px; color: #a6a8b4; font-size: 12px; }
.new-route-dialog .type-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 7px; }
.new-route-dialog .type-grid button { min-height: 61px; display: grid; place-items: center; align-content: center; gap: 3px; padding: 5px 3px; color: #f0f0f3; background: #484850; border: 1px solid transparent; border-radius: 5px; cursor: pointer; }
.new-route-dialog .type-grid button:hover,.new-route-dialog .type-grid button.active { background: #4d5970; border-color: #639eff; box-shadow: inset 0 0 0 1px #639eff44; }
.new-route-dialog .type-grid i { height: 26px; color: #fff; font-size: 22px; font-style: normal; line-height: 1; }
.new-route-dialog .type-grid span { color: inherit; font-size: 12px; white-space: nowrap; }
.new-route-dialog .upload-box { position: relative; min-height: 140px; display: grid; place-content: center; justify-items: center; gap: 7px; color: #b6b7c1; background: #46464f; border: 1px solid #484953; border-radius: 7px; cursor: pointer; }
.new-route-dialog .upload-box:hover { background: #4d4d57; border-color: #629bff; }
.new-route-dialog .upload-box input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
.new-route-dialog .upload-icon { color: #d7d8df; font-size: 31px; line-height: 1; }
.new-route-dialog .upload-box b { color: #e7e7ec; font-size: 13px; }
.new-route-dialog .upload-box small { color: #b2b4bf; font-size: 12px; }
.new-route-dialog .submit-message { margin: 10px 0 0; color: #ffcd87; font-size: 12px; line-height: 1.5; }
.new-route-dialog .btn-cancel,.new-route-dialog .btn-next { min-width: 59px; height: 32px; border: 0; border-radius: 4px; font-size: 14px; cursor: pointer; }
.new-route-dialog .btn-cancel { color: #fff; background: #50505b; }
.new-route-dialog .btn-next { color: #fff; background: #5f99f4; box-shadow: 0 3px 8px #3167bd55; }
.new-route-dialog .btn-next:disabled { color: #9ebff3; background: #5275aa; opacity: .55; cursor: not-allowed; }
</style>
