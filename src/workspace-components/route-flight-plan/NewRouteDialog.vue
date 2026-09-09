<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import {
  aircraftOptions,
  buildRouteMetrics,
  createDefaultWaypoints,
  routeGroups,
  routeTypeOptions,
  type FlightRoute,
  type RouteType,
} from '@/mocks/route-planning'

const visible = defineModel<boolean>({ default: false })
const emit = defineEmits<{ created: [route: FlightRoute] }>()

const form = reactive({
  group: '默认分组',
  aircraft: '',
  routeType: '' as RouteType | '',
  kmlName: '',
})

const canNext = computed(() => Boolean(form.aircraft && form.routeType))
const allRouteTypes = routeTypeOptions.flatMap((group) => [...group.items])

watch(visible, (open) => {
  if (!open) return
  form.group = '默认分组'
  form.aircraft = ''
  form.routeType = ''
  form.kmlName = ''
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
    polygon: [
      [119.88, 32.48],
      [119.97, 32.51],
      [120.02, 32.46],
      [119.96, 32.41],
      [119.89, 32.43],
    ],
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
  <el-dialog v-model="visible" title="创建新航线" width="560px" class="new-route-dialog" destroy-on-close>
    <label class="field-label">选择航线分组</label>
    <select v-model="form.group" class="field-control">
      <option v-for="item in routeGroups" :key="item" :value="item">{{ item }}</option>
    </select>

    <label class="field-label">选择飞行器 <em>*</em></label>
    <select v-model="form.aircraft" class="field-control">
      <option value="" disabled>请选择</option>
      <option v-for="item in aircraftOptions" :key="item" :value="item">{{ item }}</option>
    </select>

    <label class="field-label">航线类型 <em>*</em></label>
    <div v-for="group in routeTypeOptions" :key="group.group" class="type-group">
      <div class="type-group-title">{{ group.group }}</div>
      <div class="type-grid">
        <button
          v-for="item in group.items"
          :key="item.key"
          type="button"
          :class="{ active: form.routeType === item.key }"
          @click="form.routeType = item.key"
        >
          <i>{{ item.icon }}</i>
          <span>{{ item.label }}</span>
        </button>
      </div>
    </div>

    <label class="field-label">导入航飞范围</label>
    <label class="upload-box">
      <input type="file" accept=".kml" @change="onFileChange" />
      <span class="upload-icon">＋</span>
      <b>{{ form.kmlName || '点击上传 KML 文件' }}</b>
      <small>格式支持：KML　请保证数据仅存在一个多边形</small>
    </label>

    <template #footer>
      <button class="btn-cancel" @click="visible = false">取消</button>
      <button class="btn-next" :disabled="!canNext" @click="submit">下一步</button>
    </template>
  </el-dialog>
</template>

<style lang="scss">
.new-route-dialog {
  --el-dialog-bg-color: #1f242b;
  --el-text-color-primary: #f2f5f7;
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 12px 40px #0008;
}
.new-route-dialog .el-dialog__header {
  margin: 0;
  padding: 16px 20px;
  border-bottom: 1px solid #2f3640;
}
.new-route-dialog .el-dialog__title { font-size: 16px; font-weight: 700; color: #fff; }
.new-route-dialog .el-dialog__body { padding: 16px 20px 8px; }
.new-route-dialog .el-dialog__footer { padding: 12px 20px 18px; border-top: 1px solid #2f3640; }
.field-label { display: block; margin: 12px 0 8px; color: #c8d0d8; font-size: 16px; }
.field-label em { color: #ff6b6b; font-style: normal; }
.field-control {
  width: 100%;
  height: 38px;
  padding: 0 12px;
  color: #eef3f7;
  background: #151a21;
  border: 1px solid #3a4350;
  border-radius: 6px;
  outline: none;
}
.type-group { margin-bottom: 10px; }
.type-group-title { margin-bottom: 8px; color: #8b97a5; font-size: 16px; }
.type-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.type-grid button {
  display: grid;
  justify-items: center;
  gap: 6px;
  padding: 12px 8px;
  color: #c7d2dc;
  background: #151a21;
  border: 1px solid #3a4350;
  border-radius: 8px;
  cursor: pointer;
}
.type-grid button.active,
.type-grid button:hover {
  color: #fff;
  border-color: #3d8bfd;
  background: #1b2a40;
  box-shadow: inset 0 0 0 1px #3d8bfd55;
}
.type-grid i { font-size: 18px; font-style: normal; }
.type-grid span { font-size: 16px; }
.upload-box {
  position: relative;
  display: grid;
  place-items: center;
  gap: 6px;
  min-height: 110px;
  margin-bottom: 8px;
  color: #9aa7b4;
  background: #151a21;
  border: 1px dashed #4a5563;
  border-radius: 8px;
  cursor: pointer;
}
.upload-box input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
.upload-icon {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  color: #7eb6ff;
  border: 1px solid #3d8bfd;
  border-radius: 8px;
  font-size: 18px;
}
.upload-box b { color: #e8eef4; font-size: 16px; }
.upload-box small { font-size: 15px; }
.btn-cancel,
.btn-next {
  min-width: 88px;
  height: 36px;
  margin-left: 8px;
  border-radius: 6px;
  cursor: pointer;
}
.btn-cancel { color: #d7dee6; background: #2a313a; border: 1px solid #3d4652; }
.btn-next { color: #fff; background: #3d8bfd; border: 1px solid #5aa0ff; }
.btn-next:disabled { opacity: .45; cursor: not-allowed; }
</style>
