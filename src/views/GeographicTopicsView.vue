<script setup lang="ts">
import { computed, markRaw, onBeforeUnmount, onMounted, ref, watch, type Raw } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { FullScreen, Setting, Close, Collection, Refresh } from '@element-plus/icons-vue'
import { getSceneDictionary, type SceneDictionaryItem } from '@/api/scene'
import { listEnabledMapServices, type MapServiceItem } from '@/api/map-service'
import { useUserStore } from '@/stores/user'
import { createMapServiceLayer, createAdministrativeBoundaryLayer, expandMapServiceSublayers, getMapServiceLayerMetadata, queryMapServiceFeatures, queryMapServiceSpatialIds, MAP_SERVICE_IMAGERY_PANE, MAP_SERVICE_VECTOR_PANE, type MapServiceLayerHandle, type MapServiceSearchGeometry } from '@/utils/map-service-layer'
import { resolveC5Style, c5Pattern, c5Symbol, type C5Style } from '@/utils/land-survey-c5'
import { NON_GRAIN, HOMESTEAD, topicRole, topicIncludes, topicBaseWhere, categoryWhere, combineWhere, type TopicRole } from '@/utils/geographic-topic'

interface Category { value: string; name: string; count: number; homesteadCount: number; checked: boolean; style?: C5Style; color?: string }
interface TopicLayer { key: string; service: MapServiceItem; role: TopicRole; fields: string[]; categoryField: string; categories: Category[]; visible: boolean; pending: boolean; error: string; ready: boolean; handle?: Raw<MapServiceLayerHandle>; spatialWhere?: string }
interface Project { key: string; name: string; geometries: MapServiceSearchGeometry[] }
const user = useUserStore()
const root = ref<HTMLElement>(), canvas = ref<HTMLElement>()
const scenes = ref<SceneDictionaryItem[]>([]), sceneCode = ref('')
const layers = ref<TopicLayer[]>([]), projects = ref<Project[]>([]), projectKey = ref('')
const configOpen = ref(false), legendOpen = ref(true), pending = ref(false), error = ref(''), projectPending = ref(false), projectError = ref('')
const fullscreen = ref(false)
const scene = computed(() => scenes.value.find(item => item.code === sceneCode.value))
const availableLayers = computed(() => layers.value.filter(item => topicIncludes(item.role, sceneCode.value, item.service.topicCode)
  && !(sceneCode.value === HOMESTEAD && item.role === 'changes' && !item.fields.includes('2025DLTB'))))
const legendLayers = computed(() => availableLayers.value.filter(item => item.visible && item.categories.length))
const imageryLayers = computed(() => availableLayers.value.filter(item => item.role === 'imagery'))
const vectorLayers = computed(() => availableLayers.value.filter(item => item.role !== 'imagery'))
const roleNames: Record<TopicRole, string> = { land:'国土调查底类', permanent:'永久基本农田', boundary:'行政边界', changes:'变化线索', facility:'项目设施', project:'项目范围', parcel:'耕地地块', imagery:'遥感影像', unconfigured:'待配置数据' }
let map: L.Map | undefined, resizeObserver: ResizeObserver | undefined, version = 0, projectVersion = 0
const featureCache = new Map<string, Awaited<ReturnType<typeof queryMapServiceFeatures>>>()
const inFlight = new Map<string, Promise<void>>()
function current(item: TopicLayer, request: number) { return request === version && layers.value.some(layer => layer.key === item.key) }
function expression(item: TopicLayer) {
  const categories = item.categories.filter(category => categoryShown(item, category))
  return combineWhere(topicBaseWhere(item.role, sceneCode.value), item.spatialWhere || '1=1', item.categoryField ? categoryWhere(item.categoryField, categories.filter(c => c.checked).map(c => c.value), categories.map(c => c.value)) : '1=1')
}
function applyFilter(item: TopicLayer) { item.handle?.setQueryFilter?.(expression(item)) }
async function prepare(item: TopicLayer) {
  if (!map || item.handle || item.pending) return
  const request = version
  item.pending = true; item.error = ''
  try {
    if (item.categoryField && !item.ready) {
      const fields = [...new Set([item.categoryField, ...(item.fields.includes('DLMC') ? ['DLMC'] : []), ...(item.role === 'changes' && item.fields.includes('2025DLTB') ? ['2025DLTB'] : [])])]
      const cacheKey = item.key + fields.join(',')
      let data = featureCache.get(cacheKey)
      if (!data) { data = await queryMapServiceFeatures(item.service, fields); if (request !== version) return; featureCache.set(cacheKey, data) }
      if (!current(item, request)) return
      const groups = new Map<string, Category>()
      data.features.forEach(feature => {
        const attributes = feature.attributes || {}, value = String(attributes[item.categoryField] ?? '').trim()
        const homesteadCount = String(attributes['2025DLTB'] || '').trim() === '农村宅基地' ? 1 : 0
        const existing = groups.get(value)
        if (existing) { existing.count++; existing.homesteadCount += homesteadCount; return }
        const name = String(attributes.DLMC || value || '未分类')
        const standard = ['land', 'permanent', 'parcel'].includes(item.role) ? resolveC5Style(item.categoryField === 'DLBM' ? value : '', name) : undefined
        groups.set(value, { value, name, count:1, homesteadCount, checked:true, style:standard })
      })
      item.categories = [...groups.values()].sort((a,b) => a.value.localeCompare(b.value, 'zh-CN'))
      item.ready = true
    }
    const handle = item.role === 'boundary' ? await createAdministrativeBoundaryLayer(item.service) : await createMapServiceLayer(item.service)
    if (!current(item, request)) return
    item.handle = markRaw(handle)
    item.categories.forEach(category => { category.color = item.role === 'project' ? '#ffca5d' : handle.categoryFilter?.values.find(value => value.value === category.value)?.color || handle.color })
    if (item.categories.some(category => category.style)) {
      handle.setRenderer?.({ type:'uniqueValue', field1:item.categoryField, fieldDelimiter:',', defaultSymbol:c5Symbol(resolveC5Style('')),
        uniqueValueInfos:item.categories.map(category => ({ value:category.value, label:category.name, symbol:c5Symbol(category.style!) })) })
    } else if (item.role === 'project') {
      handle.setRenderer?.({ type:'simple', symbol:{ type:'esriSFS', style:'esriSFSNull', outline:{ type:'esriSLS', style:'esriSLSDash', color:[255,202,93,255], width:1.6 } } })
    }
    applyFilter(item)
    if (item.visible) handle.layer.addTo(map)
    if (item.role === 'boundary' && handle.bounds?.isValid()) map.fitBounds(handle.bounds, { padding:[45,45], maxZoom:14 })
  } catch (reason) { if (current(item, request)) { item.error = reason instanceof Error ? reason.message : '数据读取失败'; item.visible = false } }
  finally { if (current(item, request)) item.pending = false }
}
async function setVisible(item: TopicLayer, visible: boolean) {
  item.visible = visible
  if (visible) {
    let job = inFlight.get(item.key)
    if (!job) { job = prepare(item); inFlight.set(item.key, job); void job.finally(() => { if (inFlight.get(item.key) === job) inFlight.delete(item.key) }) }
    await job
    if (layers.value.some(layer => layer === item) && item.visible && item.handle && map) { applyFilter(item); if (!map.hasLayer(item.handle.layer)) item.handle.layer.addTo(map) }
  } else item.handle?.layer.remove()
}
async function selectImagery(key: string) { await Promise.all(imageryLayers.value.map(item => setVisible(item, item.key === key))) }
async function applyScene() {
  projectVersion++; projectKey.value = ''; projectError.value = ''; projectPending.value = false
  const available = new Set(availableLayers.value.map(item => item.key))
  const land = availableLayers.value.find(item => item.role === 'land'), boundary = availableLayers.value.find(item => item.role === 'boundary'), imagery = imageryLayers.value[0]
  await Promise.all(layers.value.map(item => {
    item.spatialWhere = undefined
    item.categories.forEach(category => { category.checked = true })
    return setVisible(item, available.has(item.key) && [land?.key, boundary?.key, imagery?.key].includes(item.key))
  }))
}
function categoryShown(item: TopicLayer, category: Category) {
  if (sceneCode.value !== HOMESTEAD) return true
  if (item.role === 'land') return category.value === '0702'
  if (item.role === 'changes') return category.homesteadCount > 0
  return true
}
function categoryCount(item: TopicLayer, category: Category) { return sceneCode.value === HOMESTEAD && item.role === 'changes' ? category.homesteadCount : category.count }
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
    const [dictionary, sources] = await Promise.all([getSceneDictionary(user.organization.scenes, user.activeDeptId), listEnabledMapServices(user.activeDeptId)])
    if (request !== version) return
    scenes.value = dictionary.filter(item => [NON_GRAIN, HOMESTEAD].includes(item.code))
    if (!scenes.value.some(item => item.code === sceneCode.value)) sceneCode.value = scenes.value[0]?.code || ''
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
            output.push({ key:`${source.id}/${service.arcGisLayerId ?? 'root'}`, service, fields, role, categoryField, categories:[], visible:false, pending:false, error:'', ready:false })
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
watch(() => user.activeDeptId, () => { void loadData() })
onMounted(() => {
  if (!canvas.value) return
  map = L.map(canvas.value, { center:[32.49,119.85], zoom:12, attributionControl:false, zoomControl:false })
  L.control.zoom({position:'bottomright'}).addTo(map); L.control.scale({imperial:false,position:'bottomleft'}).addTo(map)
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
  <section ref="root" class="geographic-topics" aria-label="地理场景专题">
    <div ref="canvas" class="topic-map"></div>
    <div class="topic-title"><span>地理场景专题</span><strong>{{ sceneCode === HOMESTEAD ? '宅基地监管' : sceneCode === NON_GRAIN ? '耕地用途监管' : '请选择业务场景' }}</strong><small>第三次全国国土调查 · 分类图式</small></div>
    <nav class="topic-tools" aria-label="专题地图操作">
      <select v-model="sceneCode" aria-label="业务场景" :disabled="pending || !scenes.length" @change="applyScene"><option v-if="!scenes.length" value="">暂无可用场景</option><option v-for="item in scenes" :key="item.id" :value="item.code">{{ item.name }}</option></select>
      <button :aria-label="fullscreen ? '退出全屏' : '全屏展示'" :title="fullscreen ? '退出全屏' : '全屏展示'" @click="toggleFullscreen"><FullScreen /></button>
      <button :class="{active:configOpen}" :aria-expanded="configOpen" title="场景配置" @click="configOpen = !configOpen"><Setting /><span>场景配置</span></button>
    </nav>
    <div v-if="error" class="topic-status" role="alert">{{ error }}<button @click="loadData">重试</button></div>
    <div v-else-if="pending" class="topic-status" role="status">正在准备专题数据…</div>
    <aside class="topic-legend" :class="{collapsed:!legendOpen}">
      <button class="legend-heading" :aria-expanded="legendOpen" @click="legendOpen = !legendOpen"><Collection /><b>分类与图例</b><span>{{ legendOpen ? '收起' : '展开' }}</span></button>
      <div v-if="legendOpen" class="legend-content">
        <p>分类可勾选显隐，标准颜色不可修改。</p>
        <p v-if="sceneCode === HOMESTEAD" class="topic-note">展示调查底类为农村宅基地的图斑，不代表宅基地审批或违法认定结果。</p>
        <p v-if="!legendLayers.length && !pending">暂无已开启的分类图层，可在场景配置中选择。</p>
        <section v-for="item in legendLayers" :key="item.key" class="legend-group">
          <h3>{{ item.service.name }}</h3>
          <label v-for="category in item.categories.filter(c => categoryShown(item,c))" :key="category.value" class="topic-category">
            <input v-model="category.checked" type="checkbox" @change="applyFilter(item)" />
            <img v-if="category.style" :src="c5Pattern(category.style)" alt="" /><i v-else class="source-symbol" :style="{background:category.color}"></i>
            <span>{{ category.value }}<b>{{ category.name !== category.value ? category.name : '' }}</b><small v-if="category.style && !category.style.mapped">扩展地类 · 待确认规范映射</small></span><em>{{ categoryCount(item,category) }}</em>
          </label>
        </section>
        <footer>C.5 表 C.1 / C.2 · RGB 标准底色<br />变化线索、项目范围和设施为业务辅助图层，不作为调查地类。图例数量为源数据分类总数。</footer>
      </div>
    </aside>
    <Transition name="topic-drawer"><aside v-if="configOpen" class="topic-config" aria-label="场景配置">
      <header><div><small>SCENE SETTINGS</small><h2>场景配置</h2></div><button aria-label="关闭场景配置" @click="configOpen=false"><Close /></button></header>
      <div class="config-body">
        <p class="topic-note">{{ scene?.description || '按当前部门权限读取可用数据。' }}下列配置用于当前地图显示，暂不写入服务管理。</p>
        <section><h3>背景影像</h3><select aria-label="背景影像" :value="imageryLayers.find(item=>item.visible)?.key || ''" @change="selectImagery(($event.target as HTMLSelectElement).value)"><option value="">仅基础底图</option><option v-for="item in imageryLayers" :key="item.key" :value="item.key">{{ item.service.name }}</option></select></section>
        <section><h3>业务数据 <small>{{ vectorLayers.length }} 个可用图层</small></h3><div v-for="item in vectorLayers" :key="item.key" class="config-layer"><label><input :checked="item.visible" type="checkbox" @change="setVisible(item,($event.target as HTMLInputElement).checked)" /><span><b>{{ item.service.name }}</b><small>{{ roleNames[item.role] }}{{ item.categoryField ? ` · ${item.categoryField}` : '' }}</small></span><Refresh v-if="item.pending" class="pending-icon" /></label><p v-if="item.error" role="alert">{{ item.error }} <button @click="setVisible(item,true)">重试</button></p></div></section>
        <section v-if="sceneCode === NON_GRAIN"><h3>项目空间筛选</h3><select v-model="projectKey" aria-label="项目空间筛选" :disabled="projectPending || !projects.length" @change="selectProject"><option value="">全部项目范围</option><option v-for="item in projects" :key="item.key" :value="item.key">{{ item.name }}</option></select><p>{{ projectPending ? '正在查询范围内的设施…' : '按设施与项目范围相交筛选；空间相交不代表设施由该项目建设。' }}</p><p v-if="projectError" role="alert">{{ projectError }}</p><p class="topic-note">当前已发布设施缺少“是否高标项目建设”及所属项目代码等完整字段，暂不按建设归属着色。需重新发布服务后启用，不能用空间相交代替归属。</p></section>
        <section><h3>分类标准</h3><p>TD/T 1055—2019，C.5 表 C.1 / C.2。203（村庄）与 0203（橡胶园）分别保留；未列出的扩展编码使用灰色待确认图式。</p><p>专题关联优先遵守服务的 topicCode；未关联服务根据已有字段能力供当前场景使用。颜色不可在此修改。</p></section>
      </div>
    </aside></Transition>
  </section>
</template>

<style scoped>
.geographic-topics{position:relative;height:100%;min-height:450px;overflow:hidden;background:#173340;color:#e5f2f5;font-family:inherit}.geographic-topics:fullscreen{height:100vh;width:100vw}.topic-map{position:absolute;inset:0;z-index:0}.topic-title{position:absolute;z-index:450;left:24px;top:22px;display:grid;gap:5px;pointer-events:none;text-shadow:0 2px 8px #00141e}.topic-title>span{font-size:11px;letter-spacing:3px;color:#b4e5ef}.topic-title strong{font-size:23px;line-height:1.3}.topic-title small{font-size:11px;color:#d4e9ed}.topic-tools{position:absolute;z-index:510;right:20px;top:20px;display:flex;align-items:center;gap:8px;padding:7px;border-radius:12px;background:#072634e8;box-shadow:0 8px 30px #00162140;backdrop-filter:blur(18px)}.geographic-topics button,.geographic-topics select{font:inherit;color:inherit;box-sizing:border-box}.topic-tools button,.topic-config header button{display:flex;align-items:center;justify-content:center;gap:7px;height:36px;min-width:36px;padding:0 10px;border:0;border-radius:7px;background:transparent;cursor:pointer;font-size:12px}.topic-tools button:hover,.topic-tools button.active,.topic-config header button:hover{background:#1c687d80}.geographic-topics svg{width:18px;height:18px;flex:none}.geographic-topics select{height:36px;max-width:330px;padding:0 28px 0 10px;border:1px solid #6693a04d;border-radius:7px;background:#123846;color:#e6f3f5;font-size:12px}.geographic-topics select option{background:#fff;color:#254652}.topic-status{position:absolute;z-index:520;left:50%;top:85px;transform:translateX(-50%);max-width:75%;padding:10px 16px;border-radius:8px;background:#092b3bea;font-size:12px;box-shadow:0 4px 20px #00141e40}.topic-status button{border:0;background:none;color:#62d7ed;margin-left:12px;cursor:pointer}.topic-legend{position:absolute;z-index:450;left:20px;bottom:42px;width:280px;max-height:calc(100% - 160px);display:flex;flex-direction:column;border-radius:12px;background:linear-gradient(135deg,#123744ed,#092837e6);box-shadow:0 10px 36px #00172255;backdrop-filter:blur(18px);overflow:hidden}.legend-heading{display:flex;align-items:center;gap:10px;padding:15px 16px;background:transparent;border:0;color:#e5f6fa;cursor:pointer;flex:none}.legend-heading b{font-size:13px;font-weight:600}.legend-heading span{margin-left:auto;font-size:11px;color:#82b7c5}.legend-content{padding:0 14px 14px;overflow:auto;scrollbar-width:thin;scrollbar-color:#457385 transparent}.geographic-topics p{font-size:11px;line-height:1.75;color:#a7c6cf;margin:0 0 12px}.topic-note{padding:10px 12px;border-radius:6px;background:#377b8e20}.legend-group{border-top:1px solid #7395a229;padding-top:12px;margin-top:12px}.legend-group h3{font-size:12px;line-height:1.6;margin:0 0 8px;font-weight:500;color:#d5e9ee}.topic-category{display:flex;align-items:center;gap:9px;padding:7px 4px;font-size:11px;cursor:pointer;border-radius:5px}.topic-category:hover{background:#43869c26}.geographic-topics input[type=checkbox]{width:14px;height:14px;accent-color:#39c7d5;flex:none;margin:0}.topic-category img,.source-symbol{width:26px;height:20px;border-radius:2px;object-fit:cover;flex:none;border:1px solid #c9e2e43b}.source-symbol{background:#e7a64333;box-sizing:border-box;border-color:#ebbf7380}.topic-category>span{display:flex;flex-wrap:wrap;column-gap:6px;flex:1;min-width:0;line-height:1.6}.topic-category b{font-weight:400}.topic-category small{font-size:10px;color:#eac37a;width:100%}.topic-category em{font-style:normal;font-variant-numeric:tabular-nums;color:#8cb3c0;font-size:10px}.legend-content footer{border-top:1px solid #7395a229;margin-top:12px;padding-top:12px;font-size:10px;line-height:1.8;color:#83a6b3}.topic-config{position:absolute;z-index:530;right:20px;top:82px;bottom:20px;width:350px;max-width:calc(100% - 40px);display:flex;flex-direction:column;background:linear-gradient(130deg,#103745f5,#092631f2);box-shadow:0 16px 50px #00131b66;border-radius:12px;backdrop-filter:blur(24px);overflow:hidden}.topic-config header{display:flex;align-items:center;justify-content:space-between;flex:none;padding:18px 20px;border-bottom:1px solid #7395a229}.topic-config header small{font-size:9px;letter-spacing:2px;color:#74b3c3}.topic-config h2{font-size:17px;margin:5px 0 0}.config-body{padding:18px;overflow:auto;scrollbar-width:thin;scrollbar-color:#457385 transparent}.config-body section+section{margin-top:22px}.config-body h3{font-size:13px;font-weight:500;display:flex;align-items:center;justify-content:space-between;margin:0 0 12px}.config-body h3 small{font-size:10px;color:#83a6b3}.config-body select{width:100%;max-width:none;margin-bottom:10px}.config-layer label{display:flex;gap:10px;align-items:center;padding:9px 0;cursor:pointer}.config-layer label>span{display:grid;gap:4px;flex:1;min-width:0}.config-layer b{font-size:12px;line-height:1.5;font-weight:400;overflow-wrap:anywhere}.config-layer small{font-size:10px;color:#83a6b3}.config-layer p[role=alert],p[role=alert]{color:#f1ae91}.config-layer button{border:0;background:transparent;color:#66d5ea;cursor:pointer}.topic-drawer-enter-active,.topic-drawer-leave-active{transition:opacity .2s ease,translate .2s ease}.topic-drawer-enter-from,.topic-drawer-leave-to{opacity:0;translate:15px 0}.pending-icon{animation:topic-spin 1.4s linear infinite}@keyframes topic-spin{to{rotate:360deg}}@media(prefers-reduced-motion:reduce){.topic-drawer-enter-active,.topic-drawer-leave-active{transition:none}.pending-icon{animation:none}}@media(max-width:1100px){.topic-title{top:80px;left:20px}.topic-tools{left:20px;right:20px}.topic-tools select{flex:1;min-width:0;max-width:none}.topic-legend{width:240px;max-height:calc(100% - 200px)}}
</style>
