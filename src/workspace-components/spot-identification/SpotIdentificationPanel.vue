<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { PortalTask, WorkspaceNodeConfig } from '@/types'
import { getTaskAbnormalPage } from '@/api/governance-task'
import type { TaskAbnormal } from '@/api/governance-task'
import { getTaskEvidenceImages } from '@/api/governance-result'
import type { TaskEvidenceImage } from '@/api/governance-result'
import SpotDistributionMap from './SpotDistributionMap.vue'
import type { ComparisonPeriod } from './SpotDistributionMap.vue'

const props = defineProps<{ task?: PortalTask; sceneName?: string; node?: WorkspaceNodeConfig }>()
const keyword = ref('')
const abnormalType = ref('')
const handleStatus = ref<number | ''>('')
const activeId = ref('')
const periods = ref(2)
const loading = ref(false)
const loadError = ref('')
const records = ref<TaskAbnormal[]>([])
const evidenceImages = ref<TaskEvidenceImage[]>([])
const activeImageIndex = ref(0)
const uploadInput = ref<HTMLInputElement>()
const hiddenImageIds = ref<string[]>([])
const pendingDeleteImage = ref<RelatedImagery>()
let requestVersion = 0

const typeOptions = computed(() => [...new Map(records.value.map((item) => [item.abnormalType, item.abnormalTypeDesc])).entries()])
const filtered = computed(() => records.value.filter((item) => {
  const matchKeyword = !keyword.value.trim() || `${item.id} ${item.title} ${item.description} ${item.abnormalTypeDesc}`.toLowerCase().includes(keyword.value.trim().toLowerCase())
  return matchKeyword
    && (!abnormalType.value || item.abnormalType === abnormalType.value)
    && (handleStatus.value === '' || item.handleStatus === handleStatus.value)
}))
const active = computed(() => filtered.value.find((item) => item.id === activeId.value) || filtered.value[0])

type RelatedImagery = { id: string; label: string; url?: string; date?: string; local?: boolean }
const manualImagery = ref<RelatedImagery[]>([])
const relatedImagery = computed<RelatedImagery[]>(() => {
  const spot = active.value
  if (!spot) return manualImagery.value
  const media = spot.imageMediaId ? evidenceImages.value.find((item) => item.id === spot.imageMediaId) : undefined
  const url = spot.imageUrl || media?.originalUrl || media?.imageUrl || media?.thumbnailUrl
  if (!url && !spot.imageMediaId) return manualImagery.value
  return [{
    id: spot.imageMediaId || `abnormal-${spot.id}`,
    label: media?.fileName || '异常图斑关联影像',
    url,
    date: media?.shootTime || spot.foundTime,
  }, ...manualImagery.value]
})
const displayableImagery = computed(() => relatedImagery.value.filter((item) => Boolean(item.url) && !hiddenImageIds.value.includes(item.id)))
const domThumbnailPeriod: ComparisonPeriod = { number: 1, label: 'DOM 基准地图', kind: 'dom' }
const comparisonPeriods = computed<ComparisonPeriod[]>(() => {
  const images = displayableImagery.value
  return Array.from({ length: periods.value }, (_, index) => {
    if (index === 0) return { number: 1, label: 'DOM 基准地图', kind: 'dom' }
    const image = images[activeImageIndex.value + index - 1]
    if (!image) return { number: index + 1, label: '暂无多期影像', kind: 'empty' }
    return { number: index + 1, label: image.label, kind: 'image', imageUrl: image.url }
  })
})

function statusLabel(value: number) {
  return ({ 0: '待核查', 1: '核查中', 2: '已处置', 3: '已销号' } as Record<number, string>)[value] || '未处理'
}
function levelLabel(value: number) {
  return ({ 1: '一般', 2: '较重', 3: '严重' } as Record<number, string>)[value] || `等级 ${value}`
}
function formatTime(value?: string) {
  return value ? value.replace('T', ' ').slice(0, 16) : '-'
}
function selectSpot(id: string) {
  activeId.value = id
  activeImageIndex.value = 0
}
function selectImage(index: number) {
  activeImageIndex.value = index
}
function openImageUpload() {
  uploadInput.value?.click()
}
function clearManualImagery() {
  manualImagery.value.forEach((image) => {
    if (image.local && image.url) URL.revokeObjectURL(image.url)
  })
  manualImagery.value = []
}
function addLocalImagery(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files || []).filter((file) => file.type.startsWith('image/'))
  if (!files.length) return
  manualImagery.value.push(...files.map((file) => ({
    id: `local-${crypto.randomUUID()}`,
    label: `本地上传 · ${file.name}`,
    url: URL.createObjectURL(file),
    date: new Date().toISOString(),
    local: true,
  })))
  activeImageIndex.value = Math.max(0, relatedImagery.value.length - files.length)
  input.value = ''
}
function requestImageDelete(image: RelatedImagery) {
  pendingDeleteImage.value = image
}
function confirmImageDelete() {
  const image = pendingDeleteImage.value
  if (!image) return
  if (image.local) {
    if (image.url) URL.revokeObjectURL(image.url)
    manualImagery.value = manualImagery.value.filter((item) => item.id !== image.id)
  } else if (!hiddenImageIds.value.includes(image.id)) {
    hiddenImageIds.value.push(image.id)
  }
  pendingDeleteImage.value = undefined
  activeImageIndex.value = 0
}

async function loadTaskAbnormals(taskId?: string) {
  const version = ++requestVersion
  records.value = []
  evidenceImages.value = []
  activeId.value = ''
  activeImageIndex.value = 0
  loadError.value = ''
  if (!taskId) return
  loading.value = true
  try {
    // 后端可能对 pageSize 设置上限，因此按首屏实际返回条数继续读取所有页。
    const first = await getTaskAbnormalPage({ bizTaskId: taskId, pageNum: 1, pageSize: 100 })
    const allRecords = [...first.records]
    const actualPageSize = Math.max(1, first.records.length || first.pageSize || 100)
    const pageCount = Math.ceil(first.total / actualPageSize)
    for (let pageNum = 2; pageNum <= pageCount; pageNum += 1) {
      const page = await getTaskAbnormalPage({ bizTaskId: taskId, pageNum, pageSize: 100 })
      allRecords.push(...page.records)
    }
    const images = await getTaskEvidenceImages(taskId).catch(() => [])
    if (version !== requestVersion) return
    records.value = allRecords
    evidenceImages.value = images
    activeId.value = allRecords[0]?.id || ''
  } catch (error) {
    if (version !== requestVersion) return
    loadError.value = error instanceof Error ? error.message : '异常图斑加载失败。'
  } finally {
    if (version === requestVersion) loading.value = false
  }
}

watch(() => props.task?.id, (taskId) => {
  clearManualImagery()
  hiddenImageIds.value = []
  pendingDeleteImage.value = undefined
  void loadTaskAbnormals(taskId)
}, { immediate: true })
watch(filtered, (items) => {
  if (!items.some((item) => item.id === activeId.value)) {
    activeId.value = items[0]?.id || ''
    activeImageIndex.value = 0
  }
})
onBeforeUnmount(clearManualImagery)
</script>

<template>
  <div class="governance-page spot-page">
    <aside class="panel spot-list">
      <div class="panel-title"><span>问题图斑列表</span><small>{{ filtered.length }} / {{ records.length }} 处</small></div>
      <div class="filters">
        <input v-model="keyword" placeholder="搜索图斑编号、名称或类型" />
        <select v-model="abnormalType"><option value="">全部类型</option><option v-for="[value, label] in typeOptions" :key="value" :value="value">{{ label }}</option></select>
        <select v-model="handleStatus"><option value="">全部处置状态</option><option :value="0">待核查</option><option :value="1">核查中</option><option :value="2">已处置</option><option :value="3">已销号</option></select>
      </div>
      <div class="spot-scroll">
        <button v-for="(item, index) in filtered" :key="item.id" class="spot-item" :class="{ active: item.id === active?.id }" @click="selectSpot(item.id)">
          <i>{{ index + 1 }}</i>
          <span><b>{{ item.title }}</b><small>图斑 #{{ item.id }} · {{ item.abnormalTypeDesc }}</small></span>
          <em :class="`status-${item.handleStatus}`">{{ statusLabel(item.handleStatus) }}</em>
        </button>
        <div v-if="loading" class="list-empty">正在加载当前任务异常图斑…</div>
        <div v-else-if="loadError" class="list-empty list-empty--error">{{ loadError }}</div>
        <div v-else-if="!filtered.length" class="list-empty">当前筛选条件下暂无异常图斑</div>
      </div>
    </aside>

    <section class="center-column">
      <div class="panel map-panel">
        <div class="panel-title"><span>问题图斑分布</span></div>
        <div v-if="active" class="map-compare" :class="`compare-${periods}`">
          <SpotDistributionMap
            v-for="period in comparisonPeriods"
            :key="`${active.id}-${period.number}-${period.imageUrl || period.kind}`"
            :spot="active"
            :period="period"
            @select="selectSpot"
          />
        </div>
        <div v-else class="map-empty">{{ loading ? '正在加载图斑地图…' : '请选择当前任务中的异常图斑' }}</div>
      </div>

      <div class="panel analysis">
        <div class="panel-title"><span>多期影像 / 变化分析</span><small>点选下方关联影像可切换第 2 期开始的对比影像</small></div>
        <div class="periods">
          <button v-for="n in [2, 3, 4]" :key="n" :class="{ active: periods === n }" @click="periods = n">{{ n }} 期影像</button>
          <span>当前对比：{{ active?.title || '未选择图斑' }}</span>
        </div>
        <div class="imagery">
          <input ref="uploadInput" class="imagery-upload-input" type="file" accept="image/*" multiple @change="addLocalImagery" />
          <div class="image-card image-card--dom" role="button" tabindex="0" @click="activeImageIndex = 0" @keydown.enter="activeImageIndex = 0">
            <div class="image-card__dom-caption"><b>第 1 期 · DOM 基准地图</b></div>
            <SpotDistributionMap v-if="active" class="image-card__dom-thumbnail" :spot="active" :period="domThumbnailPeriod" thumbnail />
            <span v-else>暂无图斑范围缩略图</span>
          </div>
          <button v-for="(image, index) in displayableImagery" :key="image.id" class="image-card" :class="{ active: activeImageIndex === index }" @click="selectImage(index)">
            <img v-if="image.url" :src="image.url" :alt="image.label" />
            <b>关联影像 {{ index + 1 }}</b><small>{{ image.label }} · {{ formatTime(image.date) }}</small>
            <span class="image-card__delete" role="button" tabindex="0" aria-label="删除关联影像" title="删除关联影像" @click.stop="requestImageDelete(image)" @keydown.enter.stop="requestImageDelete(image)">×</span>
          </button>
          <button class="image-card image-card--add" type="button" @click="openImageUpload"><i>＋</i><b>添加影像</b><small>从本地选择图斑不同时期影像</small></button>
        </div>
      </div>
    </section>

    <aside class="right-column">
      <div class="panel detail">
        <div class="panel-title">异常图斑详细信息</div>
        <template v-if="active">
          <dl>
            <dt>图斑编号</dt><dd>#{{ active.id }}</dd>
            <dt>异常类型</dt><dd>{{ active.abnormalTypeDesc }}</dd>
            <dt>异常等级</dt><dd :class="`text-level-${active.abnormalLevel}`">{{ levelLabel(active.abnormalLevel) }}</dd>
            <dt>面积</dt><dd>{{ active.area ?? '-' }} ㎡</dd>
            <dt>处置状态</dt><dd>{{ statusLabel(active.handleStatus) }}</dd>
            <dt>发现时间</dt><dd>{{ formatTime(active.foundTime) }}</dd>
            <dt>关联影像</dt><dd>{{ relatedImagery.length ? `${relatedImagery.length} 张` : '未关联' }}</dd>
          </dl>
          <p>{{ active.description || '暂无异常图斑描述。' }}</p>
        </template>
        <div v-else class="detail-empty">暂无图斑信息</div>
      </div>
      <div class="panel explain">
        <div class="panel-title">影像对比说明</div>
        <p>DOM 基准地图仅显示在第 1 个窗口。后续窗口只显示关联影像；未关联或影像不足时显示灰色底图。</p>
        <p>各期关联影像可在其窗口中独立缩放、平移，不与基准影像同步。</p>
      </div>
    </aside>
    <div v-if="pendingDeleteImage" class="image-delete-mask" @click.self="pendingDeleteImage = undefined">
      <section class="image-delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby="image-delete-title">
        <h3 id="image-delete-title">确认删除关联影像</h3>
        <p>确定删除“{{ pendingDeleteImage.label }}”吗？删除后将不再参与当前图斑的影像对比。</p>
        <footer><button @click="pendingDeleteImage = undefined">取消</button><button class="danger" @click="confirmImageDelete">确认删除</button></footer>
      </section>
    </div>
  </div>
</template>

<style scoped lang="scss">
.governance-page { height: 100%; min-height: 0; display: grid; grid-template-columns: 300px minmax(0, 1fr) 330px; gap: 10px; padding: 10px; background: #e8eef3; color: #29475a; }
.panel { min-height: 0; overflow: hidden; background: #fff; border: 1px solid #cbdbe5; border-radius: 7px; box-shadow: 0 2px 9px #1c3b5214; }
.panel-title { height: 42px; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 0 13px; border-bottom: 1px solid #e1ebf1; color: #173c54; font-size: 15px; font-weight: 700; }.panel-title small { color: #6c8595; font-size: 12px; font-weight: 500; }
.spot-list { display: flex; flex-direction: column; }.filters { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 10px; border-bottom: 1px solid #e8eff3; }.filters input { grid-column: 1 / -1; }.filters input,.filters select { min-width: 0; height: 34px; padding: 0 9px; color: #38586a; background: #fbfdfe; border: 1px solid #c9dce7; border-radius: 4px; font-size: 12px; outline: none; }.filters input:focus,.filters select:focus { border-color: #1a9ac0; box-shadow: 0 0 0 2px #1a9ac01c; }
.spot-scroll { min-height: 0; overflow: auto; }.spot-item { width: 100%; display: grid; grid-template-columns: 31px minmax(0,1fr) auto; gap: 9px; align-items: center; padding: 11px 10px; border: 0; border-bottom: 1px solid #e8eef2; background: #fff; color: #29475a; text-align: left; cursor: pointer; transition: background .15s; }.spot-item:hover { background: #f2f9fc; }.spot-item.active { background: #e5f5fb; border-left: 4px solid #129bc3; padding-left: 6px; }.spot-item>i { display: grid; width: 28px; height: 28px; place-items: center; color: #ffffff; background: #3e91b1; border-radius: 50%; font-style: normal; font-size: 13px; font-weight: 700; }.spot-item>i.level-2 { background: #d79228; }.spot-item>i.level-3 { background: #d55762; }.spot-item b,.spot-item small { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }.spot-item b { color:#1d435b; font-size:14px; }.spot-item small { margin-top:4px;color:#6f8796;font-size:11px; }.spot-item em { padding:4px 6px;border-radius:3px;font-style:normal;font-size:11px;white-space:nowrap; }.status-0 { color:#9a680f;background:#fff3d9; }.status-1 { color:#1b79a2;background:#e2f3fa; }.status-2 { color:#21875e;background:#e3f6ed; }.status-3 { color:#667986;background:#ecf0f2; }.list-empty { display:grid; min-height:150px; place-items:center; padding:16px; color:#6f8796; font-size:13px; text-align:center; }.list-empty--error { color:#c7535e; }
.center-column { min-width: 0; display: grid; grid-template-rows: minmax(360px, 1fr) 202px; gap: 10px; }.map-panel { display:flex; flex-direction:column; }.map-compare { flex:1; min-height:0; display:grid; gap:4px; padding:4px; background:#c9d8df; }.map-compare.compare-2,.map-compare.compare-3 { grid-template-columns:repeat(var(--period-count),minmax(0,1fr)); }.map-compare.compare-2 { --period-count:2; }.map-compare.compare-3 { --period-count:3; }.map-compare.compare-4 { grid-template-columns:repeat(2,minmax(0,1fr)); grid-template-rows:repeat(2,minmax(0,1fr)); }.map-compare :deep(.spot-map) { min-width:0; min-height:0; border:1px solid #adc6d2; }.map-empty { display:grid; flex:1; place-items:center; color:#6b8493; background:#eef3f5; font-size:14px; }
.analysis { display:flex; flex-direction:column; }.periods { display:flex; align-items:center; gap:7px; padding:9px 11px 7px; }.periods button { padding:7px 11px; color:#426478; background:#f5f9fb; border:1px solid #cbdde7; border-radius:4px; font-size:12px; cursor:pointer; }.periods button.active { color:#fff; background:#168db5; border-color:#168db5; box-shadow:0 2px 5px #168db544; }.periods span { margin-left:auto; overflow:hidden; color:#6f8796; font-size:12px; text-overflow:ellipsis; white-space:nowrap; }.imagery { flex:1; min-height:0; display:flex; gap:8px; padding:0 11px 11px; overflow-x:auto; }.image-card { position:relative; flex:0 0 180px; height:112px; overflow:hidden; padding:9px; color:#f4fcff; background:linear-gradient(135deg,#276c80,#17445b); border:1px solid transparent; border-radius:5px; text-align:left; cursor:pointer; }.image-card:hover,.image-card.active { border-color:#13a9d3; box-shadow:0 0 0 2px #13a9d325; }.image-card--dom { background:linear-gradient(145deg,#1f6372,#78a668); }.image-card--dom:focus-visible { outline:2px solid #13a9d3; outline-offset:2px; }.image-card__dom-thumbnail { position:absolute; inset:0; display:block; pointer-events:none; }.image-card>img { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; opacity:.66; }.image-card>span { display:grid; height:100%; place-items:center; color:#d5e1e6; background:#53616a; font-size:12px; }.image-card b,.image-card small { position:relative; z-index:1; display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; text-shadow:0 1px 2px #002030; }.image-card b { margin-top:48px; font-size:13px; }.image-card small { margin-top:4px; font-size:11px; }.image-card.unavailable { cursor:not-allowed; opacity:.7; }.imagery-empty { display:grid; min-width:260px; place-items:center; padding:0 16px; color:#728796; background:#f3f6f8; border:1px dashed #c4d3db; border-radius:5px; font-size:12px; line-height:1.6; }
.imagery-upload-input { display:none; }.image-card--add { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:3px; color:#377b95; background:#f4fafc; border:1px dashed #69aec4; text-align:center; }.image-card--add:hover { color:#0b86ae; background:#e9f7fb; border-color:#159bc4; }.image-card--add i { width:30px; height:30px; display:grid; place-items:center; border:1px solid currentColor; border-radius:50%; font-size:22px; font-style:normal; line-height:1; }.image-card--add b { margin:4px 0 0; color:currentColor; text-shadow:none; }.image-card--add small { color:#6d92a2; text-shadow:none; }
.image-card--dom { display:block; padding:0; }.image-card__dom-caption { position:absolute; z-index:10; top:5px; left:6px; right:6px; min-width:0; padding:0; color:#fff; background:transparent; border:0; pointer-events:none; }.image-card__dom-caption b { display:block; overflow:hidden; margin:0; color:currentColor; font-size:13px; font-weight:700; text-overflow:ellipsis; white-space:nowrap; text-shadow:0 1px 2px #002030; }.image-card--dom .image-card__dom-thumbnail { position:absolute; z-index:0; inset:0; min-width:0; min-height:0; width:100%; height:100%; overflow:hidden; pointer-events:none; }
.image-card > .image-card__delete { position:absolute; z-index:3; top:5px; right:5px; width:14px; height:14px; min-height:14px; padding:0; display:grid; place-items:center; color:#fff; background:#d64755; border:1px solid #fff8; border-radius:50%; box-shadow:0 1px 3px #3e1420aa; font-size:12px; font-weight:400; line-height:1; text-shadow:none; }.image-card > .image-card__delete:hover,.image-card > .image-card__delete:focus-visible { background:#b92739; outline:2px solid #ffd2d7; outline-offset:1px; }
.image-delete-mask { position:fixed; z-index:3100; inset:0; display:grid; place-items:center; padding:20px; background:#10243180; }.image-delete-dialog { width:min(390px,calc(100vw - 40px)); overflow:hidden; color:#29475a; background:#fff; border:1px solid #b9d1dc; border-radius:7px; box-shadow:0 12px 32px #102a3d66; }.image-delete-dialog h3 { margin:0; padding:15px 18px; color:#203f53; border-bottom:1px solid #e0eaef; font-size:17px; }.image-delete-dialog p { margin:0; padding:18px; color:#5c7481; font-size:14px; line-height:1.7; }.image-delete-dialog footer { display:flex; justify-content:flex-end; gap:8px; padding:11px 18px; background:#f5f8fa; border-top:1px solid #e1ebef; }.image-delete-dialog button { min-width:76px; padding:7px 12px; color:#466877; background:#fff; border:1px solid #bfd4df; border-radius:4px; cursor:pointer; }.image-delete-dialog button.danger { color:#fff; background:#cf4655; border-color:#cf4655; }.image-delete-dialog button.danger:hover { background:#b92e40; }
.right-column { min-height:0; display:grid; grid-template-rows:minmax(0,1fr) auto; gap:10px; }.detail { min-height:0; }.detail dl { display:grid; grid-template-columns:94px 1fr; margin:0; padding:9px 13px; }.detail dt,.detail dd { margin:0; padding:8px 0; border-bottom:1px solid #edf2f5; font-size:12px; }.detail dt { color:#718895; }.detail dd { color:#29485a; font-weight:700; text-align:right; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }.text-level-2 { color:#bd7a18!important; }.text-level-3 { color:#c94856!important; }.detail p,.explain p { margin:0 13px 11px; padding:10px; color:#607987; background:#f3f7f9; font-size:12px; line-height:1.7; }.detail-empty { display:grid; min-height:160px; place-items:center; color:#728796; font-size:13px; }.explain p + p { margin-top:-3px; }
@media (max-width: 1180px) {
  .governance-page { grid-template-columns: clamp(215px, 23vw, 270px) minmax(400px, 1fr) clamp(235px, 24vw, 280px); gap: 7px; padding: 7px; }
  .center-column { grid-template-rows: minmax(300px,1fr) 180px; gap: 7px; }.right-column { gap: 7px; }.filters { padding: 7px; }
}
</style>
