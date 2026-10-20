<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { getFlightReviewVideoSrtFile, type FlightReviewMedia } from '@/api/flight-review'
import { decodeVideoSrt, formatTelemetryCoordinates } from '@/utils/video-telemetry'
import { formatSrtTime, inspectSrt, srtAltitudePath, srtField, type SrtDocument } from '@/utils/srt-inspector'

const props = defineProps<{ planName: string; media: FlightReviewMedia[]; initialId: string }>()
const emit = defineEmits<{ close: [] }>()
const dialog = ref<HTMLElement>()
const closeButton = ref<HTMLButtonElement>()
const selectedId = ref(props.initialId)
const expanded = ref(false)
const tab = ref<'overview' | 'records' | 'raw'>('overview')
const busy = ref(false)
const error = ref('')
const raw = ref('')
const file = shallowRef<Blob>()
const srtDoc = shallowRef<SrtDocument>()
const searchInput = ref('')
const query = ref('')
const gpsFilter = ref('all')
const page = ref(1)
const pageSize = ref(25)
const selectedOrdinal = ref(0)
let requestVersion = 0
let controller: AbortController | undefined
let searchTimer: ReturnType<typeof setTimeout> | undefined
let downloadUrl = ''
let previousFocus: HTMLElement | null = null
const key = (item: FlightReviewMedia) => `${item.taskId}:${item.id}`
const activeMedia = computed(() => props.media.find(item => key(item) === selectedId.value) || props.media[0])
const data = computed(() => srtDoc.value)
const gpsRate = computed(() => data.value?.records.length ? Math.round(data.value.gpsCount / data.value.records.length * 1000) / 10 : 0)
const altitudePath = computed(() => data.value ? srtAltitudePath(data.value) : '')
const filtered = computed(() => (data.value?.records || []).filter(item => {
  if (gpsFilter.value === 'valid' && !item.point) return false
  if (gpsFilter.value === 'missing' && item.point) return false
  return !query.value || `${item.sequence} ${item.timeRange} ${item.text}`.toLowerCase().includes(query.value)
}))
const pageCount = computed(() => Math.max(1, Math.ceil(filtered.value.length / pageSize.value)))
const pageRecords = computed(() => filtered.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))
const selectedRecord = computed(() => data.value?.records[selectedOrdinal.value])
const fieldLabels: Record<string, string> = { latitude: '纬度', longitude: '经度', rel_alt: '相对高度', abs_alt: '绝对高度', iso: 'ISO 感光度', shutter: '快门', fnum: '光圈记录值', ev: '曝光补偿', ct: '色温记录值', focal_len: '焦距记录值', gb_yaw: '云台偏航', gb_pitch: '云台俯仰', gb_roll: '云台横滚', drone_yaw: '机身偏航', drone_pitch: '机身俯仰', drone_roll: '机身横滚' }
function sizeText(size?: number) { return size === undefined ? '—' : size < 1024 ? `${size} B` : size < 1024 * 1024 ? `${(size / 1024).toFixed(1)} KB` : `${(size / 1024 / 1024).toFixed(2)} MB` }
function altitude(value?: number) { return value === undefined ? '—' : `${value.toFixed(1)} m` }

async function load() {
  const version = ++requestVersion
  controller?.abort()
  if (downloadUrl) URL.revokeObjectURL(downloadUrl)
  downloadUrl = ''
  file.value = undefined
  srtDoc.value = undefined
  raw.value = ''
  error.value = ''
  page.value = 1
  selectedOrdinal.value = 0
  searchInput.value = ''
  query.value = ''
  gpsFilter.value = 'all'
  if (searchTimer) clearTimeout(searchTimer)
  if (!activeMedia.value) { busy.value = false; error.value = '当前计划没有可查看的录像。'; return }
  busy.value = true
  const request = new AbortController()
  controller = request
  try {
    const blob = await getFlightReviewVideoSrtFile(activeMedia.value.id, request.signal)
    const text = await decodeVideoSrt(blob)
    if (version !== requestVersion) return
    file.value = blob
    raw.value = text
    srtDoc.value = inspectSrt(text)
  } catch (reason) {
    if (version === requestVersion && !request.signal.aborted) error.value = reason instanceof Error ? reason.message : 'SRT 读取失败，请稍后重试。'
  } finally {
    if (version === requestVersion) busy.value = false
  }
}

function download() {
  if (!file.value) return
  if (!downloadUrl) downloadUrl = URL.createObjectURL(file.value)
  const link = document.createElement('a')
  link.href = downloadUrl
  link.download = (activeMedia.value?.fileName || 'video').replace(/\.[^.]+$/, '') + '.SRT'
  link.click()
}

function showRecords() { tab.value = 'records' }
function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); emit('close'); return }
  if (event.key !== 'Tab') return
  const elements = [...(dialog.value?.querySelectorAll<HTMLElement>('button:not(:disabled),select,input,textarea,[tabindex="0"]') || [])].filter(item => item.getClientRects().length)
  const first = elements[0], last = elements[elements.length - 1]
  if (!first || !last) return
  if (event.shiftKey && (document.activeElement === first || !dialog.value?.contains(document.activeElement))) { event.preventDefault(); last.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
}

watch(() => activeMedia.value ? key(activeMedia.value) : '', () => { void load() }, { immediate: true })
watch(searchInput, text => { if (searchTimer) clearTimeout(searchTimer); searchTimer = setTimeout(() => { query.value = text.trim().toLowerCase() }, 200) })
watch([query, gpsFilter, pageSize], () => { page.value = 1 })
watch(pageRecords, records => { if (records.length) selectedOrdinal.value = records[0]!.ordinal })
onMounted(async () => {
  previousFocus = document.activeElement as HTMLElement | null
  document.addEventListener('keydown', handleKeydown, true)
  await nextTick()
  closeButton.value?.focus()
})
onBeforeUnmount(() => {
  ++requestVersion
  controller?.abort()
  if (searchTimer) clearTimeout(searchTimer)
  if (downloadUrl) URL.revokeObjectURL(downloadUrl)
  document.removeEventListener('keydown', handleKeydown, true)
  previousFocus?.focus()
})
</script>

<template>
  <Teleport to="body">
    <div class="srt-backdrop" :class="{ 'is-expanded': expanded }" @click.self="emit('close')">
      <section ref="dialog" class="srt-dialog" role="dialog" aria-modal="true" aria-labelledby="srt-dialog-title" @keydown.stop>
        <header class="srt-header">
          <div class="srt-heading"><span class="srt-emblem" aria-hidden="true">SRT</span><div><span class="srt-eyebrow">FLIGHT TELEMETRY · 飞行遥测档案</span><h2 id="srt-dialog-title">SRT 信息</h2><p>{{ planName }}</p></div></div>
          <div class="srt-header-actions"><button type="button" :disabled="!file || busy" @click="download">↓ 下载原始 SRT</button><button type="button" :aria-label="expanded ? '还原 SRT 窗口' : '展开 SRT 窗口'" @click="expanded = !expanded">⛶</button><button ref="closeButton" type="button" aria-label="关闭 SRT 信息" @click="emit('close')">×</button></div>
        </header>
        <div class="srt-source-bar"><div><span class="source-dot" /><strong>数据源</strong><select v-model="selectedId" aria-label="选择视频的 SRT"><option v-for="item in media" :key="key(item)" :value="key(item)">{{ item.fileName }}</option></select></div></div>
        <nav class="srt-tabs" role="tablist" aria-label="SRT 信息视图"><button type="button" role="tab" :aria-selected="tab === 'overview'" @click="tab = 'overview'">数据总览</button><button type="button" role="tab" :aria-selected="tab === 'records'" @click="tab = 'records'">字幕记录 <span v-if="data">{{ data.records.length.toLocaleString() }}</span></button><button type="button" role="tab" :aria-selected="tab === 'raw'" @click="tab = 'raw'">原始全文</button></nav>
        <div v-if="busy" class="srt-state" role="status"><span class="srt-spinner" /><h3>正在读取飞行遥测</h3><p>读取当前视频的完整 SRT 文件…</p></div>
        <div v-else-if="error && !raw" class="srt-state is-error" role="status"><span class="state-symbol">!</span><h3>暂时无法读取 SRT</h3><p>{{ error }}</p><button type="button" @click="load">重新读取</button></div>
        <template v-else>
          <p v-if="error || (data && !data.records.length)" class="srt-notice">{{ error || '未识别到标准字幕时间记录，原始内容仍可完整查看。' }} <button type="button" @click="tab = 'raw'">查看原文</button></p>
          <div v-if="tab === 'overview'" class="srt-overview" role="tabpanel">
            <div class="srt-stat-grid">
              <article><span>字幕记录</span><strong>{{ data?.records.length.toLocaleString() || '—' }}<small> 条</small></strong><p>原始字幕时间区间，非视频帧率</p></article>
              <article><span>覆盖时长</span><strong>{{ data ? formatSrtTime(data.duration) : '—' }}</strong><p>{{ data?.validTimeCount.toLocaleString() || 0 }} 条有效时间记录</p></article>
              <article><span>有效 GPS 记录</span><strong>{{ data?.gpsCount.toLocaleString() || 0 }}<small> / {{ data?.records.length.toLocaleString() || 0 }}</small></strong><p>定位记录占比 {{ gpsRate }}%</p></article>
              <article><span>遥测字段</span><strong>{{ data?.fields.length || 0 }}<small> 项</small></strong><p>保留未知字段，不改写原始数值</p></article>
            </div>
            <div class="srt-overview-grid">
              <article class="srt-card srt-altitude-card"><div class="card-heading"><div><h3>相对高度趋势</h3></div></div><div v-if="altitudePath" class="altitude-chart"><div class="altitude-limits"><span>{{ altitude(data?.altitudeMax) }}</span><span>{{ altitude(data?.altitudeMin) }}</span></div><svg viewBox="0 0 800 130" preserveAspectRatio="none" role="img" aria-label="SRT 相对高度随时间变化趋势"><path d="M12 20H788M12 65H788M12 110H788" class="chart-grid" /><path :d="altitudePath" class="chart-line" /></svg><div class="chart-times"><span>开始</span><span>{{ data ? formatSrtTime(data.duration) : '—' }} / 覆盖时长</span></div></div><div v-else class="chart-empty">此文件未提供可绘制的相对高度</div><p class="card-caption">曲线仅抽稀绘制以保持流畅；完整记录可在明细中查看，缺失高度处不连线。</p></article>
              <article class="srt-card"><div class="card-heading"><div><h3>源文件信息</h3></div></div><dl class="source-details"><div><dt>视频文件</dt><dd>{{ activeMedia?.fileName || '—' }}</dd></div><div><dt>素材 ID</dt><dd>{{ activeMedia?.id || '—' }}</dd></div><div><dt>飞行任务 ID</dt><dd>{{ activeMedia?.taskId || '—' }}</dd></div><div><dt>SRT 文件大小</dt><dd>{{ sizeText(file?.size) }}</dd></div><div><dt>首条拍摄时间</dt><dd>{{ data?.records.find(item => item.recordedAt)?.recordedAt || '未提供' }}</dd></div></dl></article>
              <article class="srt-card"><div class="card-heading"><div><h3>数据完整性</h3></div><button type="button" class="srt-text-button" @click="showRecords">查看记录 →</button></div><div class="quality-line"><span>有效 GPS</span><strong>{{ gpsRate }}%</strong></div><div class="quality-bar"><i :style="{ width: `${gpsRate}%` }" /></div><div class="quality-counts"><span><i />有效定位 {{ data?.gpsCount || 0 }}</span><span><i />无有效定位 {{ (data?.records.length || 0) - (data?.gpsCount || 0) }}</span></div><p class="card-caption">无 GPS、异常时间及未知字段仍保留；有效定位比例不等同于飞行安全或测量精度评分。</p></article>
              <article class="srt-card"><div class="card-heading"><div><h3>文件包含的字段</h3></div></div><div class="field-tags"><span v-for="name in data?.fields" :key="name">{{ name }}</span><span v-if="!data?.fields.length" class="muted">未识别到标准键值字段，可查看原始全文</span></div><p class="card-caption">字段名称、单位与数值沿用原始 SRT，不擅自换算光圈、焦距等设备特有编码。</p></article>
            </div>
          </div>
          <div v-else-if="tab === 'records'" class="srt-records" role="tabpanel">
            <div class="records-toolbar"><label class="record-search">⌕ <input v-model="searchInput" placeholder="搜索记录编号、时间或任意字段内容" aria-label="搜索 SRT 记录" /></label><select v-model="gpsFilter" aria-label="筛选定位记录"><option value="all">全部记录</option><option value="valid">有效 GPS</option><option value="missing">无有效 GPS</option></select><span>匹配 {{ filtered.length.toLocaleString() }} 条</span></div>
            <div class="records-layout"><div class="records-table-area"><div class="records-table-scroll"><table><thead><tr><th>记录</th><th>起始 / 结束时间</th><th>经纬度</th><th>相对高度</th><th>ISO</th><th>定位</th></tr></thead><tbody><tr v-for="record in pageRecords" :key="record.ordinal" :class="{ 'is-selected': selectedRecord?.ordinal === record.ordinal }" tabindex="0" @click="selectedOrdinal = record.ordinal" @keydown.enter="selectedOrdinal = record.ordinal" @keydown.space.prevent="selectedOrdinal = record.ordinal"><td><b>#{{ record.sequence }}</b><small>第 {{ record.ordinal + 1 }} 条</small></td><td>{{ formatSrtTime(record.start, true) }}<small>{{ formatSrtTime(record.end, true) }} <em v-if="!record.validTime">时间异常</em></small></td><td>{{ formatTelemetryCoordinates(record.point) }}</td><td>{{ altitude(record.relativeAltitude) }}</td><td>{{ srtField(record, 'iso') }}</td><td><span class="gps-badge" :class="{ 'is-missing': !record.point }">{{ record.point ? '有效' : '缺失 / 无效' }}</span></td></tr><tr v-if="!pageRecords.length"><td colspan="6" class="empty-records">没有符合条件的记录</td></tr></tbody></table></div><div class="records-pagination"><span>{{ page }} / {{ pageCount }} 页</span><div><button type="button" :disabled="page === 1" @click="page--">上一页</button><button type="button" :disabled="page >= pageCount" @click="page++">下一页</button><select v-model.number="pageSize" aria-label="每页记录数"><option :value="25">25 条/页</option><option :value="50">50 条/页</option><option :value="100">100 条/页</option></select></div></div></div>
              <section class="record-inspector" aria-label="所选记录完整信息"><template v-if="selectedRecord && pageRecords.length"><div class="inspector-heading"><span class="section-kicker">RECORD INSPECTOR</span><h3>记录 #{{ selectedRecord.sequence }} <small>第 {{ selectedRecord.ordinal + 1 }} 条</small></h3><p>{{ selectedRecord.timeRange }}</p></div><p v-if="selectedRecord.recordedAt" class="record-date">拍摄时间 {{ selectedRecord.recordedAt }}</p><h4>全部识别字段 <span>{{ selectedRecord.fields.length }}</span></h4><dl class="record-field-grid"><div v-for="(item, index) in selectedRecord.fields" :key="index"><dt>{{ fieldLabels[item.name.toLowerCase()] || item.name }}<small>{{ item.name }}</small></dt><dd>{{ item.value || '—' }}</dd></div></dl><p v-if="!selectedRecord.fields.length" class="muted">该条未识别到键值字段，原始字幕保留如下。</p><h4>该条原始字幕</h4><pre>{{ selectedRecord.raw }}</pre></template><p v-else class="muted">选择一条记录查看完整信息</p></section>
            </div>
          </div>
          <div v-else class="srt-raw" role="tabpanel"><div><strong>原始 SRT 全文</strong><span>{{ raw.length.toLocaleString() }} 个字符 · 只读 · 不过滤内容</span></div><textarea :value="raw" readonly spellcheck="false" aria-label="SRT 原始全文" /></div>
        </template>
        <footer class="srt-footer"><span><i />{{ busy ? '正在读取' : error ? '读取异常' : '原始文件只读展示' }}</span><span>定位为录制时数据 · 缺失值以 — 显示 · Esc 关闭</span></footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.srt-backdrop{position:fixed;inset:0;z-index:1300;display:grid;place-items:center;padding:28px;background:#061b2cbf;backdrop-filter:blur(5px);font-family:"Microsoft YaHei",Arial,sans-serif}
.srt-dialog{width:min(1320px,100%);height:min(850px,calc(100dvh - 56px));display:flex;flex-direction:column;overflow:hidden;box-sizing:border-box;border:1px solid #cfdee6;border-radius:14px;background:#f3f7fa;color:#294c60;box-shadow:0 28px 100px #00131e70}
.srt-header{display:flex;align-items:center;justify-content:space-between;gap:16px;flex:none;padding:20px 24px;background:linear-gradient(110deg,#102f46,#15506a);color:#fff}
.srt-heading{display:flex;align-items:center;gap:15px;min-width:0}
.srt-emblem{display:grid;place-items:center;width:54px;height:54px;flex:none;border:1px solid #70d4e55c;border-radius:12px;background:linear-gradient(135deg,#2d9eb449,#37cabb13);color:#8fe9ed;font-size:15px;font-weight:800;letter-spacing:1px}
.srt-eyebrow{font-size:12px;letter-spacing:1.3px;color:#7ec8d9}
.srt-heading h2{margin:5px 0;font-size:23px;font-weight:650;letter-spacing:1px}
.srt-heading p{margin:0;color:#b1cbd7;font-size:14px;overflow-wrap:anywhere}
.srt-header-actions{display:flex;align-items:center;gap:8px;flex:none}
.srt-header-actions button{padding:8px 11px;border:1px solid #92b9cc4d;border-radius:6px;color:#deeff6;background:#ffffff0b;cursor:pointer;font-size:14px}
.srt-header-actions button:last-child{font-size:24px;line-height:20px}
.srt-header-actions button:hover{background:#ffffff20}
.srt-header-actions button:disabled{opacity:.4;cursor:default}
.srt-source-bar{display:flex;align-items:center;justify-content:space-between;gap:15px;flex:none;padding:12px 24px;border-bottom:1px solid #dce6ed;background:#fff;font-size:14px}
.srt-source-bar>div{display:flex;align-items:center;gap:9px;min-width:0}
.source-dot,.srt-footer i{width:6px;height:6px;display:inline-block;border-radius:50%;background:#20b7b5}
.srt-source-bar strong{white-space:nowrap}
.srt-source-bar select{min-width:200px;max-width:560px;width:40vw;padding:7px 10px;border:1px solid #d7e4ec;border-radius:6px;color:#315a70;background:#f4f9fc;font:inherit}
.srt-tabs{display:flex;gap:26px;flex:none;padding:0 24px;border-bottom:1px solid #dce6ed;background:#fff}
.srt-tabs button{position:relative;min-height:47px;padding:0 2px;border:0;color:#7a92a0;background:none;font-size:14px;cursor:pointer}
.srt-tabs button[aria-selected=true]{color:#138ba8;font-weight:700}
.srt-tabs button[aria-selected=true]::after{content:'';position:absolute;bottom:0;left:0;right:0;height:3px;border-radius:3px 3px 0 0;background:#15a3b8}
.srt-tabs button>span{margin-left:5px;padding:2px 5px;border-radius:4px;font-size:12px;background:#e9f4f7}
.srt-overview{flex:1;min-height:0;overflow:auto;padding:20px 24px}
.srt-stat-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:13px;margin-bottom:18px}
.srt-stat-grid article{padding:15px 17px;border:1px solid #dfebf0;border-radius:9px;background:#fff;box-shadow:0 3px 12px #163f5804}
.srt-stat-grid article>span{color:#8399a7;font-size:14px}
.srt-stat-grid strong{display:block;margin:9px 0 8px;color:#20546e;font-size:27px;font-variant-numeric:tabular-nums;line-height:1}
.srt-stat-grid small{color:#8aa5b4;font-size:14px;font-weight:400}
.srt-stat-grid p{margin:0;font-size:12px;color:#92a6b2}
.srt-overview-grid{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(0,1fr);gap:16px}
.srt-card{min-width:0;box-sizing:border-box;padding:18px;border:1px solid #dfebf0;border-radius:9px;background:#fff}
.card-heading{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:12px}
.section-kicker{font-size:12px;letter-spacing:1.3px;color:#8fa8b6}
.card-heading h3{margin:0;font-size:16px;color:#2c546b}
.altitude-chart{position:relative;padding-left:62px}
.altitude-chart svg{display:block;width:100%;height:130px}
.altitude-limits{position:absolute;inset:10px auto 20px 0;display:flex;flex-direction:column;justify-content:space-between;color:#8ba5b3;font-size:12px}
.chart-grid{fill:none;stroke:#e8eff4;stroke-dasharray:3 5}
.chart-line{fill:none;stroke:#19a9b4;stroke-width:2.5;stroke-linejoin:round;vector-effect:non-scaling-stroke}
.chart-times{display:flex;justify-content:space-between;color:#92a8b5;font-size:12px}
.card-caption{margin:13px 0 0;color:#91a5b1;font-size:12px;line-height:1.7}
.chart-empty{min-height:140px;display:grid;place-items:center;color:#9bafbb;font-size:14px;background:repeating-linear-gradient(0deg,transparent,transparent 34px,#f0f5f8 35px)}
.source-details{margin:0;display:grid;gap:11px;font-size:14px}
.source-details>div{display:grid;grid-template-columns:95px minmax(0,1fr);gap:10px}
.source-details dt{color:#8aa1af}
.source-details dd{margin:0;overflow-wrap:anywhere;color:#486b80;font-variant-numeric:tabular-nums}
.quality-line{display:flex;justify-content:space-between;margin:18px 0 10px;font-size:14px}
.quality-line strong{font-size:21px;color:#159aa7}
.quality-bar{height:8px;border-radius:8px;background:#edf3f6;overflow:hidden}
.quality-bar i{display:block;height:100%;background:linear-gradient(90deg,#168fbb,#41d0be);border-radius:8px}
.quality-counts{display:flex;gap:20px;margin-top:14px;font-size:12px;color:#7993a3}
.quality-counts i{display:inline-block;width:6px;height:6px;margin-right:5px;background:#22b6b8;border-radius:2px}
.quality-counts span:last-child i{background:#c6d5df}
.field-tags{display:flex;flex-wrap:wrap;gap:6px;max-height:120px;overflow:auto}
.field-tags>span{padding:4px 7px;border:1px solid #dcebf0;border-radius:4px;background:#f5fafc;color:#53798d;font:13px Consolas,monospace}
.srt-text-button{border:0;padding:0;color:#198fa8;background:none;font:14px inherit;cursor:pointer}
.srt-footer{display:flex;justify-content:space-between;gap:10px;flex:none;padding:12px 24px;border-top:1px solid #dce6ed;background:#fff;color:#8fa6b3;font-size:12px}
.srt-footer i{margin-right:6px}
.srt-state{flex:1;display:grid;align-content:center;justify-items:center;gap:10px;min-height:200px;color:#7893a4}
.srt-state h3{margin:5px 0 0;color:#315e75;font-size:17px}
.srt-state p{margin:0;max-width:500px;font-size:14px;line-height:1.8}
.srt-state button{padding:8px 17px;border:1px solid #a3d3df;border-radius:5px;color:#1589a5;background:#edf9fc;cursor:pointer}
.srt-spinner{width:30px;height:30px;border:3px solid #d8ebf1;border-top-color:#169bb5;border-radius:50%;animation:srt-spin .8s linear infinite}
.state-symbol{display:grid;place-items:center;width:36px;height:36px;border-radius:50%;color:#be8556;background:#fff0df;font-size:23px}
.srt-notice{flex:none;margin:0;padding:9px 24px;color:#a6793c;background:#fff7e6;font-size:14px}
.srt-notice button{padding:0;border:0;color:#168aa5;background:none;cursor:pointer}
.srt-records{display:flex;flex-direction:column;flex:1;min-height:0;padding:16px 24px;gap:12px}
.records-toolbar{display:flex;align-items:center;gap:10px;flex:none}
.record-search{display:flex;align-items:center;gap:8px;padding:0 11px;flex:1;height:35px;border:1px solid #d6e4eb;border-radius:6px;background:#fff;color:#7b9cac}
.record-search input{width:100%;height:100%;border:0;outline:0;color:#375c72;background:none;font-size:14px}
.records-toolbar>select,.records-pagination select{padding:8px;border:1px solid #d6e4eb;border-radius:5px;color:#52788c;background:#fff;font-size:14px}
.records-toolbar>span{color:#8ca3b1;font-size:14px;white-space:nowrap}
.records-layout{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(280px,1fr);gap:14px;flex:1;min-height:0}
.records-table-area{min-width:0;display:flex;flex-direction:column;overflow:hidden;border:1px solid #dce7ee;border-radius:8px;background:white}
.records-table-scroll{flex:1;overflow:auto;min-height:0}
.records-table-scroll table{width:100%;min-width:820px;border-collapse:collapse;font-size:12px;white-space:nowrap}
.records-table-scroll th{position:sticky;top:0;z-index:1;padding:13px 10px;color:#7896a6;background:#edf5f9;text-align:left;font-size:12px}
.records-table-scroll td{padding:11px 10px;border-top:1px solid #edf2f5;color:#55768b;font-variant-numeric:tabular-nums}
.records-table-scroll tr{cursor:pointer}
.records-table-scroll tr:hover,.records-table-scroll tr.is-selected{background:#edf9fb}
.records-table-scroll tr.is-selected td:first-child{box-shadow:inset 3px 0 #1da3b7}
.records-table-scroll td small{display:block;margin-top:4px;color:#97aeba;font-size:12px}
.records-table-scroll td em{color:#b9854c;font-style:normal}
.gps-badge{padding:3px 6px;border-radius:4px;color:#249b8d;background:#e9f8f0;font-size:12px}
.gps-badge.is-missing{color:#b49261;background:#faf2e5}
.records-pagination{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px;border-top:1px solid #dfe9ef;color:#8ca4b2;font-size:12px}
.records-pagination>div{display:flex;gap:6px}
.records-pagination button{padding:6px 8px;border:1px solid #d6e4eb;border-radius:4px;color:#50778d;background:#fff;font-size:12px;cursor:pointer}
.records-pagination button:disabled{opacity:.4;cursor:default}
.records-pagination select{padding:5px;font-size:12px}
.record-inspector{min-width:0;overflow:auto;padding:17px;border:1px solid #dce7ee;border-radius:8px;background:#fff}
.inspector-heading{padding-bottom:12px;border-bottom:1px solid #e7eef3}
.inspector-heading h3{margin:7px 0;color:#315e75;font-size:16px}
.inspector-heading h3 small{font-size:12px;font-weight:400;color:#9bb0bc}
.inspector-heading p,.record-date{margin:0;color:#8fa7b5;font-size:12px;line-height:1.8}
.record-date{margin-top:10px}
.record-inspector h4{display:flex;justify-content:space-between;margin:16px 0 10px;font-size:14px;color:#608397}
.record-inspector h4>span{color:#91adbc}
.record-field-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:0}
.record-field-grid>div{min-width:0;padding:9px;border-radius:5px;background:#f3f8fb}
.record-field-grid dt{font-size:12px;color:#7392a4;overflow-wrap:anywhere}
.record-field-grid dt small{display:block;margin-top:3px;color:#a3b5bf;font:12px Consolas,monospace}
.record-field-grid dd{margin:7px 0 0;color:#2d6078;font:14px Consolas,monospace;overflow-wrap:anywhere}
.record-inspector pre{margin:0;padding:12px;border:1px solid #e0ebf1;border-radius:5px;color:#54778b;background:#f5f9fb;white-space:pre-wrap;overflow-wrap:anywhere;font:13px/1.8 Consolas,monospace}
.muted{color:#99aeb9;font-size:14px;line-height:1.7}
.empty-records{text-align:center;padding:40px!important;color:#a1b4c0!important}
.srt-raw{display:flex;flex-direction:column;flex:1;min-height:0;padding:18px 24px;gap:12px}
.srt-raw>div{display:flex;justify-content:space-between;gap:15px;font-size:14px}
.srt-raw>div>span{color:#94aab7;font-size:12px}
.srt-raw textarea{box-sizing:border-box;resize:none;flex:1;min-height:0;width:100%;padding:18px;border:1px solid #d7e5ed;border-radius:8px;color:#4b7288;background:#fff;outline:none;white-space:pre;font:14px/1.85 Consolas,monospace;tab-size:2}
.is-expanded{padding:0}
.is-expanded .srt-dialog{width:100%;height:100dvh;border-radius:0}
@keyframes srt-spin{to{transform:rotate(360deg)}
}
@media(max-width:950px){.srt-backdrop{padding:12px}
.srt-dialog{height:calc(100dvh - 24px)}
.srt-header{padding:15px}
.srt-source-bar,.srt-tabs{padding-left:15px;padding-right:15px}
.srt-overview,.srt-records,.srt-raw{padding:15px}
.srt-stat-grid{grid-template-columns:1fr 1fr}
.srt-overview-grid{grid-template-columns:1fr}
.records-layout{grid-template-columns:minmax(0,1fr) 290px}
.srt-header-actions button:first-child{font-size:12px;padding:7px}
.srt-heading h2{font-size:19px}
}
@media(max-width:680px){.srt-eyebrow{font-size:12px;letter-spacing:.3px}
.srt-emblem{display:none}
.srt-heading p{max-width:200px}
.srt-header-actions{gap:3px}
.records-layout{display:flex;flex-direction:column;overflow:auto}
.records-table-area{min-height:300px;flex:none}
.records-table-scroll{max-height:320px}
.record-inspector{flex:none;overflow:visible}
.srt-records{overflow:hidden}
.srt-source-bar select{min-width:0;width:60vw}
.records-toolbar{flex-wrap:wrap}
.record-search{flex-basis:100%}
.srt-footer>span:last-child{display:none}
.srt-stat-grid{gap:8px}
.srt-stat-grid article{padding:12px}
.srt-stat-grid strong{font-size:23px}
.srt-tabs{gap:20px}
}
/* Hover backgrounds are dark globally; keep all SRT selectors legible. */
.srt-dialog select:not(:disabled):hover,.srt-dialog select:focus{color:#fff!important;background-color:#052c48!important}
.srt-dialog select option{color:#315a70;background:#fff}
.srt-source-bar>div{flex:1}
.srt-source-bar select{flex:1;min-width:0;width:100%;max-width:none;min-height:40px}
.srt-dialog{font-size:14px;line-height:1.55}
.records-toolbar{flex-wrap:wrap}
.record-search{height:40px;min-width:240px}
.record-search input::placeholder{color:#6e8797}
.records-table-scroll td{font-size:14px}
.records-table-scroll td small,.inspector-heading p,.record-date,.card-caption,.srt-footer{color:#647f90}
.records-table-scroll td small{font-size:12px}
.record-field-grid dt small{color:#6e8797}
.srt-tabs button{min-height:48px}
.srt-records,.srt-overview,.srt-raw{overflow-anchor:none}
@media(max-width:680px){.srt-eyebrow{display:none}.srt-header-actions button:first-child{font-size:12px}.srt-raw>div{flex-wrap:wrap}}
</style>
