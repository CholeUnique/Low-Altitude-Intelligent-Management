<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { listEnabledMapServices } from '@/api/map-service'
import { useUserStore } from '@/stores/user'
import { readTopicLayerCatalog } from '@/utils/topic-layer-catalog'
import { facilityCategoryFromName } from '@/utils/facility-category'
import OverviewMapScale from '@/components/OverviewMapScale.vue'
import { expandMapServiceSublayers, getMapServiceLayerMetadata, queryMapServiceFeatures, type MapServiceSearchGeometry } from '@/utils/map-service-layer'

const emit = defineEmits<{ openMap: [] }>()
const user = useUserStore()
interface FacilitySource { key: string; source: string; name: string; geometry: string; count: number | null; error: string }
interface Facility { key: string; name: string; category: string; categorySource: string; source: string; layer: string; layerKey: string; geometryType: string; geometry?: MapServiceSearchGeometry; attributes: Record<string, unknown>; fields: { name?: string; alias?: string; type?: string }[] }
const rows = ref<FacilitySource[]>([]), facilities = shallowRef<Facility[]>([])
const pending = ref(false), error = ref(''), keyword = ref(''), typeFilter = ref(''), layerFilter = ref(''), page = ref(1), selectedKey = ref('')
const mapElement = ref<HTMLElement>(), listElement = ref<HTMLElement>()
const scaleMap = shallowRef<L.Map>()
const listOpen = ref(true)
const pageSize = ref(12)
const selected = computed(() => facilities.value.find(item => item.key === selectedKey.value))
const detailRows = computed(() => {
  const item = selected.value
  if (!item) return []
  const labels: Record<string, string> = { GCMC: '工程名称', XMMC: '项目名称', SSXMMC: '所属项目名称', SSXMDM: '所属项目代码', BZ: '备注' }
  return item.fields.flatMap(field => {
    const name = field.name || ''
    if (!name || /^(OBJECTID|FID|SHAPE|SHAPE_LENGTH|SHAPE_AREA)$/i.test(name) || /Geometry|Blob|Raster/i.test(field.type || '')) return []
    const value = item.attributes[name]
    if (value == null || String(value).trim() === '') return []
    return [{ name, label: labels[name.toUpperCase()] || field.alias || name, value: typeof value === 'object' ? JSON.stringify(value) : String(value) }]
  })
})
const partial = computed(() => !!error.value || rows.value.some(row => !!row.error))
const types = computed(() => {
  const counts = new Map<string, number>()
  facilities.value.forEach(item => counts.set(item.category, (counts.get(item.category) || 0) + 1))
  return [...counts].sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0], 'zh-CN'))
})
const layerTypes = computed(() => {
  const counts = new Map<string, number>()
  facilities.value.forEach(item => {
    if (!layerFilter.value || item.layerKey === layerFilter.value) counts.set(item.category, (counts.get(item.category) || 0) + 1)
  })
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN'))
})
const filtered = computed(() => {
  const q = keyword.value.trim().toLocaleLowerCase()
  return facilities.value.filter(item => (!q || `${item.name} ${item.category} ${item.source} ${item.layer}`.toLocaleLowerCase().includes(q)) && (!typeFilter.value || item.category === typeFilter.value) && (!layerFilter.value || item.layerKey === layerFilter.value))
})
const pages = computed(() => Math.max(1, Math.ceil(filtered.value.length / pageSize.value)))
const pageRows = computed(() => filtered.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))
watch([keyword, typeFilter, layerFilter], () => { page.value = 1 })
watch(layerFilter, () => { if (typeFilter.value && !layerTypes.value.some(([name]) => name === typeFilter.value)) typeFilter.value = '' })
let version = 0, map: L.Map | undefined, featureGroup: L.LayerGroup | undefined, selectionGroup: L.LayerGroup | undefined, observer: ResizeObserver | undefined
let fitted = false
const categoryFields = ['SSLX', 'GCLX', 'GCFL', 'SSFL', 'SBLX', 'FACILITY_TYPE', 'TYPE_NAME']
function valueOf(attributes: Record<string, unknown>, field?: string) {
  const value = field ? attributes[field] : undefined
  return value == null ? '' : String(value).trim()
}
function categoryField(fields: {name?:string;alias?:string}[]) {
  return fields.find(field => field.name && (/^(设施类型|工程类型|设施类别|工程类别)$/.test((field.alias || '').trim()) || categoryFields.includes(field.name.toUpperCase())))?.name
}
function geometryLabel(value?: string) { return value === 'esriGeometryPoint' || value === 'esriGeometryMultipoint' ? '点' : value === 'esriGeometryPolyline' ? '线' : value === 'esriGeometryPolygon' ? '面' : '未知' }
function layerStyle(geometry: string, name: string) {
  if (geometry === '点') return { color: '#ffc45a', dashArray: undefined }
  if (geometry === '线' && name.includes('关联')) return { color: '#e9a5ff', dashArray: undefined }
  if (geometry === '线') return { color: '#45d6e9', dashArray: undefined }
  return { color: '#76e3a7', dashArray: undefined }
}
function updatePageSize() {
  const height = listElement.value?.clientHeight || 0
  if (height < 52) return
  const next = Math.max(1, Math.floor((height - 8) / 52))
  if (next === pageSize.value) return
  const firstIndex = (page.value - 1) * pageSize.value
  pageSize.value = next
  page.value = Math.min(Math.floor(firstIndex / next) + 1, pages.value)
}
async function load() {
  const request = ++version
  pending.value = true; error.value = ''; rows.value = []; facilities.value = []; selectedKey.value = ''; fitted = false
  featureGroup?.clearLayers(); selectionGroup?.clearLayers()
  try {
    const sources = await listEnabledMapServices(user.activeDeptId)
    for (let offset = 0; offset < sources.length; offset += 3) {
      const groups = await Promise.all(sources.slice(offset, offset + 3).map(source => readTopicLayerCatalog(source, { expand: service => expandMapServiceSublayers(service, true), metadata: getMapServiceLayerMetadata })))
      if (request !== version) return
      // 元数据读取失败时无法判断是否为设施图层，不能静默当作完整结果。
      const unrecognizedFailures = groups.flat().filter(item => item.error && item.role !== 'facility')
      if (unrecognizedFailures.length) error.value = '部分图层无法识别，请检查地图服务。'
      for (const entry of groups.flat().filter(item => item.role === 'facility')) {
        const row: FacilitySource = { key: entry.key, source: entry.sourceName, name: entry.service.name, geometry: geometryLabel(entry.service.arcGisGeometryType), count: null, error: entry.error }
        try {
          const metadata = await getMapServiceLayerMetadata(entry.service)
          const allFields = metadata.fields || []
          const category = categoryField(allFields)
          const oid = allFields.find(field => field.type === 'esriFieldTypeOID')?.name
          const wanted = allFields.filter(field => field.name && !/Geometry|Blob|Raster/i.test(field.type || '')).map(field => field.name!)
          const result = await queryMapServiceFeatures(entry.service, wanted, '1=1', true)
          if (request !== version) return
          const entries = result.features.map((feature, index): Facility => {
            const attributes = feature.attributes || {}, name = valueOf(attributes, 'GCMC') || '未命名工程'
            const rawCategory = valueOf(attributes, category)
            return { key: `${entry.key}/${valueOf(attributes, oid) || index}`, name, category: category ? rawCategory || '未填写类型' : facilityCategoryFromName(name),
              categorySource: category ? '设施类型' : '工程名称', source: entry.sourceName, layer: entry.service.name, layerKey: entry.key, geometryType: row.geometry, geometry: feature.geometry, attributes, fields: allFields }
          })
          row.count = entries.length
          facilities.value = [...facilities.value, ...entries]
        } catch (reason) { row.error = reason instanceof Error ? reason.message : '数据读取失败' }
        if (request !== version) return
        rows.value = [...rows.value, row]
      }
    }
  } catch (reason) { if (request === version) error.value = reason instanceof Error ? reason.message : '工程设施读取失败' }
  finally { if (request === version) { pending.value = false; await nextTick(); renderMap() } }
}
function featureLayer(item: Facility, selected = false): L.Layer | undefined {
  const g = item.geometry
  if (!g) return
  const layerAppearance = layerStyle(item.geometryType, item.layer)
  const isPoint = (Number.isFinite(g.x) && Number.isFinite(g.y)) || !!g.points?.length
  const style: L.PathOptions = { pane: selected ? 'facility-selection' : 'facility-shapes', interactive: !selected, color: selected ? '#fff068' : layerAppearance.color, weight: selected ? 5 : 2.5, opacity: 1, fillColor: selected ? '#fff068' : layerAppearance.color, fillOpacity: selected ? .3 : .18, dashArray: selected ? undefined : layerAppearance.dashArray }
  const point = (xy: number[]): L.LatLngTuple => [xy[1]!, xy[0]!]
  if (isPoint && Number.isFinite(g.x) && Number.isFinite(g.y)) return L.circleMarker([g.y!, g.x!], { ...style, color: selected ? '#fff068' : '#fff1c3', fillOpacity: 1, weight: 1.5, radius: selected ? 8 : 5 })
  if (g.paths?.length) return L.polyline(g.paths.map(path => path.filter(p => p.length >= 2).map(point)), style)
  if (g.rings?.length) return L.polygon(g.rings.map(ring => ring.filter(p => p.length >= 2).map(point)), style)
  if (g.points?.length) return L.featureGroup(g.points.filter(p => p.length >= 2).map(p => L.circleMarker(point(p), { ...style, color: selected ? '#fff068' : '#fff1c3', fillOpacity: 1, weight: 1.5, radius: selected ? 8 : 5 })))
}
function renderMap() {
  if (!map || !featureGroup) return
  featureGroup.clearLayers()
  // 同一 Canvas 中最后绘制点要素，视觉和点击命中顺序保持一致。
  const isPoint = (item: Facility) => !!item.geometry && ((Number.isFinite(item.geometry.x) && Number.isFinite(item.geometry.y)) || !!item.geometry.points?.length)
  for (const item of [...facilities.value].sort((a, b) => Number(isPoint(a)) - Number(isPoint(b)))) {
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
function selectFacility(item: Facility) {
  selectedKey.value = item.key
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
  map.createPane('facility-selection').style.zIndex = '420'
  map.getPane('facility-selection')!.style.pointerEvents = 'none'
  scaleMap.value = map
  const token = import.meta.env.VITE_TIANDITU_TOKEN
  if (token) {
    for (const layer of ['img','cia']) L.tileLayer(`https://t{s}.tianditu.gov.cn/${layer}_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layer}&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILECOL={x}&TILEROW={y}&TILEMATRIX={z}&tk=${token}`, { subdomains:['0','1','2','3','4','5','6','7'], maxNativeZoom:18, maxZoom:22 }).addTo(map)
  }
  featureGroup = L.layerGroup().addTo(map); selectionGroup = L.layerGroup().addTo(map)
  observer = new ResizeObserver(() => { map?.invalidateSize({ pan: false }); updatePageSize() }); observer.observe(mapElement.value)
  if (listElement.value) observer.observe(listElement.value)
  updatePageSize()
  renderMap()
})
watch(() => user.activeDeptId, () => { layerFilter.value = ''; typeFilter.value = ''; keyword.value = ''; void load() }, { immediate: true })
onBeforeUnmount(() => { version++; observer?.disconnect(); map?.remove(); map = undefined })
</script>

<template>
  <section class="facilities-overview" aria-label="工程设施总览">
    <div ref="mapElement" class="facility-map" aria-label="工程设施分布地图"></div>
    <OverviewMapScale :map="scaleMap" />
    <div class="page-title"><span>专题分析 / 高标准农田工程设施管理</span><h1>工程设施总览</h1><p>查看设施分布与详细信息</p></div>
    <button class="map-link" type="button" @click="emit('openMap')">工程设施地图 →</button>
    <div v-if="rows.some(row => row.count)" class="facility-legend" aria-label="地图图例">
      <header><h2>图例</h2></header>
      <div class="facility-legend-items"><div v-for="row in rows.filter(item => item.count)" :key="row.key" class="facility-legend-row" :title="`${row.source} / ${row.name}`"><span class="legend-symbol"><i :class="{point:row.geometry === '点', dashed:!!layerStyle(row.geometry,row.name).dashArray}" :style="{'--symbol-color':layerStyle(row.geometry,row.name).color}"></i></span><span>{{ row.name }}</span></div></div>
    </div>
    <div v-if="pending || partial" class="status-toast" :class="{'is-error':partial}" :role="partial ? 'alert' : 'status'"><template v-if="partial">部分设施数据读取失败，统计可能不完整。{{ error }} <span v-for="row in rows.filter(item => item.error)" :key="row.key">{{ row.name }}：{{ row.error }}；</span><button type="button" @click="load">重试</button></template><template v-else>正在读取设施数据…</template></div>
    <aside class="facility-drawer" :class="{'is-collapsed':!listOpen}" aria-label="设施清单">
      <div class="drawer-header"><div><small>FACILITY DIRECTORY</small><h2>工程设施 <span>{{ filtered.length.toLocaleString() }}</span></h2></div><button class="icon-button" type="button" :title="listOpen ? '收起设施清单' : '展开设施清单'" :aria-label="listOpen ? '收起设施清单' : '展开设施清单'" :aria-expanded="listOpen" @click="listOpen=!listOpen">{{ listOpen ? '‹' : '›' }}</button></div>
      <div v-show="listOpen" class="drawer-content">
        <div class="drawer-summary"><div><strong>{{ facilities.length.toLocaleString() }}</strong><span>要素总数{{ partial || pending ? ' · 部分' : '' }}</span></div><div><strong>{{ rows.length }}</strong><span>设施图层</span></div><div><strong>{{ types.length }}</strong><span>分类数</span></div></div><p class="count-note">按图层要素统计，未去重</p>
        <div class="filters"><label class="search-field"><span aria-hidden="true">⌕</span><input v-model="keyword" type="search" placeholder="搜索工程名称或类别" aria-label="搜索设施" /></label><div class="filter-row"><select v-model="layerFilter" aria-label="设施图层"><option value="">全部图层</option><option v-for="row in rows" :key="row.key" :value="row.key">{{ row.name }}{{ rows.filter(item => item.name === row.name).length > 1 ? `（${row.source}）` : '' }}</option></select><select v-model="typeFilter" aria-label="设施分类"><option value="">全部分类</option><option v-for="[name,count] in layerTypes" :key="name" :value="name">{{ name }}（{{ count }}）</option></select></div></div>
        <div class="list-heading"><b>设施清单</b><span>点击定位</span></div>
        <div ref="listElement" class="facility-list"><button v-for="item in pageRows" :key="item.key" type="button" class="facility-item" :class="{active:selectedKey===item.key}" @click="selectFacility(item)"><span class="facility-symbol" :style="{color:layerStyle(item.geometryType,item.layer).color}">{{ item.geometryType }}</span><span class="facility-copy"><strong :title="item.name">{{ item.name }}</strong><small :title="item.source + ' / ' + item.layer">{{ item.layer }} · {{ item.category }}</small></span><span v-if="!item.geometry" class="facility-action">无位置</span></button><p v-if="!pageRows.length" class="empty">{{ pending ? '正在读取设施…' : '暂无符合条件的设施' }}</p></div>
        <footer><span>{{ page }} / {{ pages }} 页</span><div><button type="button" :disabled="page<=1" @click="page--">上一页</button><button type="button" :disabled="page>=pages" @click="page++">下一页</button></div></footer>
      </div>
    </aside>
    <aside v-if="selected" class="category-panel" aria-label="要素详情">
      <div class="category-header"><div><small>FEATURE DETAILS</small><h2>要素详情</h2></div><button class="icon-button" type="button" title="关闭要素详情" aria-label="关闭要素详情" @click="closeFacilityDetail">×</button></div>
      <div class="feature-details"><div class="feature-summary"><small>{{ selected.geometryType }}要素 · {{ selected.category }}</small><strong>{{ selected.name }}</strong></div><dl><div><dt>数据服务</dt><dd>{{ selected.source }}</dd></div><div><dt>所属图层</dt><dd>{{ selected.layer }}</dd></div><div v-for="row in detailRows" :key="row.name"><dt :title="row.name">{{ row.label }}</dt><dd>{{ row.value }}</dd></div></dl><p v-if="!detailRows.length" class="empty">暂无要素属性信息</p></div>
    </aside>
  </section>
</template>
<style scoped>
.facilities-overview{position:relative;height:100%;min-height:450px;overflow:hidden;background:#102d39;color:#def2f5}.facility-map{position:absolute;inset:0;z-index:0}.page-title{position:absolute;z-index:450;top:22px;left:24px;pointer-events:none;text-shadow:0 2px 9px #00141e}.page-title span{font-size:11px;color:#a3d0dd}.page-title h1{font-size:23px;line-height:1.25;margin:8px 0 4px}.page-title p{margin:0;color:#d0e6e9;font-size:11px}.facilities-overview button{font:inherit;cursor:pointer}.map-link{position:absolute;z-index:500;right:20px;top:20px;padding:10px 14px;border:1px solid #5eafbf66;border-radius:7px;background:#0b3142eb;color:#d5eff4;box-shadow:0 6px 22px #00182055}.status-toast{position:absolute;z-index:540;top:80px;left:50%;transform:translateX(-50%);max-width:50%;padding:10px 14px;border:1px solid #467b88;border-radius:6px;background:#0b3040ef;color:#cee9ef;font-size:12px}.status-toast.is-error{color:#ffb7a7}.status-toast button{border:0;background:none;color:#75ddea}.facility-drawer,.category-panel{position:absolute;z-index:500;display:flex;flex-direction:column;overflow:hidden;border:1px solid #7ab7c33b;border-radius:10px;background:linear-gradient(145deg,#143d4bf2,#092936f2);box-shadow:0 10px 35px #00182166;backdrop-filter:blur(16px)}.facility-drawer{top:118px;bottom:150px;left:20px;width:310px}.category-panel{top:80px;right:20px;bottom:74px;width:270px}.facility-drawer.is-collapsed{bottom:auto;width:auto}.drawer-header,.category-header{display:flex;align-items:center;justify-content:space-between;gap:15px;padding:15px 16px;border-bottom:1px solid #7fa9b529}.drawer-header small,.category-header small{display:block;color:#74afbc;font-size:9px;letter-spacing:1.2px}.drawer-header h2,.category-header h2{margin:5px 0 0;font-size:15px;color:#e7f8fa}.drawer-header h2 span{margin-left:5px;color:#72dce2;font-size:11px;font-weight:400}.icon-button{width:28px;height:28px;border:1px solid #719da53b;border-radius:5px;background:#39687a35;color:#c3e9ee;font-size:20px!important;line-height:20px}.icon-button:hover{background:#337b8d70}.drawer-content{display:flex;flex:1;min-height:0;flex-direction:column}.drawer-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;padding:14px 14px 7px}.drawer-summary div{display:grid;gap:5px;padding:10px 8px;border-radius:6px;background:#4584931c}.drawer-summary strong{font-size:19px;color:#61dfe2;font-variant-numeric:tabular-nums}.drawer-summary span,.count-note{font-size:10px;color:#9ac0ca}.count-note{margin:0;padding:0 15px 11px}.filters{padding:0 14px 10px}.search-field{display:flex;align-items:center;gap:8px;padding:0 10px;border:1px solid #6595a260;border-radius:6px;background:#0b2c39a8}.search-field span{font-size:20px;color:#9dc9d3}.search-field input{height:34px;width:100%;min-width:0;border:0;outline:0;background:none;color:#e5f5f6;font:inherit;font-size:12px}.search-field input::placeholder{color:#8bb0bd}.filter-row{display:flex;gap:7px;margin-top:8px}.filter-row select{width:50%;min-width:0;height:33px;padding:0 7px;border:1px solid #6595a260;border-radius:5px;background:#103542;color:#cde7ed;font-size:11px}.filter-row option{background:#103542}.list-heading{display:flex;justify-content:space-between;padding:10px 15px;border-top:1px solid #719dab2a;border-bottom:1px solid #719dab2a;font-size:12px}.list-heading span{color:#83adba;font-size:10px}.facility-list{flex:1;min-height:0;overflow:auto;padding:4px 8px;scrollbar-width:thin;scrollbar-color:#548391 transparent}.facility-item{height:52px;box-sizing:border-box;display:flex;align-items:center;gap:9px;width:100%;padding:10px 7px;border:0;border-radius:5px;background:transparent;color:#d7edf0;text-align:left}.facility-item:hover,.facility-item.active{background:#37859a47}.facility-symbol{display:grid;place-items:center;width:29px;height:29px;flex:none;border:1px solid #60cbd66b;border-radius:7px;background:#39bfcb21;color:#6ae0e5;font-size:11px}.facility-copy{display:grid;gap:4px;min-width:0;flex:1}.facility-copy strong,.facility-copy small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.facility-copy strong{font-size:12px;font-weight:500}.facility-copy small{color:#8db7c2;font-size:10px}.facility-action{color:#6ecdd8;font-size:10px;white-space:nowrap}.empty{padding:20px 5px;text-align:center;color:#95bac4;font-size:11px}.drawer-content footer{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-top:1px solid #719dab2a;color:#9bbfc8;font-size:11px}.drawer-content footer div{display:flex;gap:6px}.drawer-content footer button{border:1px solid #507f8d;border-radius:4px;background:#214e5e;color:#c1e2e8;padding:5px 8px;font-size:10px}.drawer-content footer button:disabled{opacity:.4;cursor:default}@media(max-width:1100px){.facility-drawer{width:270px}.category-panel{width:230px}}@media(max-width:700px){.facility-drawer{left:10px;top:108px;bottom:150px;width:230px}.category-panel{right:10px;top:70px;bottom:auto;width:190px;max-height:45%}.page-title{top:15px;left:14px}.page-title h1{font-size:19px}.page-title span{font-size:9px}.map-link{right:10px;top:12px;padding:7px 9px;font-size:11px}.status-toast{top:65px;max-width:70%}}
.feature-details{overflow:auto;min-height:0;padding:14px;scrollbar-width:thin;scrollbar-color:#548391 transparent}.feature-summary{display:grid;gap:7px;padding:14px;border:1px solid #6ac4cd35;border-radius:6px;background:#2d728635}.feature-summary small{font-size:10px;color:#8dc4cf}.feature-summary strong{font-size:15px;color:#e5f6f7;overflow-wrap:anywhere}.feature-details dl{margin:12px 0 0}.feature-details dl>div{display:grid;grid-template-columns:minmax(70px,.8fr) minmax(0,1.2fr);gap:10px;padding:10px 2px;border-bottom:1px solid #719dab2a;font-size:11px;line-height:1.6}.feature-details dt{color:#91bbc5}.feature-details dd{margin:0;color:#d8edf0;overflow-wrap:anywhere}.facility-legend{position:absolute;z-index:495;left:20px;bottom:22px;width:310px;max-height:116px;box-sizing:border-box;display:flex;flex-direction:column;overflow:hidden;border:1px solid #d1dddc;border-radius:7px;background:#f5f8f6;box-shadow:0 3px 16px #001a2840;color:#243d44}.facility-legend header{display:flex;align-items:center;gap:12px;flex:none;padding:9px 16px 5px}.facility-legend header:before,.facility-legend header:after{content:'';height:1px;flex:1;background:#cdd9d6}.facility-legend h2{margin:0;padding-left:6px;font-size:14px;line-height:20px;font-weight:600;letter-spacing:6px;white-space:nowrap}.facility-legend-items{min-height:0;overflow:auto;padding:0 16px 8px;scrollbar-width:thin;scrollbar-color:#a8bcb9 transparent}.facility-legend-row{display:flex;align-items:center;gap:8px;min-height:23px;font-size:12px;line-height:18px}.facility-legend-row>span:last-child{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.legend-symbol{width:32px;height:18px;display:flex;align-items:center;justify-content:center;flex:none}.facility-legend i{width:26px;flex:none;border-top:3px solid var(--symbol-color);filter:drop-shadow(0 0 1px #587077)}.facility-legend i.dashed{border-top-style:dashed}.facility-legend i.point{width:10px;height:10px;border:1px solid #997c43;border-radius:50%;background:var(--symbol-color);filter:none}@media(max-width:1100px){.facility-legend{width:270px}}@media(max-width:700px){.facility-legend{left:10px;bottom:12px;width:230px}}
.filter-row select:focus { outline: none; box-shadow: none; }
.filter-row select:focus-visible { border-color: #a2c9d1; }
</style>
