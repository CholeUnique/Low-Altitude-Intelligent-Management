<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { getFacilityPage, getFacilityGeoJson, getFacilityDetail, type FacilityRecord } from '@/api/facility'
import { useUserStore } from '@/stores/user'
import OverviewMapScale from '@/components/OverviewMapScale.vue'
import TopicMapLegend from '@/components/TopicMapLegend.vue'
import FacilityReportDialog from '@/components/FacilityReportDialog.vue'
import FacilityQrcodeDialog from '@/components/FacilityQrcodeDialog.vue'
import jiulongTownBoundary from '@/assets/geo/jiulong-town.json'

const user = useUserStore()
interface Facility { key: string; record: FacilityRecord; name: string; category: string; geometryType: string; geometry?: GeoJSON.Geometry | null }
const facilities = shallowRef<Facility[]>([])
const reportTarget = ref<FacilityRecord>(), qrcodeTarget = ref<FacilityRecord>()
const pending = ref(false), error = ref(''), keyword = ref(''), typeFilter = ref(''), statusFilter = ref(''), page = ref(1), selectedKey = ref(''), detailError = ref('')
const mapElement = ref<HTMLElement>(), listElement = ref<HTMLElement>()
const scaleMap = shallowRef<L.Map>()
const listOpen = ref(true)
const pageSize = 12
const selected = computed(() => facilities.value.find(item => item.key === selectedKey.value))
function facilityCoordinates(geometry?: GeoJSON.Geometry | null) {
  if (!geometry) return undefined
  const bounds = L.geoJSON({ type: 'Feature', properties: {}, geometry } as GeoJSON.Feature).getBounds()
  if (!bounds.isValid()) return undefined
  const center = bounds.getCenter()
  return `${center.lng.toFixed(6)}, ${center.lat.toFixed(6)}`
}
const detailRows = computed(() => {
  const item = selected.value
  if (!item) return []
  const record = item.record
  const values = [['设施名称', record.name], ['设施编号', record.facilityNo], ['设施状态', record.bizStatusName || record.bizStatus], ['所属区划', record.regionName], ['行政村', record.villageName], ['所属项目', record.projectName], ['备注', record.remark], ['更新时间', record.updateTime]]
  const rows = values.flatMap(([label, value]) => value == null || !String(value).trim() ? [] : [{ name: String(label), label: String(label), value: String(value) }])
  const coordinates = facilityCoordinates(item.geometry)
  if (coordinates) rows.push({ name: '__coordinates', label: item.geometry?.type === 'Point' ? '中心坐标' : '范围中心坐标', value: coordinates })
  return rows
})
const partial = computed(() => !!error.value)
const types = computed(() => {
  const counts = new Map<string, number>()
  facilities.value.forEach(item => counts.set(item.category, (counts.get(item.category) || 0) + 1))
  return [...counts].sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0], 'zh-CN'))
})
const categoryPalette = ['#ffbd4a', '#41cfe5', '#e897ef', '#8cde75', '#ff8e75', '#83aaff', '#f4df68', '#56dbb3', '#f39ac1', '#bdabff', '#e9a368', '#80c9f2', '#c5d97d', '#efb2a5', '#8cddd5', '#d5a8e0']
const categoryColors = computed(() => {
  const names = [...new Set(facilities.value.map(item => item.category))].sort((a, b) => a.localeCompare(b, 'zh-CN'))
  return new Map(names.map((name, index) => [name, categoryPalette[index % categoryPalette.length]!]))
})
const legendGroups = computed(() => {
  const geometryTypes: Record<string, string> = { '点': 'Point', '线': 'Polyline', '面': 'Polygon' }
  const symbols = types.value.flatMap(([name]) => {
    const kinds = ['点', '线', '面'].filter(kind => facilities.value.some(item => item.category === name && item.geometry && item.geometryType === kind))
    return kinds.map(kind => ({ label: kinds.length > 1 ? `${name}（${kind}）` : name, color: categoryColor(name), geometry: geometryTypes[kind]!, mode: 'filled' as const }))
  })
  return symbols.length ? [{ key: 'facilities', name: '工程设施', symbols }] : []
})
const filtered = computed(() => {
  const q = keyword.value.trim().toLocaleLowerCase()
  return facilities.value.filter(item => (!q || `${item.name} ${item.category} ${item.record.facilityNo || ''} ${item.record.villageName || ''} ${item.record.projectName || ''}`.toLocaleLowerCase().includes(q)) && (!typeFilter.value || item.category === typeFilter.value) && (!statusFilter.value || item.record.bizStatus === statusFilter.value))
})
const pages = computed(() => Math.max(1, Math.ceil(filtered.value.length / pageSize)))
const pageRows = computed(() => filtered.value.slice((page.value - 1) * pageSize, page.value * pageSize))
watch([keyword, typeFilter, statusFilter], () => { page.value = 1 })
watch(page, () => { listElement.value?.scrollTo({ top: 0 }) })
let version = 0, map: L.Map | undefined, featureGroup: L.LayerGroup | undefined, selectionGroup: L.LayerGroup | undefined, boundaryLayer: L.GeoJSON | undefined, facilityRenderer: L.Canvas | undefined, observer: ResizeObserver | undefined
let fitted = false
function geometryLabel(value?: string | null) { const type = (value || '').toUpperCase(); return type.includes('POINT') ? '点' : type.includes('LINE') ? '线' : type.includes('POLYGON') ? '面' : '未知' }
function categoryColor(category: string) { return categoryColors.value.get(category) || '#9ab2b6' }
/** 按图例实际高度给清单面板留出底部空间，保证图例完整可见。 */
const root = ref<HTMLElement>()
const drawerBottom = ref(252)
let legendObserver: ResizeObserver | undefined
function syncLegendSpace() {
  const legend = root.value?.querySelector('.map-symbol-legend') as HTMLElement | null
  if (!legend) return
  if (!legendObserver) { legendObserver = new ResizeObserver(() => syncLegendSpace()); legendObserver.observe(legend) }
  const next = Math.min(Math.round(window.innerHeight * .62), Math.round(legend.offsetHeight + 24))
  if (Math.abs(next - drawerBottom.value) > 2) drawerBottom.value = next
}
async function load() {
  const request = ++version
  pending.value = true; error.value = ''; facilities.value = []; selectedKey.value = ''; detailError.value = ''; fitted = false
  featureGroup?.clearLayers(); selectionGroup?.clearLayers()
  try {
    const deptId = user.activeDeptId
    if (!deptId) return
    const [first, geo] = await Promise.all([getFacilityPage({ deptId, pageNum: 1, pageSize: 200 }), getFacilityGeoJson({ deptId })])
    if (request !== version) return
    if (geo?.type !== 'FeatureCollection' || !Array.isArray(geo.features)) throw new Error('设施地图数据格式无效')
    const records = [...first.records]
    const size = first.pageSize || 200
    for (let number = 2; records.length < first.total; number++) {
      const result = await getFacilityPage({ deptId, pageNum: number, pageSize: size })
      if (request !== version) return
      if (!result.records.length) throw new Error('设施列表未完整返回，请重试')
      records.push(...result.records)
    }
    const geometries = new Map(geo.features.filter(feature => feature.properties?.facilityId != null).map(feature => [String(feature.properties!.facilityId), feature.geometry]))
    facilities.value = records.map(record => {
      const geometry = geometries.get(String(record.id))
      return { key: String(record.id), record, name: record.name || '未命名设施', category: record.typeName || record.facilityType || '未分类', geometryType: geometryLabel(geometry?.type || record.geometryType), geometry }
    })
  } catch (reason) { if (request === version) error.value = reason instanceof Error ? reason.message : '工程设施读取失败' }
  finally { if (request === version) { pending.value = false; await nextTick(); renderMap(); await nextTick(); syncLegendSpace() } }
}
/** 地图页只保留九龙镇行政区边界这一份矢量数据，作为设施分布的范围参照。 */
function renderJiulongBoundary(target: L.Map) {
  target.createPane('facility-boundary').style.zIndex = '390'
  return L.geoJSON(jiulongTownBoundary as unknown as GeoJSON.GeoJsonObject, {
    pane: 'facility-boundary',
    interactive: false,
    style: { color: '#63e2ff', weight: 4, opacity: 1, dashArray: '9 6', fill: true, fillColor: '#63e2ff', fillOpacity: .06 },
  }).addTo(target)
}
function featureLayer(item: Facility, selected = false): L.Layer | undefined {
  const g = item.geometry
  if (!g) return
  const color = categoryColor(item.category)
  const fillColor = selected ? '#ff4040' : color
  const pane = selected ? 'facility-selection' : 'facility-shapes'
  const renderer = selected ? undefined : facilityRenderer
  const pointStyle: L.PathOptions = { pane, renderer, interactive: !selected, color: selected ? '#ff4040' : '#08222f', weight: selected ? 2.5 : 1, opacity: 1, fill: true, fillColor, fillOpacity: 1 }
  const areaStyle: L.PathOptions = { pane, renderer, interactive: !selected, color: selected ? '#ff4040' : color, weight: selected ? 5 : 2.5, opacity: 1, fillColor, fillOpacity: selected ? .3 : .25 }
  return L.geoJSON({ type: 'Feature', properties: {}, geometry: g } as GeoJSON.Feature, {
    pane,
    // Leaflet 会对每个图层重新套用 style；点要素必须显式返回实心样式，否则会被面样式覆盖成空心。
    style: (feature) => /point/i.test(String((feature as GeoJSON.Feature | undefined)?.geometry?.type || '')) ? pointStyle : areaStyle,
    pointToLayer: (_feature, latlng) => L.circleMarker(latlng, { ...pointStyle, radius: selected ? 8 : 6 }),
  })
}
function renderMap() {
  if (!map || !featureGroup) return
  featureGroup.clearLayers()
  // 同一 Canvas 按面、线、点顺序绘制，点击命中顺序也随之保持一致。
  const geometryOrder: Record<string, number> = { '面': 0, '线': 1, '点': 2 }
  for (const item of [...facilities.value].sort((a, b) => (geometryOrder[a.geometryType] ?? 0) - (geometryOrder[b.geometryType] ?? 0))) {
    const layer = featureLayer(item)
    if (!layer) continue
    layer.on('click', () => selectFacility(item))
    layer.addTo(featureGroup)
  }
  if (!fitted && facilities.value.length) {
    const group = L.featureGroup(featureGroup.getLayers()), bounds = group.getBounds()
    if (bounds.isValid()) {
      const width = map.getSize().x
      map.fitBounds(bounds.pad(.12), { maxZoom: 15, paddingTopLeft: [Math.min(360, width * .28), 110], paddingBottomRight: [30, 35] })
      fitted = true
    }
  }
}
function openReport() { if (selected.value?.record) reportTarget.value = selected.value.record }
function openQrcode() { if (selected.value?.record) qrcodeTarget.value = selected.value.record }
async function selectFacility(item: Facility) {
  selectedKey.value = item.key
  detailError.value = ''
  const deptId = user.activeDeptId
  if (deptId) void getFacilityDetail(deptId, item.record.id).then(record => {
    if (selectedKey.value !== item.key || user.activeDeptId !== deptId) return
    facilities.value = facilities.value.map(entry => entry.key === item.key ? { ...entry, record, name: record.name || entry.name, category: record.typeName || record.facilityType || entry.category } : entry)
    renderMap()
  }).catch(() => { if (selectedKey.value === item.key && user.activeDeptId === deptId) detailError.value = '详情读取失败，当前显示列表信息。' })
  if (!map || !selectionGroup) return
  selectionGroup.clearLayers()
  const layer = featureLayer(item, true)
  if (!layer) return
  layer.addTo(selectionGroup)
  const bounds = L.featureGroup([layer]).getBounds()
  if (bounds.isValid()) {
    const width = map.getSize().x
    const left = listOpen.value ? Math.min(360, width * .28) : 30
    const right = Math.min(310, width * .24)
    map.fitBounds(bounds.pad(.3), { maxZoom: 17, paddingTopLeft: [left, 110], paddingBottomRight: [right, 35] })
  }
}
function closeFacilityDetail() {
  selectedKey.value = ''
  selectionGroup?.clearLayers()
}
onMounted(() => {
  if (!mapElement.value) return
  map = L.map(mapElement.value, { center: [32.49, 119.85], zoom: 12, attributionControl: false, zoomControl: false, preferCanvas: true })
  map.createPane('facility-shapes').style.zIndex = '400'
  // 扩大点、线要素的点击容差，不改变实际绘制尺寸。
  facilityRenderer = L.canvas({ pane: 'facility-shapes', tolerance: 8 })
  map.createPane('facility-selection').style.zIndex = '420'
  map.getPane('facility-selection')!.style.pointerEvents = 'none'
  scaleMap.value = map
  const token = import.meta.env.VITE_TIANDITU_TOKEN
  if (token) {
    for (const layer of ['img','cia']) L.tileLayer(`https://t{s}.tianditu.gov.cn/${layer}_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layer}&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILECOL={x}&TILEROW={y}&TILEMATRIX={z}&tk=${token}`, { subdomains:['0','1','2','3','4','5','6','7'], maxNativeZoom:18, maxZoom:22 }).addTo(map)
  }
  featureGroup = L.layerGroup().addTo(map); selectionGroup = L.layerGroup().addTo(map)
  boundaryLayer = renderJiulongBoundary(map)
  if (!fitted && boundaryLayer) {
    const bounds = boundaryLayer.getBounds()
    if (bounds.isValid()) {
      map.fitBounds(bounds.pad(.06), { maxZoom: 14 })
      fitted = true
    }
  }
  observer = new ResizeObserver(() => { map?.invalidateSize({ pan: false }) }); observer.observe(mapElement.value)
  renderMap()
})
watch(() => user.activeDeptId, () => { statusFilter.value = ''; typeFilter.value = ''; keyword.value = ''; void load() }, { immediate: true })
onBeforeUnmount(() => { version++; observer?.disconnect(); legendObserver?.disconnect(); legendObserver = undefined; map?.remove(); map = undefined })
</script>

<template>
  <section ref="root" class="facilities-overview" :style="{ '--drawer-bottom': `${drawerBottom}px` }" aria-label="工程设施地图">
    <div ref="mapElement" class="facility-map" aria-label="工程设施分布地图"></div>
    <OverviewMapScale :map="scaleMap" />
    <div class="page-title"><span>专题分析 / 高标准农田工程设施管理 / 工程设施地图</span></div>
    <TopicMapLegend :groups="legendGroups" />
    <div v-if="pending || partial" class="status-toast" :class="{'is-error':partial}" :role="partial ? 'alert' : 'status'"><template v-if="partial">设施数据读取失败：{{ error }} <button type="button" @click="load">重试</button></template><template v-else>正在读取设施台账…</template></div>
    <aside class="facility-drawer" :class="{'is-collapsed':!listOpen}" aria-label="设施清单">
      <div class="drawer-header"><div><small>FACILITY DIRECTORY</small><h2>工程设施 <span>{{ filtered.length.toLocaleString() }}</span></h2></div><button class="icon-button" type="button" :title="listOpen ? '收起设施清单' : '展开设施清单'" :aria-label="listOpen ? '收起设施清单' : '展开设施清单'" :aria-expanded="listOpen" @click="listOpen=!listOpen">{{ listOpen ? '‹' : '›' }}</button></div>
      <div v-show="listOpen" class="drawer-content">
        <div class="drawer-summary"><div><strong>{{ facilities.length.toLocaleString() }}</strong><span>设施总数</span></div><div><strong>{{ facilities.filter(item => item.geometry).length }}</strong><span>有位置</span></div><div><strong>{{ types.length }}</strong><span>分类数</span></div></div><p class="count-note">按台账记录统计，未去重</p>
        <div class="filters"><label class="search-field"><span aria-hidden="true">⌕</span><input v-model="keyword" type="search" placeholder="搜索名称、编号、项目或行政村" aria-label="搜索设施" /></label><div class="filter-row"><select v-model="statusFilter" aria-label="设施状态"><option value="">全部状态</option><option value="NORMAL">正常</option><option value="ABNORMAL">异常</option><option value="CHECKING">核查中</option><option value="DISCARDED">废弃</option></select><select v-model="typeFilter" aria-label="设施分类"><option value="">全部分类</option><option v-for="[name,count] in types" :key="name" :value="name">{{ name }}（{{ count }}）</option></select></div></div>
        <div class="list-heading"><b>设施清单</b><span>点击定位</span></div>
        <div ref="listElement" class="facility-list"><button v-for="item in pageRows" :key="item.key" type="button" class="facility-item" :class="{active:selectedKey===item.key}" @click="selectFacility(item)"><span class="facility-symbol" :style="{color:categoryColor(item.category)}">{{ item.geometryType }}</span><span class="facility-copy"><strong :title="item.name">{{ item.name }}</strong><small>{{ item.category }} · {{ item.record.bizStatusName || item.record.bizStatus || '状态未知' }}</small></span><span v-if="!item.geometry" class="facility-action">无位置</span></button><p v-if="!pageRows.length" class="empty">{{ pending ? '正在读取设施…' : '暂无符合条件的设施' }}</p></div>
        <footer><span>{{ pageSize }} 条/页　{{ page }} / {{ pages }} 页</span><div><button type="button" :disabled="page<=1" @click="page--">上一页</button><button type="button" :disabled="page>=pages" @click="page++">下一页</button></div></footer>
      </div>
    </aside>
    <aside v-if="selected" class="category-panel" aria-label="要素详情">
      <div class="category-header"><div><small>FEATURE DETAILS</small><h2>要素详情</h2></div><button class="icon-button" type="button" title="关闭要素详情" aria-label="关闭要素详情" @click="closeFacilityDetail">×</button></div>
      <div class="feature-details"><p v-if="detailError" role="alert">{{ detailError }}</p><dl><div><dt>设施类型</dt><dd>{{ selected.category }}</dd></div><div><dt>几何类型</dt><dd>{{ selected.geometryType }}</dd></div><div v-for="row in detailRows" :key="row.name"><dt :title="row.name">{{ row.label }}</dt><dd>{{ row.value }}</dd></div></dl><p v-if="!detailRows.length" class="empty">暂无要素属性信息</p></div>
      <div class="feature-actions"><button type="button" @click="openReport">问题上报</button><button type="button" @click="openQrcode">设施二维码</button></div>
    </aside>
    <FacilityReportDialog v-if="reportTarget && user.activeDeptId" :key="`report-${reportTarget.id}`" :record="reportTarget" :dept-id="user.activeDeptId" @close="reportTarget = undefined" @reported="load()" />
    <FacilityQrcodeDialog v-if="qrcodeTarget && user.activeDeptId" :key="`qrcode-${qrcodeTarget.id}`" :record="qrcodeTarget" :dept-id="user.activeDeptId" @close="qrcodeTarget = undefined" />
  </section>
</template>
<style scoped>
.facilities-overview{--details-width:310px;position:relative;height:100%;min-height:450px;overflow:hidden;background:#102d39;color:#def2f5}.facility-map{position:absolute;inset:0;z-index:0}.page-title{position:absolute;z-index:450;top:22px;left:24px;pointer-events:none;text-shadow:0 2px 9px #00141e}.page-title span{font-size:11px;color:#a3d0dd}.page-title h1{font-size:23px;line-height:1.25;margin:8px 0 4px}.page-title p{margin:0;color:#d0e6e9;font-size:11px}.facilities-overview button{font:inherit;cursor:pointer}.map-link{position:absolute;z-index:500;right:20px;top:20px;padding:10px 14px;border:1px solid #5eafbf66;border-radius:7px;background:#0b3142eb;color:#d5eff4;box-shadow:0 6px 22px #00182055}.status-toast{position:absolute;z-index:540;top:80px;left:50%;transform:translateX(-50%);max-width:50%;padding:10px 14px;border:1px solid #467b88;border-radius:6px;background:#0b3040ef;color:#cee9ef;font-size:12px}.status-toast.is-error{color:#ffb7a7}.status-toast button{border:0;background:none;color:#75ddea}.facility-drawer,.category-panel{position:absolute;z-index:500;display:flex;flex-direction:column;overflow:hidden;border:1px solid #7ab7c33b;border-radius:10px;background:linear-gradient(145deg,#143d4bf2,#092936f2);box-shadow:0 10px 35px #00182166;backdrop-filter:blur(16px)}.facility-drawer{top:118px;bottom:var(--drawer-bottom,252px);left:20px;width:310px}.category-panel{top:80px;right:20px;bottom:180px;width:270px}.facility-drawer.is-collapsed{bottom:auto;width:auto}.drawer-header,.category-header{display:flex;align-items:center;justify-content:space-between;gap:15px;padding:15px 16px;border-bottom:1px solid #7fa9b529}.drawer-header small,.category-header small{display:block;color:#74afbc;font-size:9px;letter-spacing:1.2px}.drawer-header h2,.category-header h2{margin:5px 0 0;font-size:15px;color:#e7f8fa}.drawer-header h2 span{margin-left:5px;color:#72dce2;font-size:11px;font-weight:400}.icon-button{width:28px;height:28px;border:1px solid #719da53b;border-radius:5px;background:#39687a35;color:#c3e9ee;font-size:20px!important;line-height:20px}.icon-button:hover{background:#337b8d70}.drawer-content{display:flex;flex:1;min-height:0;flex-direction:column}.drawer-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;padding:14px 14px 7px}.drawer-summary div{display:grid;gap:5px;padding:10px 8px;border-radius:6px;background:#4584931c}.drawer-summary strong{font-size:19px;color:#61dfe2;font-variant-numeric:tabular-nums}.drawer-summary span,.count-note{font-size:10px;color:#9ac0ca}.count-note{margin:0;padding:0 15px 11px}.filters{padding:0 14px 10px}.search-field{display:flex;align-items:center;gap:8px;padding:0 10px;border:1px solid #6595a260;border-radius:6px;background:#0b2c39a8}.search-field span{font-size:20px;color:#9dc9d3}.search-field input{height:34px;width:100%;min-width:0;border:0;outline:0;background:none;color:#e5f5f6;font:inherit;font-size:12px}.search-field input::placeholder{color:#8bb0bd}.filter-row{display:flex;gap:7px;margin-top:8px}.filter-row select{width:50%;min-width:0;height:33px;padding:0 7px;border:1px solid #6595a260;border-radius:5px;background:#103542;color:#cde7ed;font-size:11px}.filter-row option{background:#103542}.list-heading{display:flex;justify-content:space-between;padding:10px 15px;border-top:1px solid #719dab2a;border-bottom:1px solid #719dab2a;font-size:12px}.list-heading span{color:#83adba;font-size:10px}.facility-list{flex:1;min-height:0;overflow:auto;padding:4px 8px;scrollbar-width:thin;scrollbar-color:#548391 transparent}.facility-item{height:52px;box-sizing:border-box;display:flex;align-items:center;gap:9px;width:100%;padding:10px 7px;border:0;border-radius:5px;background:transparent;color:#d7edf0;text-align:left}.facility-item:hover,.facility-item.active{background:#37859a47}.facility-symbol{display:grid;place-items:center;width:29px;height:29px;flex:none;border:1px solid #60cbd66b;border-radius:7px;background:#39bfcb21;color:#6ae0e5;font-size:11px}.facility-copy{display:grid;gap:4px;min-width:0;flex:1}.facility-copy strong,.facility-copy small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.facility-copy strong{font-size:12px;font-weight:500}.facility-copy small{color:#8db7c2;font-size:10px}.facility-action{color:#6ecdd8;font-size:10px;white-space:nowrap}.empty{padding:20px 5px;text-align:center;color:#95bac4;font-size:11px}.drawer-content footer{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-top:1px solid #719dab2a;color:#9bbfc8;font-size:11px}.drawer-content footer div{display:flex;gap:6px}.drawer-content footer button{border:1px solid #507f8d;border-radius:4px;background:#214e5e;color:#c1e2e8;padding:5px 8px;font-size:10px}.drawer-content footer button:disabled{opacity:.4;cursor:default}@media(max-width:1100px){.facility-drawer{width:270px}.category-panel{width:230px}}@media(max-width:700px){.facility-drawer{left:10px;top:108px;bottom:150px;width:230px}.category-panel{right:10px;top:70px;bottom:auto;width:190px;max-height:45%}.page-title{top:15px;left:14px}.page-title h1{font-size:19px}.page-title span{font-size:9px}.map-link{right:10px;top:12px;padding:7px 9px;font-size:11px}.status-toast{top:65px;max-width:70%}}
.feature-details{overflow:auto;min-height:0;padding:14px;scrollbar-width:thin;scrollbar-color:#548391 transparent}.feature-summary{display:grid;gap:7px;padding:14px;border:1px solid #6ac4cd35;border-radius:6px;background:#2d728635}.feature-summary small{font-size:10px;color:#8dc4cf}.feature-summary strong{font-size:15px;color:#e5f6f7;overflow-wrap:anywhere}.feature-details dl{margin:12px 0 0}.feature-details dl>div{display:grid;grid-template-columns:minmax(70px,.8fr) minmax(0,1.2fr);gap:10px;padding:10px 2px;border-bottom:1px solid #719dab2a;font-size:11px;line-height:1.6}.feature-details dt{color:#91bbc5}.feature-details dd{margin:0;color:#d8edf0;overflow-wrap:anywhere}
.filter-row select:focus { outline: none; box-shadow: none; }
.facility-drawer { top: 50px; }
@media(max-width:700px) { .facility-drawer { top: 43px; } }
.filter-row select:focus-visible { border-color: #a2c9d1; }
@media(max-width:1100px){.facilities-overview{--details-width:270px}}
@media(max-width:700px){.facilities-overview{--details-width:230px}.facilities-overview :deep(.map-symbol-legend){left:10px}}

.category-panel .feature-actions{flex:none;display:flex;gap:8px;padding:10px 14px 14px;border-top:1px solid #285468}
.category-panel .feature-actions button{flex:1;padding:8px 10px;border:1px solid #3a7386;border-radius:5px;background:#123a4c;color:#d7eef4;font-size:12px;cursor:pointer}
.category-panel .feature-actions button:hover{background:#17506a;border-color:#4b93a8}
</style>
