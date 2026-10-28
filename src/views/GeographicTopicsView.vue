<script setup lang="ts">
import { computed, markRaw, onBeforeUnmount, onMounted, ref, watch, type Raw } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { FullScreen, Setting, Close, Collection, Refresh, Search } from '@element-plus/icons-vue'
import { listEnabledMapServices, type MapServiceItem } from '@/api/map-service'
import { useUserStore } from '@/stores/user'
import { HIGH_STANDARD_TOPIC_ID, useGeographicTopicsStore, type GeographicTopic } from '@/stores/geographic-topics'
import { createMapServiceLayer, createAdministrativeBoundaryLayer, expandMapServiceSublayers, getMapServiceLayerMetadata, queryMapServiceFeatures, queryMapServiceSpatialIds, MAP_SERVICE_IMAGERY_PANE, MAP_SERVICE_VECTOR_PANE, type MapServiceLayerHandle, type MapServiceSearchGeometry } from '@/utils/map-service-layer'
import { resolveC5Style, c5Pattern, type C5Style } from '@/utils/land-survey-c5'
import { createTopicRenderer, type TopicDisplayMode } from '@/utils/topic-renderer'
import { topicRole, categoryWhere, combineWhere, type TopicRole } from '@/utils/geographic-topic'

interface Category { value: string; name: string; count: number; checked: boolean; style?: C5Style; color?: string; mode?: TopicDisplayMode }
interface TopicLayer { key: string; service: MapServiceItem; sourceName: string; role: TopicRole; fields: string[]; categoryField: string; categories: Category[]; visible: boolean; pending: boolean; error: string; ready: boolean; mode: TopicDisplayMode; handle?: Raw<MapServiceLayerHandle>; spatialWhere?: string }
interface Project { key: string; name: string; geometries: MapServiceSearchGeometry[] }
const user = useUserStore()
const props = defineProps<{topic: GeographicTopic}>()
const topicStore = useGeographicTopicsStore()
const root = ref<HTMLElement>(), canvas = ref<HTMLElement>()
const layers = ref<TopicLayer[]>([]), projects = ref<Project[]>([]), projectKey = ref('')
const configOpen = ref(false), legendOpen = ref(true), pending = ref(false), error = ref(''), projectPending = ref(false), projectError = ref('')
const fullscreen = ref(false)
const businessBatchPending = ref(false)
const layerKeyword = ref('')
const scaleWidth = ref(96)
const scaleLabel = ref('5 km')
// 专题目录独立于任务业务场景；仅使用当前部门接口实际返回的可用图层。
const availableLayers = computed(() => layers.value)
function matchesLayer(item: TopicLayer) {
  const keyword = layerKeyword.value.trim().toLocaleLowerCase()
  return !keyword || `${item.service.name} ${item.sourceName}`.toLocaleLowerCase().includes(keyword)
}
const legendLayers = computed(() => availableLayers.value.filter(item => item.visible && (item.categories.length || layerKeyword.value.trim()) && matchesLayer(item)))
const imageryLayers = computed(() => availableLayers.value.filter(item => item.role === 'imagery'))
const vectorLayers = computed(() => availableLayers.value.filter(item => item.role !== 'imagery' && matchesLayer(item)))
const legendCategories = computed(() => legendLayers.value.flatMap(item => item.categories))
const legendAllSelected = computed(() => legendCategories.value.length > 0 && legendCategories.value.every(category => category.checked))
const legendPartSelected = computed(() => !legendAllSelected.value && legendCategories.value.some(category => category.checked))
const businessAllSelected = computed(() => vectorLayers.value.length > 0 && vectorLayers.value.every(item => item.visible))
const businessPartSelected = computed(() => !businessAllSelected.value && vectorLayers.value.some(item => item.visible))
const roleNames: Record<TopicRole, string> = { land:'国土调查底类', permanent:'永久基本农田', boundary:'行政边界', changes:'变化线索', facility:'项目设施', project:'项目范围', parcel:'耕地地块', imagery:'遥感影像', unconfigured:'待配置数据' }
let map: L.Map | undefined, resizeObserver: ResizeObserver | undefined, version = 0, projectVersion = 0
const featureCache = new Map<string, Awaited<ReturnType<typeof queryMapServiceFeatures>>>()
const inFlight = new Map<string, Promise<void>>()
function current(item: TopicLayer, request: number) { return request === version && layers.value.some(layer => layer.key === item.key) }
function expression(item: TopicLayer) {
  const categories = item.categories
  return combineWhere(item.spatialWhere || '1=1', item.categoryField ? categoryWhere(item.categoryField, categories.filter(c => c.checked).map(c => c.value), categories.map(c => c.value)) : '1=1')
}
function applyFilter(item: TopicLayer) { item.handle?.setQueryFilter?.(expression(item)) }
function selectLegend(mode: 'all' | 'none' | 'invert') {
  legendLayers.value.forEach(item => {
    item.categories.forEach(category => {
      category.checked = mode === 'invert' ? !category.checked : mode === 'all'
    })
    // 一次批量操作只对每个图层提交一次筛选，避免按分类逐个重绘。
    applyFilter(item)
  })
}
async function selectBusinessLayers(mode: 'all' | 'none' | 'invert') {
  if (businessBatchPending.value) return
  businessBatchPending.value = true
  const targets = vectorLayers.value.map(item => ({ item, visible:mode === 'invert' ? !item.visible : mode === 'all' }))
  try { await Promise.all(targets.map(({item,visible}) => setVisible(item,visible,true))) }
  finally { businessBatchPending.value = false }
}
function invertSelection(event: Event, scope: 'legend' | 'business') {
  // 反选是一次性操作，完成后复位，允许再次点击反转当前状态。
  ;(event.target as HTMLInputElement).checked = false
  if (scope === 'legend') selectLegend('invert')
  else void selectBusinessLayers('invert')
}
function applyDisplayMode(item: TopicLayer) {
  if (item.role === 'boundary') { item.handle?.setFillOpacity?.(item.mode === 'filled' ? 1 : 0); return }
  item.handle?.setRenderer?.(createTopicRenderer(item.categoryField,item.categories,item.service.arcGisGeometryType,item.handle.color,item.mode))
}
function setLayerMode(item: TopicLayer, mode: TopicDisplayMode) {
  item.mode = mode
  item.categories.forEach(category => { category.mode = undefined })
  applyDisplayMode(item)
  topicStore.setPreference(props.topic.id,item.key,{mode:item.mode,categoryModes:{}})
}
function layerUsesMode(item: TopicLayer, mode: TopicDisplayMode) {
  return item.categories.length ? item.categories.every(category => (category.mode ?? item.mode) === mode) : item.mode === mode
}
function setCategoryMode(item: TopicLayer, category: Category, mode: TopicDisplayMode) {
  category.mode = mode
  applyDisplayMode(item)
  topicStore.setPreference(props.topic.id,item.key,{
    categoryModes:Object.fromEntries(item.categories.filter(category => category.mode).map(category => [category.value,category.mode!])),
  })
}
function restoreCategoryModes(item: TopicLayer) {
  const modes = topicStore.getPreference(props.topic.id,item.key)?.categoryModes
  item.categories.forEach(category => { category.mode = modes?.[category.value] })
}
function assignLayerPane(item: TopicLayer, layer: L.Layer) {
  if (!map || item.role === 'imagery' || item.role === 'boundary') return
  const paneName = `topic-vector-${item.key.replace(/[^a-zA-Z0-9-]/g, '-')}`
  let pane = map.getPane(paneName)
  if (!pane) pane = map.createPane(paneName)
  // 每层有固定的容器；切换渲染器时新瓦片只替换本层，不能跃到其他图层上方。
  pane.style.zIndex = '335'
  pane.style.pointerEvents = 'none'
  const assign = (child: L.Layer) => {
    child.options.pane = paneName
    if (child instanceof L.LayerGroup) child.eachLayer(assign)
  }
  assign(layer)
  // 固定按列表顺序叠放，不受异步加载或模式切换完成时间影响。
  layers.value.forEach(candidate => {
    const container = map?.getPane(`topic-vector-${candidate.key.replace(/[^a-zA-Z0-9-]/g, '-')}`)
    if (container?.parentElement) container.parentElement.appendChild(container)
  })
}
async function prepare(item: TopicLayer) {
  if (!map || item.handle || item.pending) return
  const request = version
  item.pending = true; item.error = ''
  try {
    if (item.categoryField && !item.ready) {
      const fields = [...new Set([item.categoryField, ...(item.fields.includes('DLMC') ? ['DLMC'] : [])])]
      const cacheKey = item.key + fields.join(',')
      let data = featureCache.get(cacheKey)
      if (!data) { data = await queryMapServiceFeatures(item.service, fields); if (request !== version) return; featureCache.set(cacheKey, data) }
      if (!current(item, request)) return
      const groups = new Map<string, Category>()
      data.features.forEach(feature => {
        const attributes = feature.attributes || {}, value = String(attributes[item.categoryField] ?? '').trim()
        const existing = groups.get(value)
        if (existing) { existing.count++; return }
        const name = String(attributes.DLMC || value || '未分类')
        const standard = ['land', 'permanent', 'parcel'].includes(item.role) ? resolveC5Style(item.categoryField === 'DLBM' ? value : '', name) : undefined
        groups.set(value, { value, name, count:1, checked:true, style:standard })
      })
      item.categories = [...groups.values()].sort((a,b) => a.value.localeCompare(b.value, 'zh-CN'))
      item.ready = true
    }
    const handle = item.role === 'boundary' ? await createAdministrativeBoundaryLayer(item.service) : await createMapServiceLayer(item.service)
    if (!current(item, request)) return
    item.handle = markRaw(handle)
    assignLayerPane(item, handle.layer)
    item.categories.forEach(category => { category.color = item.role === 'project' ? '#ffca5d' : handle.categoryFilter?.values.find(value => value.value === category.value)?.color || handle.color })
    restoreCategoryModes(item)
    applyDisplayMode(item)
    applyFilter(item)
    if (item.visible) handle.layer.addTo(map)
    if (item.role === 'boundary' && handle.bounds?.isValid()) map.fitBounds(handle.bounds, { padding:[45,45], maxZoom:14 })
  } catch (reason) { if (current(item, request)) { item.error = reason instanceof Error ? reason.message : '数据读取失败'; item.visible = false } }
  finally { if (current(item, request)) item.pending = false }
}
async function setVisible(item: TopicLayer, visible: boolean, remember = false) {
  if (remember) topicStore.setPreference(props.topic.id,item.key,{visible})
  item.visible = visible
  if (visible) {
    let job = inFlight.get(item.key)
    if (!job) { job = prepare(item); inFlight.set(item.key, job); void job.finally(() => { if (inFlight.get(item.key) === job) inFlight.delete(item.key) }) }
    await job
    if (layers.value.some(layer => layer === item) && item.visible && item.handle && map) { applyFilter(item); if (!map.hasLayer(item.handle.layer)) item.handle.layer.addTo(map) }
  } else item.handle?.layer.remove()
}
async function selectImagery(key: string) { await Promise.all(imageryLayers.value.map(item => setVisible(item, item.key === key,true))) }
async function applyScene() {
  projectVersion++; projectKey.value = ''; projectError.value = ''; projectPending.value = false
  const land = availableLayers.value.find(item => item.role === 'land'), boundary = availableLayers.value.find(item => item.role === 'boundary'), imagery = imageryLayers.value[0]
  await Promise.all(layers.value.map(item => {
    const preference = topicStore.getPreference(props.topic.id,item.key)
    const mode = preference?.mode || (item.role === 'boundary' ? 'boundary' : 'filled')
    item.mode = mode
    restoreCategoryModes(item)
    applyDisplayMode(item)
    item.spatialWhere = undefined
    item.categories.forEach(category => { category.checked = true })
    const defaultVisible = [boundary?.key,imagery?.key,...(props.topic.id === HIGH_STANDARD_TOPIC_ID ? [land?.key] : [])].includes(item.key)
    return setVisible(item, preference?.visible ?? defaultVisible)
  }))
}
async function loadProjects(request: number) {
  const output: Project[] = []
  const sources = layers.value.filter(item => item.role === 'project' && !item.fields.includes('XMLX') && !item.fields.includes('项目类'))
  await Promise.all(sources.map(async item => {
    try {
      const result = await queryMapServiceFeatures(item.service, ['XMMC'], '1=1', true)
      result.features.forEach((feature, index) => { if (feature.geometry) output.push({ key:`${item.key}:${index}`, name:String(feature.attributes?.XMMC || '未命名项目'), geometries:[feature.geometry] }) })
    } catch { /* 未发布可查询项目范围时保留图层显示，不推断设施归属。 */ }
  }))
  if (request === version) projects.value = output
}
async function selectProject() {
  const request = ++projectVersion, currentVersion = version
  projectError.value = ''; projectPending.value = true
  const project = projects.value.find(item => item.key === projectKey.value)
  const facilities = availableLayers.value.filter(item => item.role === 'facility')
  try {
    await Promise.all(facilities.map(async item => {
      item.spatialWhere = project ? '1=0' : '1=1'; applyFilter(item)
      if (project) {
        const ids = await queryMapServiceSpatialIds(item.service, project.geometries)
        if (request !== projectVersion || currentVersion !== version) return
        const metadata = await getMapServiceLayerMetadata(item.service)
        if (request !== projectVersion || currentVersion !== version) return
        const oid = metadata.fields?.find(field => field.type === 'esriFieldTypeOID')?.name
        if (!oid || ids.some(id => !/^\d+$/.test(String(id)))) throw new Error('设施缺少可用的对象编号')
        item.spatialWhere = ids.length ? `${oid} IN (${ids.join(',')})` : '1=0'
        await setVisible(item, true)
      }
      applyFilter(item)
    }))
  } catch (reason) { if (request === projectVersion) projectError.value = reason instanceof Error ? reason.message : '空间筛选失败' }
  finally { if (request === projectVersion) projectPending.value = false }
}
async function loadData() {
  if (!map) return
  const request = ++version
  projectVersion++; layers.value.forEach(item => item.handle?.layer.remove()); layers.value = []; projects.value = []; featureCache.clear(); inFlight.clear()
  pending.value = true; error.value = ''
  try {
    const sources = await listEnabledMapServices(user.activeDeptId)
    if (request !== version) return
    const output: TopicLayer[] = []
    for (let index = 0; index < sources.length; index += 3) {
      await Promise.all(sources.slice(index, index + 3).map(async source => {
        try {
          const expanded = await expandMapServiceSublayers(source, true)
          await Promise.all(expanded.map(async service => {
            const metadata = service.arcGisLayerId === undefined ? undefined : await getMapServiceLayerMetadata(service)
            const fields = (metadata?.fields || []).map(field => field.name || '').filter(Boolean)
            const role = topicRole(service, fields)
            if (role === 'unconfigured') return
            const categoryField = fields.includes('DLBM') ? 'DLBM' : fields.includes('DLMC') ? 'DLMC' : fields.includes('变化类') ? '变化类' : fields.includes('XMLX') ? 'XMLX' : fields.includes('GCMC') ? 'GCMC' : ''
            const key = `${source.id}/${service.arcGisLayerId ?? 'root'}`
            const mode = topicStore.getPreference(props.topic.id,key)?.mode || (role === 'boundary' ? 'boundary' : 'filled')
            output.push({ key,service,sourceName:source.name,fields,role,categoryField,categories:[],visible:false,pending:false,error:'',ready:false,mode })
          }))
        } catch { /* 无权访问或离线服务不列入可用专题。 */ }
      }))
      if (request !== version) return
    }
    layers.value = output.sort((a,b) => (Number(a.service.sort) || 0) - (Number(b.service.sort) || 0) || a.key.localeCompare(b.key, undefined, {numeric:true}))
    await applyScene()
    void loadProjects(request)
  } catch (reason) { if (request === version) error.value = reason instanceof Error ? reason.message : '专题数据读取失败' }
  finally { if (request === version) pending.value = false }
}
async function toggleFullscreen() {
  try { if (document.fullscreenElement === root.value) await document.exitFullscreen(); else await root.value?.requestFullscreen() }
  catch { error.value = '浏览器未允许全屏，请使用浏览器全屏查看。' }
}
function updateFullscreen() { fullscreen.value = document.fullscreenElement === root.value; map?.invalidateSize({pan:false}) }
function updateScale() {
  if (!map) return
  const referenceWidth = 110
  const centerY = map.getSize().y / 2
  const left = map.containerPointToLatLng([0, centerY])
  const right = map.containerPointToLatLng([referenceWidth, centerY])
  const metres = map.distance(left, right)
  if (!Number.isFinite(metres) || metres <= 0) return
  const magnitude = 10 ** Math.floor(Math.log10(metres))
  const niceDistance = [1, 2, 5].reduce((best, factor) => {
    const candidate = factor * magnitude
    return candidate <= metres && candidate > best ? candidate : best
  }, magnitude / 10)
  scaleWidth.value = Math.max(34, Math.round(referenceWidth * niceDistance / metres))
  scaleLabel.value = niceDistance >= 1000 ? `${niceDistance / 1000} km` : `${niceDistance} m`
}
watch(() => user.activeDeptId, () => { void loadData() })
watch(() => props.topic.id, () => {
  layerKeyword.value = ''
  // 首次数据准备过程中也同步最新专题的显隐，防止慢请求把前一个专题重新显示出来。
  if (layers.value.length) void applyScene()
})
onMounted(() => {
  if (!canvas.value) return
  map = L.map(canvas.value, { center:[32.49,119.85], zoom:12, attributionControl:false, zoomControl:false })
  L.control.zoom({position:'bottomright'}).addTo(map)
  updateScale()
  map.on('moveend zoomend resize', updateScale)
  for (const [name,zIndex] of [[MAP_SERVICE_IMAGERY_PANE,225],[MAP_SERVICE_VECTOR_PANE,335],['administrative-boundaries',350]] as const) map.createPane(name).style.zIndex = String(zIndex)
  const token = import.meta.env.VITE_TIANDITU_TOKEN
  if (token) L.tileLayer(`https://t{s}.tianditu.gov.cn/img_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=img&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILECOL={x}&TILEROW={y}&TILEMATRIX={z}&tk=${token}`, {subdomains:['0','1','2','3','4','5','6','7'],maxNativeZoom:18,maxZoom:22,updateWhenIdle:true,updateWhenZooming:false,keepBuffer:2}).addTo(map)
  resizeObserver = new ResizeObserver(() => map?.invalidateSize({pan:false})); resizeObserver.observe(canvas.value)
  document.addEventListener('fullscreenchange', updateFullscreen)
  void loadData()
})
onBeforeUnmount(() => { version++; projectVersion++; document.removeEventListener('fullscreenchange', updateFullscreen); resizeObserver?.disconnect(); map?.remove(); map = undefined })
</script>

<template>
  <section ref="root" class="geographic-topics" aria-label="专题地图">
    <div ref="canvas" class="topic-map"></div>
    <div class="topic-map-scale" :style="{ width: `${scaleWidth}px` }" :aria-label="`比例尺 ${scaleLabel}`"><b>{{ scaleLabel }}</b><i></i></div>
    <div class="topic-title"><span>专题数据管理</span><strong :title="topic.name">{{ topic.name }}</strong><small>{{ topic.description || '第三次全国国土调查 · 分类图式' }}</small></div>
    <nav class="topic-tools" aria-label="专题地图操作">
      <button :aria-label="fullscreen ? '退出全屏' : '全屏展示'" :title="fullscreen ? '退出全屏' : '全屏展示'" @click="toggleFullscreen"><FullScreen /></button>
      <button :class="{active:configOpen}" :aria-expanded="configOpen" title="场景配置" @click="configOpen = !configOpen"><Setting /><span>场景配置</span></button>
    </nav>
    <div v-if="error" class="topic-status" role="alert">{{ error }}<button @click="loadData">重试</button></div>
    <div v-else-if="pending" class="topic-status" role="status">正在准备专题数据…</div>
    <div v-else-if="topicStore.storageError" class="topic-status" role="alert">{{ topicStore.storageError }}</div>
    <aside class="topic-legend" :class="{collapsed:!legendOpen}">
      <button class="legend-heading" :aria-expanded="legendOpen" @click="legendOpen = !legendOpen"><Collection /><b>分类与图例</b><span>{{ legendOpen ? '收起' : '展开' }}</span></button>
      <div v-if="legendOpen" class="legend-content">
        <label class="layer-search"><Search aria-hidden="true" /><input v-model="layerKeyword" type="search" aria-label="搜索图层名称" placeholder="搜索图层名称" /></label>
        <div class="selection-actions" role="group" aria-label="图例批量选择">
          <label><input type="checkbox" :checked="legendAllSelected" :indeterminate="legendPartSelected" :disabled="pending || !legendCategories.length" @change="selectLegend(($event.target as HTMLInputElement).checked ? 'all' : 'none')" />全选</label>
          <label><input type="checkbox" :checked="false" :disabled="pending || !legendCategories.length" @change="invertSelection($event,'legend')" />反选</label>
        </div>
        <p v-if="!legendLayers.length && !pending">{{ layerKeyword.trim() ? '没有匹配的已开启图层，可在场景配置中查找并开启。' : '暂无已开启的分类图层，可在场景配置中选择。' }}</p>
        <section v-for="item in legendLayers" :key="item.key" class="legend-group">
          <h3>{{ item.service.name }}</h3>
          <fieldset v-if="item.role !== 'imagery'" class="display-mode" :aria-label="`${item.service.name}图例显示模式`"><legend>图层显示</legend>
            <label><input :checked="layerUsesMode(item,'filled')" type="radio" :name="`legend-mode-${item.key}`" value="filled" @change="setLayerMode(item,'filled')" />铺满模式</label>
            <label><input :checked="layerUsesMode(item,'boundary')" type="radio" :name="`legend-mode-${item.key}`" value="boundary" @change="setLayerMode(item,'boundary')" />边界模式</label>
          </fieldset>
          <p v-if="!item.categories.length">{{ item.role === 'imagery' ? '影像底图' : '此图层没有分类项目。' }}</p>
          <div v-for="category in item.categories" :key="category.value" class="category-entry">
          <label class="topic-category">
            <input v-model="category.checked" type="checkbox" @change="applyFilter(item)" />
            <img v-if="category.style" :src="c5Pattern(category.style)" alt="" /><i v-else class="source-symbol" :style="{background:category.color}"></i>
            <span>{{ category.value }}<b>{{ category.name !== category.value ? category.name : '' }}</b><small v-if="category.style && !category.style.mapped">扩展地类 · 待确认规范映射</small></span><em>{{ category.count }}</em>
          </label>
          <fieldset class="category-mode" :aria-label="`${item.service.name} ${category.value} ${category.name}显示模式`">
            <legend class="visually-hidden">分类显示模式</legend>
            <label><input type="radio" :name="`category-mode-${item.key}-${category.value}`" :checked="(category.mode ?? item.mode) === 'filled'" @change="setCategoryMode(item,category,'filled')" />铺满</label>
            <label><input type="radio" :name="`category-mode-${item.key}-${category.value}`" :checked="(category.mode ?? item.mode) === 'boundary'" @change="setCategoryMode(item,category,'boundary')" />边界</label>
          </fieldset>
          </div>
        </section>
        <footer>C.5 表 C.1 / C.2 · RGB 标准底色<br />变化线索、项目范围和设施为业务辅助图层，不作为调查地类。图例数量为源数据分类总数。</footer>
      </div>
    </aside>
    <Transition name="topic-drawer"><aside v-if="configOpen" class="topic-config" aria-label="场景配置">
      <header><div><small>SCENE SETTINGS</small><h2>场景配置</h2></div><button aria-label="关闭场景配置" @click="configOpen=false"><Close /></button></header>
      <div class="config-body">
        <p class="topic-note">{{ topic.name }}：{{ topic.description || '按当前部门权限选择专题数据。' }}<br />图层显隐和显示模式保存在本机浏览器。</p>
        <p v-if="topicStore.storageError" role="alert">{{ topicStore.storageError }}</p>
        <section><h3>背景影像</h3><select aria-label="背景影像" :value="imageryLayers.find(item=>item.visible)?.key || ''" @change="selectImagery(($event.target as HTMLSelectElement).value)"><option value="">仅基础底图</option><option v-for="item in imageryLayers" :key="item.key" :value="item.key">{{ item.service.name }}</option></select></section>
        <section><h3>业务数据 <small>{{ vectorLayers.length }} 个可用图层</small></h3>
          <div class="selection-actions" role="group" aria-label="业务数据批量选择">
            <label><input type="checkbox" :checked="businessAllSelected" :indeterminate="businessPartSelected" :disabled="pending || businessBatchPending || !vectorLayers.length" @change="selectBusinessLayers(($event.target as HTMLInputElement).checked ? 'all' : 'none')" />全选</label>
            <label><input type="checkbox" :checked="false" :disabled="pending || businessBatchPending || !vectorLayers.length" @change="invertSelection($event,'business')" />反选</label>
            <small v-if="businessBatchPending" role="status">正在应用…</small>
          </div>
          <p v-if="!vectorLayers.length && layerKeyword.trim()">没有匹配的业务图层。</p>
          <div v-for="item in vectorLayers" :key="item.key" class="config-layer">
            <label><input :checked="item.visible" :disabled="businessBatchPending" type="checkbox" @change="setVisible(item,($event.target as HTMLInputElement).checked,true)" /><span><b>{{ item.service.name }}</b><small>{{ roleNames[item.role] }}{{ item.categoryField ? ` · ${item.categoryField}` : '' }}</small></span><Refresh v-if="item.pending" class="pending-icon" /></label>
            <fieldset class="display-mode" :aria-label="`${item.service.name}配置显示模式`"><legend class="visually-hidden">图层显示</legend>
              <label><input :checked="layerUsesMode(item,'filled')" type="radio" :name="`config-mode-${item.key}`" value="filled" @change="setLayerMode(item,'filled')" />铺满模式</label>
              <label><input :checked="layerUsesMode(item,'boundary')" type="radio" :name="`config-mode-${item.key}`" value="boundary" @change="setLayerMode(item,'boundary')" />边界模式</label>
            </fieldset>
            <p v-if="item.error" role="alert">{{ item.error }} <button @click="setVisible(item,true,true)">重试</button></p>
          </div>
        </section>
        <section v-if="projects.length"><h3>项目空间筛选</h3><select v-model="projectKey" aria-label="项目空间筛选" :disabled="projectPending" @change="selectProject"><option value="">全部项目范围</option><option v-for="item in projects" :key="item.key" :value="item.key">{{ item.name }}</option></select><p>{{ projectPending ? '正在查询范围内的设施…' : '按设施与项目范围相交筛选；空间相交不代表设施由该项目建设。' }}</p><p v-if="projectError" role="alert">{{ projectError }}</p><p class="topic-note">当前已发布设施缺少“是否高标项目建设”及所属项目代码等完整字段，暂不按建设归属着色。需重新发布服务后启用，不能用空间相交代替归属。</p></section>
        <section><h3>分类标准</h3><p>TD/T 1055—2019，C.5 表 C.1 / C.2。203（村庄）与 0203（橡胶园）分别保留；未列出的扩展编码使用灰色待确认图式。</p><p>专题只使用当前部门权限内的可用图层，标准颜色不可在此修改。</p></section>
      </div>
    </aside></Transition>
  </section>
</template>

<style scoped>
.category-entry{border-radius:6px;padding-bottom:7px}.category-entry:hover{background:#43869c18}.category-mode{display:flex;align-items:center;gap:14px;border:0;margin:0;padding:0 4px 0 27px;min-width:0}.category-mode label{display:flex;align-items:center;gap:5px;cursor:pointer;font-size:10px;color:#a7c6cf;line-height:20px}.category-mode input{margin:0;width:12px;height:12px;accent-color:#39c7d5}
.topic-map.leaflet-grab,.topic-map :deep(.leaflet-grab){cursor:default!important}.topic-map :deep(.leaflet-interactive){cursor:pointer}.layer-search{display:flex;align-items:center;gap:8px;padding:8px 10px;margin:0 0 14px;border:1px solid #6693a04d;border-radius:6px;background:#12384680}.layer-search svg{width:15px!important;height:15px!important;color:#8ebccb}.layer-search input{width:100%;min-width:0;padding:0;border:0;outline:0;background:transparent;color:#e6f3f5;font:inherit;font-size:12px;line-height:22px}.layer-search:focus-within{border-color:#62c8d9;box-shadow:0 0 0 2px #62c8d922}.layer-search input::placeholder{color:#8eb0be}.config-layer{border-bottom:1px solid #7395a21f;padding-bottom:7px;margin-bottom:6px}.config-layer .display-mode{padding:0 0 0 24px;margin:2px 0 8px;border:0;gap:12px}.config-layer .display-mode label{padding:0;font-size:11px;gap:6px}.legend-group .display-mode{padding:0 0 10px;margin:0 0 8px;border-bottom:0;gap:12px}.legend-group .display-mode legend{display:none}.legend-group .display-mode label{font-size:11px;gap:6px}.visually-hidden{position:absolute;width:1px;height:1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap}.topic-title{max-width:calc(100% - 230px)}.topic-title strong,.topic-title small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}@media(max-width:1100px){.geographic-topics .topic-tools{left:auto;right:20px}.topic-title{max-width:calc(100% - 40px)}}
.selection-actions{display:flex;align-items:center;gap:18px;margin-bottom:12px}.selection-actions label,.display-mode label{display:flex;align-items:center;gap:7px;font-size:12px;line-height:1.6;cursor:pointer}.selection-actions label:has(input:disabled){opacity:.4;cursor:not-allowed}.selection-actions small{font-size:10px;color:#83a6b3}.display-mode{display:flex;flex-wrap:wrap;gap:16px;border:0;border-bottom:1px solid #7395a229;padding:0 0 14px;margin:0 0 14px;min-width:0}.display-mode legend{font-size:11px;color:#a7c6cf;margin-bottom:10px}.display-mode input{accent-color:#39c7d5;margin:0;width:14px;height:14px}
.geographic-topics{position:relative;height:100%;min-height:450px;overflow:hidden;background:#173340;color:#e5f2f5;font-family:inherit}.geographic-topics:fullscreen{height:100vh;width:100vw}.topic-map{position:absolute;inset:0;z-index:0}.topic-title{position:absolute;z-index:450;left:24px;top:22px;display:grid;gap:5px;pointer-events:none;text-shadow:0 2px 8px #00141e}.topic-title>span{font-size:11px;letter-spacing:3px;color:#b4e5ef}.topic-title strong{font-size:23px;line-height:1.3}.topic-title small{font-size:11px;color:#d4e9ed}.topic-tools{position:absolute;z-index:510;right:20px;top:20px;display:flex;align-items:center;gap:8px;padding:7px;border-radius:12px;background:#072634e8;box-shadow:0 8px 30px #00162140;backdrop-filter:blur(18px)}.geographic-topics button,.geographic-topics select{font:inherit;color:inherit;box-sizing:border-box}.topic-tools button,.topic-config header button{display:flex;align-items:center;justify-content:center;gap:7px;height:36px;min-width:36px;padding:0 10px;border:0;border-radius:7px;background:transparent;cursor:pointer;font-size:12px}.topic-tools button:hover,.topic-tools button.active,.topic-config header button:hover{background:#1c687d80}.geographic-topics svg{width:18px;height:18px;flex:none}.geographic-topics select{height:36px;max-width:330px;padding:0 28px 0 10px;border:1px solid #6693a04d;border-radius:7px;background:#123846;color:#e6f3f5;font-size:12px}.geographic-topics select option{background:#fff;color:#254652}.topic-status{position:absolute;z-index:520;left:50%;top:85px;transform:translateX(-50%);max-width:75%;padding:10px 16px;border-radius:8px;background:#092b3bea;font-size:12px;box-shadow:0 4px 20px #00141e40}.topic-status button{border:0;background:none;color:#62d7ed;margin-left:12px;cursor:pointer}.topic-legend{position:absolute;z-index:450;left:20px;bottom:42px;width:280px;max-height:calc(100% - 160px);display:flex;flex-direction:column;border-radius:12px;background:linear-gradient(135deg,#123744ed,#092837e6);box-shadow:0 10px 36px #00172255;backdrop-filter:blur(18px);overflow:hidden}.legend-heading{display:flex;align-items:center;gap:10px;padding:15px 16px;background:transparent;border:0;color:#e5f6fa;cursor:pointer;flex:none}.legend-heading b{font-size:13px;font-weight:600}.legend-heading span{margin-left:auto;font-size:11px;color:#82b7c5}.legend-content{padding:0 14px 14px;overflow:auto;scrollbar-width:thin;scrollbar-color:#457385 transparent}.geographic-topics p{font-size:11px;line-height:1.75;color:#a7c6cf;margin:0 0 12px}.topic-note{padding:10px 12px;border-radius:6px;background:#377b8e20}.legend-group{border-top:1px solid #7395a229;padding-top:12px;margin-top:12px}.legend-group h3{font-size:12px;line-height:1.6;margin:0 0 8px;font-weight:500;color:#d5e9ee}.topic-category{display:flex;align-items:center;gap:9px;padding:7px 4px;font-size:11px;cursor:pointer;border-radius:5px}.topic-category:hover{background:#43869c26}.geographic-topics input[type=checkbox]{width:14px;height:14px;accent-color:#39c7d5;flex:none;margin:0}.topic-category img,.source-symbol{width:26px;height:20px;border-radius:2px;object-fit:cover;flex:none;border:1px solid #c9e2e43b}.source-symbol{background:#e7a64333;box-sizing:border-box;border-color:#ebbf7380}.topic-category>span{display:flex;flex-wrap:wrap;column-gap:6px;flex:1;min-width:0;line-height:1.6}.topic-category b{font-weight:400}.topic-category small{font-size:10px;color:#eac37a;width:100%}.topic-category em{font-style:normal;font-variant-numeric:tabular-nums;color:#8cb3c0;font-size:10px}.legend-content footer{border-top:1px solid #7395a229;margin-top:12px;padding-top:12px;font-size:10px;line-height:1.8;color:#83a6b3}.topic-config{position:absolute;z-index:530;right:20px;top:82px;bottom:20px;width:350px;max-width:calc(100% - 40px);display:flex;flex-direction:column;background:linear-gradient(130deg,#103745f5,#092631f2);box-shadow:0 16px 50px #00131b66;border-radius:12px;backdrop-filter:blur(24px);overflow:hidden}.topic-config header{display:flex;align-items:center;justify-content:space-between;flex:none;padding:18px 20px;border-bottom:1px solid #7395a229}.topic-config header small{font-size:9px;letter-spacing:2px;color:#74b3c3}.topic-config h2{font-size:17px;margin:5px 0 0}.config-body{padding:18px;overflow:auto;scrollbar-width:thin;scrollbar-color:#457385 transparent}.config-body section+section{margin-top:22px}.config-body h3{font-size:13px;font-weight:500;display:flex;align-items:center;justify-content:space-between;margin:0 0 12px}.config-body h3 small{font-size:10px;color:#83a6b3}.config-body select{width:100%;max-width:none;margin-bottom:10px}.config-layer label{display:flex;gap:10px;align-items:center;padding:9px 0;cursor:pointer}.config-layer label>span{display:grid;gap:4px;flex:1;min-width:0}.config-layer b{font-size:12px;line-height:1.5;font-weight:400;overflow-wrap:anywhere}.config-layer small{font-size:10px;color:#83a6b3}.config-layer p[role=alert],p[role=alert]{color:#f1ae91}.config-layer button{border:0;background:transparent;color:#66d5ea;cursor:pointer}.topic-drawer-enter-active,.topic-drawer-leave-active{transition:opacity .2s ease,translate .2s ease}.topic-drawer-enter-from,.topic-drawer-leave-to{opacity:0;translate:15px 0}.pending-icon{animation:topic-spin 1.4s linear infinite}@keyframes topic-spin{to{rotate:360deg}}@media(prefers-reduced-motion:reduce){.topic-drawer-enter-active,.topic-drawer-leave-active{transition:none}.pending-icon{animation:none}}@media(max-width:1100px){.topic-title{top:80px;left:20px}.topic-tools{left:20px;right:20px}.topic-tools select{flex:1;min-width:0;max-width:none}.topic-legend{width:240px;max-height:calc(100% - 200px)}}
.topic-map-scale{position:absolute;z-index:500;right:14px;bottom:10px;height:18px;padding:0;color:#b9e7f4;background:transparent;font-size:11px;text-align:center;text-shadow:0 1px 4px #001723;pointer-events:none}.topic-map-scale b{position:relative;z-index:1;display:block;font-size:11px;font-weight:600;line-height:12px}.topic-map-scale i{position:absolute;right:0;bottom:0;left:0;height:7px;border-right:2px solid #b9e7f4;border-bottom:2px solid #b9e7f4;border-left:2px solid #b9e7f4}.geographic-topics :deep(.leaflet-bottom.leaflet-right){right:8px;bottom:44px}.geographic-topics :deep(.leaflet-control-zoom){margin:0;border:0;box-shadow:0 4px 14px #00172366}.geographic-topics :deep(.leaflet-control-zoom a){color:#173f54;background:#fffffff2;border-color:#c9dbe3}
</style>
