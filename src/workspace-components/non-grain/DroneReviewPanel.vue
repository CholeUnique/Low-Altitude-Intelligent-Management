<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import type { NonGrainWorkspaceContext } from '@/mocks/non-grain-workspace'
import NonGrainTaskSummary from './NonGrainTaskSummary.vue'
import DroneReviewImageryMap from './DroneReviewImageryMap.vue'
import './workspace.scss'

defineProps<{ context: NonGrainWorkspaceContext; readonly: boolean; disabledReason: string }>()
const emit = defineEmits<{ pass: []; reject: [] }>()
const conclusion = ref<'pass' | 'reject'>('pass')
const recovery = ref('复耕面积 13.21 亩，耕作层恢复完整，已种植当季水稻。')
const note = ref('影像对比显示苗木及附属设施已清除，手工勾画范围内已完成复耕。')
const compareMode = ref<'side' | 'swipe'>('side')
const swipePosition = ref(50)
const sourceMode = ref<'flight' | 'upload'>('flight')
const selectedFlightId = ref('FLT-20261020-02')
const fileInput = ref<HTMLInputElement>()
const uploadName = ref('')
const uploadedImageUrl = ref('')
const reviewCoordinates = ref<[number, number][]>([])
const drawingSaved = ref(false)

const recentFlights = [
  { id: 'FLT-20261020-02', name: '10月20日复核航飞（正射）', time: '2026-10-20 15:42', index: 7 },
  { id: 'FLT-20261016-01', name: '10月16日整改巡查（正射）', time: '2026-10-16 10:18', index: 6 },
  { id: 'FLT-20261009-03', name: '10月9日地块补拍（可见光）', time: '2026-10-09 16:05', index: 4 },
]

const selectedFlight = computed(() => recentFlights.find((item) => item.id === selectedFlightId.value) || recentFlights[0]!)
const reviewSourceIndex = computed(() => selectedFlight.value.index)
const reviewImageUrl = computed(() => sourceMode.value === 'upload' ? uploadedImageUrl.value : '')
const reviewSourceLabel = computed(() => sourceMode.value === 'upload'
  ? uploadName.value || '等待上传本区域影像截图'
  : `${selectedFlight.value.name} · ${selectedFlight.value.time}`)

function openFilePicker(readonly: boolean) {
  if (readonly) return
  fileInput.value?.click()
}

function selectUploadMode(readonly: boolean) {
  if (readonly) return
  if (uploadedImageUrl.value) sourceMode.value = 'upload'
  else openFilePicker(readonly)
}

function handleFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  if (uploadedImageUrl.value) URL.revokeObjectURL(uploadedImageUrl.value)
  uploadedImageUrl.value = URL.createObjectURL(file)
  uploadName.value = file.name
  sourceMode.value = 'upload'
  reviewCoordinates.value = []
  drawingSaved.value = false
}

function selectFlight() {
  sourceMode.value = 'flight'
  reviewCoordinates.value = []
  drawingSaved.value = false
}

function updateCoordinates(value: [number, number][]) {
  reviewCoordinates.value = value
  drawingSaved.value = false
}

function finishDrawing() {
  drawingSaved.value = true
}

onBeforeUnmount(() => {
  if (uploadedImageUrl.value) URL.revokeObjectURL(uploadedImageUrl.value)
})
</script>

<template>
  <div class="ng-page ng-page-stage ng-drone-review-page">
    <div v-if="readonly" class="ng-readonly">{{ disabledReason || '当前页面只读' }}</div>
    <div class="ng-grid">
      <NonGrainTaskSummary class="span-12" :context="context" node="drone-review" />

      <section class="ng-card span-8 ng-review-material-card">
        <header class="ng-card-head ng-review-head">
          <h3><i>图</i>复核材料 <small>问题图斑与本次复核影像对比</small></h3>
          <div class="ng-tabs compact">
            <button type="button" :class="{ active: compareMode === 'side' }" @click="compareMode = 'side'">并排对比</button>
            <button type="button" :class="{ active: compareMode === 'swipe' }" @click="compareMode = 'swipe'">卷帘对比</button>
          </div>
        </header>

        <div class="ng-review-source-bar">
          <span>右侧影像来源</span>
          <button type="button" :class="{ active: sourceMode === 'flight' }" :aria-disabled="readonly" :data-permission-tip="readonly ? '无权限操作' : ''" @click="!readonly && (sourceMode = 'flight')">选择近期飞行影像</button>
          <button type="button" :class="{ active: sourceMode === 'upload' }" :aria-disabled="readonly" :data-permission-tip="readonly ? '无权限操作' : ''" @click="selectUploadMode(readonly)">上传区域影像截图</button>
          <select v-if="sourceMode === 'flight'" v-model="selectedFlightId" :disabled="readonly" aria-label="近期飞行任务" @change="selectFlight">
            <option v-for="flight in recentFlights" :key="flight.id" :value="flight.id">{{ flight.name }} · {{ flight.time }}</option>
          </select>
          <button v-else type="button" class="ng-review-file-name" :aria-disabled="readonly" :data-permission-tip="readonly ? '无权限操作' : ''" @click="openFilePicker(readonly)">
            {{ uploadName || '点击选择 JPG / PNG 影像' }}
          </button>
          <input ref="fileInput" class="ng-file-input" type="file" accept="image/jpeg,image/png,image/webp" @change="handleFile">
        </div>

        <div v-if="compareMode === 'side'" class="ng-review-side-by-side">
          <article>
            <header><b>整改前问题图斑</b><span>问题发现 · 2026-09-22</span></header>
            <DroneReviewImageryMap mode="reference" label="历史问题图斑 · 红色边界" />
          </article>
          <article>
            <header><b>本次复核材料</b><span>{{ reviewSourceLabel }}</span></header>
            <DroneReviewImageryMap
              v-model:coordinates="reviewCoordinates"
              mode="draw"
              :source-index="reviewSourceIndex"
              :image-url="reviewImageUrl"
              :readonly="readonly"
              :label="reviewSourceLabel"
              @update:coordinates="updateCoordinates"
              @complete="finishDrawing"
            />
          </article>
        </div>

        <div v-else class="ng-review-swipe-wrap">
          <DroneReviewImageryMap
            v-model:coordinates="reviewCoordinates"
            mode="swipe"
            :source-index="reviewSourceIndex"
            :image-url="reviewImageUrl"
            :swipe-position="swipePosition"
            :readonly="readonly"
            label="卷帘对比 · 左侧复核影像 / 右侧问题图斑"
            @update:coordinates="updateCoordinates"
            @complete="finishDrawing"
          />
          <div class="ng-review-swipe-line" :style="{ left: `${swipePosition}%` }"><i>↔</i></div>
          <input v-model.number="swipePosition" type="range" min="5" max="95" aria-label="拖动复核影像卷帘对比位置">
          <span class="ng-review-swipe-label before">复核影像</span>
          <span class="ng-review-swipe-label after">问题图斑</span>
        </div>

        <footer class="ng-review-legend">
          <span><i class="issue" />整改前问题边界</span>
          <span><i class="recovered" />本次手工勾画整改区域</span>
          <em>在右侧地图点击“开始勾画”，依次落点，至少 3 个点后完成绘制</em>
        </footer>
      </section>

      <section class="ng-card span-4 ng-stage-card ng-review-form-card">
        <h3><i>填</i>复核结果填报</h3>
        <div class="ng-record-bar"><span>任务编号<b>{{ context.task.taskNo }}</b></span><span>当前图斑<b>图斑1</b></span><span>复核人<b>无人机复核员01</b></span><span>复核日期<b>2026-10-21</b></span></div>
        <div class="ng-decision cols-2">
          <label><input v-model="conclusion" type="radio" value="pass" :disabled="readonly"> 完成治理</label>
          <label><input v-model="conclusion" type="radio" value="reject" :disabled="readonly"> 整改不到位</label>
        </div>

        <div class="ng-drawing-result" :class="{ complete: drawingSaved }">
          <span>整改区域勾画</span>
          <b>{{ drawingSaved ? '已完成' : reviewCoordinates.length >= 3 ? '待确认完成' : '尚未完成' }}</b>
          <small>{{ reviewCoordinates.length }} 个边界点 · 影像来源：{{ sourceMode === 'flight' ? '近期飞行任务' : '本地上传' }}</small>
        </div>

        <div class="ng-form mt-14">
          <label class="ng-field wide"><span>复耕信息 *</span><textarea v-model="recovery" :disabled="readonly" /></label>
          <label class="ng-field wide"><span>复核说明 *</span><textarea v-model="note" :disabled="readonly" /></label>
        </div>

        <div class="ng-info-box ng-review-tip">
          <h4>提交要求</h4>
          <p>需选择一份复核影像，并在地图上勾画本次已经整改完成的区域。当前为演示数据，上传与勾画结果保留在本页面。</p>
        </div>

        <div class="ng-actions">
          <button class="danger" :aria-disabled="readonly" :data-permission-tip="readonly ? '无权限操作' : ''" @click="!readonly && emit('reject')">返回整改</button>
          <button class="primary" :aria-disabled="readonly" :data-permission-tip="readonly ? '无权限操作' : ''" @click="!readonly && (conclusion === 'pass' ? emit('pass') : emit('reject'))">确认复核</button>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.ng-review-material-card { overflow: hidden; }
.ng-review-head { flex: 0 0 auto; align-items: center; }
.ng-review-head h3 small { margin-left: 4px; }
.ng-review-source-bar { flex: 0 0 auto; min-height: 34px; margin: 2px 0 8px; padding: 5px 7px; display: flex; align-items: center; gap: 5px; background: #f3f8fc; border: 1px solid #dce8ef; border-radius: 6px; }
.ng-review-source-bar > span { color: #5c7588; font-size: 10px; font-weight: 700; white-space: nowrap; }
.ng-review-source-bar button,.ng-review-source-bar select { height: 27px; color: #486b81; background: #fff; border: 1px solid #cbdce7; border-radius: 4px; font-size: 10px; }
.ng-review-source-bar button { padding: 0 8px; cursor: pointer; }.ng-review-source-bar button.active { color: #fff; background: #1687ef; border-color: #1687ef; }
.ng-review-source-bar select,.ng-review-file-name { min-width: 0; flex: 1; padding: 0 7px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ng-review-source-bar [aria-disabled='true'] { color: #91a0aa; background: #edf1f3; cursor: not-allowed; }
.ng-review-side-by-side { min-height: 0; flex: 1; display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 8px; }
.ng-review-side-by-side article { min-width: 0; min-height: 0; display: flex; flex-direction: column; }
.ng-review-side-by-side article > header { flex: 0 0 auto; margin-bottom: 5px; display: flex; justify-content: space-between; gap: 7px; color: #294c63; font-size: 11px; }
.ng-review-side-by-side article > header span { min-width: 0; overflow: hidden; color: #7b8f9e; font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
.ng-review-side-by-side article > :deep(.review-imagery-map) { flex: 1; min-height: 0; }
.ng-review-swipe-wrap { position: relative; min-height: 0; flex: 1; }
.ng-review-swipe-wrap > :deep(.review-imagery-map) { height: 100%; min-height: 0; }
.ng-review-swipe-wrap > input[type='range'] { position: absolute; z-index: 520; left: 0; right: 0; top: calc(50% - 22px); width: 100%; height: 44px; margin: 0; opacity: 0; cursor: ew-resize; }
.ng-review-swipe-line { position: absolute; z-index: 518; top: 0; bottom: 0; width: 2px; background: #fff; box-shadow: 0 0 7px #001c2c; pointer-events: none; }
.ng-review-swipe-line i { position: absolute; top: 50%; left: 50%; width: 32px; height: 32px; display: grid; place-items: center; color: #fff; background: #1687ef; border: 2px solid #fff; border-radius: 50%; font-style: normal; transform: translate(-50%,-50%); }
.ng-review-swipe-label { position: absolute; z-index: 519; top: 43px; padding: 4px 7px; color: #fff; background: #092f48d9; border-radius: 3px; font-size: 9px; pointer-events: none; }.ng-review-swipe-label.before { left: 9px; }.ng-review-swipe-label.after { right: 9px; }
.ng-review-legend { flex: 0 0 auto; min-height: 25px; padding-top: 7px; display: flex; align-items: center; gap: 13px; color: #5d7789; font-size: 9px; }
.ng-review-legend span { display: flex; align-items: center; gap: 5px; white-space: nowrap; }.ng-review-legend i { width: 18px; height: 0; border-top: 3px dashed #ff3849; }.ng-review-legend i.recovered { border-top-style: solid; border-top-color: #16c985; }.ng-review-legend em { margin-left: auto; color: #7d91a0; font-style: normal; text-align: right; }
.ng-review-form-card .ng-record-bar { grid-template-columns: repeat(2,minmax(0,1fr)); }
.ng-drawing-result { margin-top: 8px; padding: 8px 10px; display: grid; grid-template-columns: 1fr auto; background: #fff8e9; border: 1px solid #f0dcaa; border-radius: 5px; }.ng-drawing-result.complete { background: #ebfaf4; border-color: #afe4ce; }.ng-drawing-result span { color: #6f8190; font-size: 10px; }.ng-drawing-result b { color: #ad741f; font-size: 11px; }.ng-drawing-result.complete b { color: #10835a; }.ng-drawing-result small { grid-column: 1 / -1; margin-top: 3px; color: #7c8f9d; font-size: 9px; }
.ng-review-tip { margin-top: 8px; }.ng-review-tip p { line-height: 1.45; }
@media (max-width: 1100px) {
  .ng-review-source-bar > span { display: none; }
  .ng-review-source-bar button { padding-inline: 5px; }
  .ng-review-legend em { display: none; }
}
</style>
