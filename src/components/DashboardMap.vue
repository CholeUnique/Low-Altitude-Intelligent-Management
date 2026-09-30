<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import L from 'leaflet'
import type { GeoJsonObject } from 'geojson'
import 'leaflet/dist/leaflet.css'
import taizhouCityBoundary from '@/assets/geo/taizhou-city.json'
import taizhouDistrictBoundaries from '@/assets/geo/taizhou-districts.json'
import { listEnabledMapServices, type MapServiceItem } from '@/api/map-service'
import type { DashboardMapLayer, DashboardMapTask, DronePatrolRoute } from '@/types'
import {
  createMapServiceLayer,
  MAP_SERVICE_IMAGERY_PANE,
  MAP_SERVICE_VECTOR_PANE,
  type MapServiceLayerHandle,
} from '@/utils/map-service-layer'

const props = defineProps<{
  layers: DashboardMapLayer[]
  routes: DronePatrolRoute[]
  /** 从场景入口进入时，自动聚焦该场景实际任务范围。 */
  focusLayerId?: string
}>()

type BoundaryFeature = {
  geometry?: { coordinates?: unknown }
  properties?: { name?: string }
}

const GCJ_A = 6378245
const GCJ_EE = 0.006693421622965943

function outsideChina(longitude: number, latitude: number) {
  return longitude < 72.004 || longitude > 137.8347 || latitude < 0.8293 || latitude > 55.8271
}

function transformLatitude(longitude: number, latitude: number) {
  let result = -100 + 2 * longitude + 3 * latitude + .2 * latitude * latitude + .1 * longitude * latitude + .2 * Math.sqrt(Math.abs(longitude))
  result += (20 * Math.sin(6 * longitude * Math.PI) + 20 * Math.sin(2 * longitude * Math.PI)) * 2 / 3
  result += (20 * Math.sin(latitude * Math.PI) + 40 * Math.sin(latitude / 3 * Math.PI)) * 2 / 3
  result += (160 * Math.sin(latitude / 12 * Math.PI) + 320 * Math.sin(latitude * Math.PI / 30)) * 2 / 3
  return result
}

function transformLongitude(longitude: number, latitude: number) {
  let result = 300 + longitude + 2 * latitude + .1 * longitude * longitude + .1 * longitude * latitude + .1 * Math.sqrt(Math.abs(longitude))
  result += (20 * Math.sin(6 * longitude * Math.PI) + 20 * Math.sin(2 * longitude * Math.PI)) * 2 / 3
  result += (20 * Math.sin(longitude * Math.PI) + 40 * Math.sin(longitude / 3 * Math.PI)) * 2 / 3
  result += (150 * Math.sin(longitude / 12 * Math.PI) + 300 * Math.sin(longitude / 30 * Math.PI)) * 2 / 3
  return result
}

function wgs84ToGcj02(longitude: number, latitude: number): [number, number] {
  if (outsideChina(longitude, latitude)) return [longitude, latitude]
  let deltaLatitude = transformLatitude(longitude - 105, latitude - 35)
  let deltaLongitude = transformLongitude(longitude - 105, latitude - 35)
  const radianLatitude = latitude / 180 * Math.PI
  let magic = Math.sin(radianLatitude)
  magic = 1 - GCJ_EE * magic * magic
  const sqrtMagic = Math.sqrt(magic)
  deltaLatitude = deltaLatitude * 180 / ((GCJ_A * (1 - GCJ_EE)) / (magic * sqrtMagic) * Math.PI)
  deltaLongitude = deltaLongitude * 180 / (GCJ_A / sqrtMagic * Math.cos(radianLatitude) * Math.PI)
  return [longitude + deltaLongitude, latitude + deltaLatitude]
}

/** DataV GeoAtlas 使用 GCJ-02；天地图底图按 CGCS2000/WGS84 坐标显示。 */
function gcj02ToWgs84(longitude: number, latitude: number): [number, number] {
  if (outsideChina(longitude, latitude)) return [longitude, latitude]
  let wgsLongitude = longitude
  let wgsLatitude = latitude
  // 迭代反算比一次近似扣除更稳定，行政区边界可达到亚米级对齐精度。
  for (let index = 0; index < 6; index += 1) {
    const [gcjLongitude, gcjLatitude] = wgs84ToGcj02(wgsLongitude, wgsLatitude)
    wgsLongitude -= gcjLongitude - longitude
    wgsLatitude -= gcjLatitude - latitude
  }
  return [wgsLongitude, wgsLatitude]
}

function convertBoundaryCoordinates(value: unknown): unknown {
  if (!Array.isArray(value)) return value
  if (value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') {
    const [longitude, latitude] = gcj02ToWgs84(value[0], value[1])
    return [longitude, latitude, ...value.slice(2)]
  }
  return value.map(convertBoundaryCoordinates)
}

function convertAdministrativeBoundary<T extends { features?: BoundaryFeature[] }>(source: T): T {
  return {
    ...source,
    features: source.features?.map((feature) => ({
      ...feature,
      geometry: feature.geometry
        ? { ...feature.geometry, coordinates: convertBoundaryCoordinates(feature.geometry.coordinates) }
        : feature.geometry,
    })),
  } as T
}

const TAIZHOU_CENTER: L.LatLngTuple = [32.4555, 119.9255]
const TAIZHOU_ZOOM = 10
const taizhouCityBoundaryWgs84 = convertAdministrativeBoundary(taizhouCityBoundary)
const taizhouDistrictBoundariesWgs84 = convertAdministrativeBoundary(taizhouDistrictBoundaries)
const HAILING_DISTRICT = (taizhouDistrictBoundariesWgs84 as {
  features?: Array<{ properties?: { name?: string } }>
}).features?.find((feature) => feature.properties?.name === '海陵区')
const token = import.meta.env.VITE_TIANDITU_TOKEN
const showAdministrativeBoundaries = false
const subdomains = ['0', '1', '2', '3', '4', '5', '6', '7']
const container = ref<HTMLElement>()
const mapReady = ref(false)
const mapError = ref('')
const mapMode = ref<'vector' | 'image'>('image')
const mapServices = ref<MapServiceItem[]>([])
const mapServicesLoading = ref(false)
const mapServicesError = ref('')
const visibleMapServiceIds = ref<string[]>([])
interface VectorFilterPanel {
  serviceId: string
  serviceName: string
  fieldLabel: string
  items: Array<{ value: string; checked: boolean }>
  apply: (values: string[]) => void
}
const vectorFilterPanels = ref<VectorFilterPanel[]>([])
const searchExpanded = ref(false)
const searchKeyword = ref('')
const searchInput = ref<HTMLInputElement>()
interface PlaceSearchResult {
  id: string
  name: string
  address: string
  longitude: number
  latitude: number
  bounds?: [number, number, number, number]
  level?: number
}
interface TiandituSearchResponse {
  pois?: Array<Record<string, unknown>>
  area?: Array<Record<string, unknown>>
  statistics?: { priorityCitys?: Array<Record<string, unknown>>; allAdmins?: Array<Record<string, unknown>> }
}
const placeSearchResults = ref<PlaceSearchResult[]>([])
const placeSearchLoading = ref(false)
const placeSearchError = ref('')
const toolMessage = ref('')
const measureOpen = ref(false)
const baseMapOpen = ref(false)
const activeTool = ref<'distance' | 'area' | 'marker' | null>(null)
const measureResult = ref('')
const scaleWidth = ref(96)
const scaleLabel = ref('5 km')
const taskSearchResults = computed(() => {
  const keyword = searchKeyword.value.trim().toLowerCase()
  if (!keyword) return []
  return props.layers.flatMap((layer) => layer.tasks.map((task) => ({ ...task, layerName: layer.name })))
    .filter((task) => `${task.name}${task.taskId}${task.area}`.toLowerCase().includes(keyword))
    .slice(0, 6)
})
const showSearchSuggestions = computed(() => searchExpanded.value && Boolean(searchKeyword.value.trim()))

let map: L.Map | undefined
let resizeObserver: ResizeObserver | undefined
let resizeFrame: number | undefined
let baseLayer: L.TileLayer | undefined
let labelLayer: L.TileLayer | undefined
let measureGroup: L.LayerGroup | undefined
let annotationGroup: L.LayerGroup | undefined
let locationGroup: L.LayerGroup | undefined
let administrativeBoundaryGroup: L.LayerGroup | undefined
let hailingBoundaryGroup: L.LayerGroup | undefined
let toolMessageTimer: ReturnType<typeof window.setTimeout> | undefined
let sceneFocusTimer: ReturnType<typeof window.setTimeout> | undefined
let overviewFocusTimer: ReturnType<typeof window.setTimeout> | undefined
let searchFocusTimer: ReturnType<typeof window.setTimeout> | undefined
let placeSearchRequestVersion = 0
let searchPlaceMarker: L.CircleMarker | undefined
let focusedSceneLayerId = ''
let overviewFocused = false
const mapServiceLayers = new Map<string, MapServiceLayerHandle>()
const loadingMapServiceIds = new Set<string>()
let measurePoints: L.LatLng[] = []

function dismissToolMessage() {
  if (toolMessageTimer) window.clearTimeout(toolMessageTimer)
  toolMessageTimer = undefined
  toolMessage.value = ''
}

function showToolMessage(message: string, duration = 3200) {
  if (toolMessageTimer) window.clearTimeout(toolMessageTimer)
  toolMessage.value = message
  toolMessageTimer = window.setTimeout(() => {
    toolMessageTimer = undefined
    toolMessage.value = ''
  }, duration)
}

function tileUrl(layer: 'vec' | 'img' | 'cva' | 'cia') {
  return `https://t{s}.tianditu.gov.cn/${layer}_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layer}&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILECOL={x}&TILEROW={y}&TILEMATRIX={z}&tk=${token}`
}

function addBaseLayers(mode: 'vector' | 'image') {
  if (!map || !token) return
  baseLayer?.remove()
  labelLayer?.remove()
  const base = mode === 'vector' ? 'vec' : 'img'
  const label = mode === 'vector' ? 'cva' : 'cia'
  let loadedTiles = 0
  baseLayer = L.tileLayer(tileUrl(base), { subdomains, maxNativeZoom: 18, maxZoom: 22 })
  labelLayer = L.tileLayer(tileUrl(label), { subdomains, maxNativeZoom: 18, maxZoom: 22, pane: 'labels' })
  baseLayer.on('tileload', () => {
    loadedTiles += 1
    if (loadedTiles === 1) {
      mapReady.value = true
      mapError.value = ''
    }
  })
  baseLayer.on('tileerror', () => {
    if (!loadedTiles) mapError.value = '天地图加载失败，请检查网络或 Token 域名白名单'
  })
  baseLayer.addTo(map)
  labelLayer.addTo(map)
}

async function loadMapServices() {
  mapServicesLoading.value = true
  mapServicesError.value = ''
  try {
    const services = await listEnabledMapServices()
    const activeIds = new Set(services.map((service) => String(service.id)))
    mapServiceLayers.forEach((handle, id) => {
      if (activeIds.has(id)) return
      handle.layer.remove()
      mapServiceLayers.delete(id)
    })
    visibleMapServiceIds.value = visibleMapServiceIds.value.filter((id) => activeIds.has(id))
    vectorFilterPanels.value = vectorFilterPanels.value.filter((panel) => activeIds.has(panel.serviceId))
    mapServices.value = services
  } catch (reason) {
    mapServices.value = []
    mapServicesError.value = reason instanceof Error ? reason.message : '地图服务列表加载失败'
  } finally {
    mapServicesLoading.value = false
  }
}

async function toggleMapService(service: MapServiceItem) {
  if (!map) return
  const id = String(service.id)
  const existing = mapServiceLayers.get(id)
  if (existing && map.hasLayer(existing.layer)) {
    existing.layer.remove()
    visibleMapServiceIds.value = visibleMapServiceIds.value.filter((layerId) => layerId !== id)
    vectorFilterPanels.value = vectorFilterPanels.value.filter((panel) => panel.serviceId !== id)
    return
  }
  if (loadingMapServiceIds.has(id)) return
  loadingMapServiceIds.add(id)
  try {
    const handle = existing || await createMapServiceLayer(service)
    mapServiceLayers.set(id, handle)
    handle.layer.addTo(map)
    if (!visibleMapServiceIds.value.includes(id)) visibleMapServiceIds.value = [...visibleMapServiceIds.value, id]
    if (handle.categoryFilter && !vectorFilterPanels.value.some((panel) => panel.serviceId === id)) {
      vectorFilterPanels.value = [...vectorFilterPanels.value, {
        serviceId: id,
        serviceName: service.name,
        fieldLabel: handle.categoryFilter.fieldLabel,
        items: handle.categoryFilter.values.map((value) => ({ value, checked: true })),
        apply: handle.categoryFilter.setVisibleValues,
      }]
    }
    if (handle.bounds?.isValid()) {
      // 用户当前视窗已完全位于新图层覆盖范围内时保持原视角，避免每次勾选
      // 图层都打断正在进行的放大查看或平移操作。
      if (!handle.bounds.contains(map.getBounds())) {
        map.invalidateSize({ pan: false })
        map.fitBounds(handle.bounds, { padding: [48, 48], maxZoom: 19, animate: true })
      }
    } else {
      showToolMessage(`${service.name} 未提供有效影像范围，已显示但无法自动定位`)
    }
  } catch (reason) {
    showToolMessage(reason instanceof Error ? reason.message : `${service.name} 加载失败`, 5000)
  } finally {
    loadingMapServiceIds.delete(id)
  }
}

function applyVectorCategoryFilter(panel: VectorFilterPanel) {
  panel.apply(panel.items.filter((item) => item.checked).map((item) => item.value))
}

function allVectorCategoriesChecked(panel: VectorFilterPanel) {
  return panel.items.length > 0 && panel.items.every((item) => item.checked)
}

function someVectorCategoriesChecked(panel: VectorFilterPanel) {
  return panel.items.some((item) => item.checked) && !allVectorCategoriesChecked(panel)
}

function toggleAllVectorCategories(panel: VectorFilterPanel, event: Event) {
  const checked = (event.target as HTMLInputElement).checked
  panel.items.forEach((item) => { item.checked = checked })
  applyVectorCategoryFilter(panel)
}

function focusSceneLayer() {
  if (!map || !props.focusLayerId) return
  const scene = props.layers.find((layer) => layer.id === props.focusLayerId)
  if (!scene) return
  const bounds = L.latLngBounds([])
  scene.tasks.forEach((task) => {
    const polygons = task.polygons?.length ? task.polygons : [task.polygon]
    polygons.forEach((points) => points.forEach((point) => bounds.extend([point[1], point[0]])))
  })
  if (!bounds.isValid()) return
  // 仅聚焦当前场景的真实任务边界；不以任务点或城市中心替代，避免看起来像定位偏移。
  map.invalidateSize({ pan: false })
  map.fitBounds(bounds, { padding: [48, 48], maxZoom: 18, animate: false })
  focusedSceneLayerId = props.focusLayerId
}

function scheduleSceneFocus() {
  if (!props.focusLayerId) return
  if (sceneFocusTimer) window.clearTimeout(sceneFocusTimer)
  // 场景入口会触发路由和地图重建。图层绘制、容器尺寸稳定后再聚焦，避免
  // 初始尺寸尚未计算时 fitBounds 被忽略。
  window.requestAnimationFrame(() => {
    focusSceneLayer()
    sceneFocusTimer = window.setTimeout(focusSceneLayer, 180)
  })
}

function focusHailingDistrict() {
  if (!map || props.focusLayerId || overviewFocused || !HAILING_DISTRICT) return
  const bounds = L.geoJSON(HAILING_DISTRICT as GeoJsonObject).getBounds()
  if (!bounds.isValid()) return
  map.invalidateSize({ pan: false })
  // 中间地图窗口按完整边界自适应，不再额外放大一级，避免默认视野过近。
  map.fitBounds(bounds, { padding: [36, 36], maxZoom: 13, animate: false })
  overviewFocused = true
}

function scheduleOverviewFocus() {
  if (props.focusLayerId || overviewFocused) return
  if (overviewFocusTimer) window.clearTimeout(overviewFocusTimer)
  // 只在单位总览地图初次挂载后定位一次；业务数据轮询不会再触发。
  overviewFocusTimer = window.setTimeout(() => {
    overviewFocusTimer = undefined
    focusHailingDistrict()
  }, 100)
}

function focusSearchResult(task: DashboardMapTask, clearKeyword = false) {
  if (!map) return
  const bounds = L.latLngBounds([])
  const polygons = task.polygons?.length ? task.polygons : [task.polygon]
  polygons.forEach((points) => points.forEach((point) => bounds.extend([point[1], point[0]])))
  if (bounds.isValid()) map.fitBounds(bounds, { padding: [70, 70], maxZoom: 18 })
  else map.setView([task.center[1], task.center[0]], 16, { animate: true })
  if (clearKeyword) searchKeyword.value = ''
}

function coordinates(value: unknown) {
  if (typeof value !== 'string') return
  const [longitude, latitude] = value.split(',').map(Number)
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return
  return { longitude: longitude!, latitude: latitude! }
}

function placeResult(item: Record<string, unknown>, index: number): PlaceSearchResult | undefined {
  const point = coordinates(item.lonlat)
  if (!point) return
  const rawBounds = typeof item.bound === 'string' ? item.bound.split(',').map(Number) : []
  const bounds = rawBounds.length === 4 && rawBounds.every(Number.isFinite)
    ? rawBounds as [number, number, number, number]
    : undefined
  const address = [item.province, item.city, item.county, item.address]
    .filter((value, position, values) => typeof value === 'string' && value.trim() && values.indexOf(value) === position)
    .join(' · ')
  return {
    id: String(item.hotPointID ?? item.adminCode ?? `${item.name ?? 'place'}-${index}`),
    name: String(item.name ?? '未命名地点'),
    address: address || String(item.typeName ?? '地名搜索结果'),
    longitude: point.longitude,
    latitude: point.latitude,
    bounds,
    level: Number.isFinite(Number(item.level)) ? Number(item.level) : undefined,
  }
}

async function searchPlaces(keyword: string) {
  const requestVersion = ++placeSearchRequestVersion
  if (!keyword || !token || !map) {
    placeSearchResults.value = []
    placeSearchLoading.value = false
    placeSearchError.value = ''
    return
  }
  placeSearchLoading.value = true
  placeSearchError.value = ''
  try {
    const postStr = JSON.stringify({
      keyWord: keyword,
      level: Math.max(1, Math.min(18, Math.round(map.getZoom()))),
      mapBound: '-180,-90,180,90',
      queryType: 7,
      start: 0,
      count: 8,
      show: 2,
    })
    const parameters = new URLSearchParams({ postStr, type: 'query', tk: token })
    const response = await fetch(`https://api.tianditu.gov.cn/v2/search?${parameters.toString()}`)
    if (!response.ok) throw new Error(`地点搜索请求失败（${response.status}）`)
    const payload = await response.json() as TiandituSearchResponse
    if (requestVersion !== placeSearchRequestVersion) return
    const candidates = [
      ...(Array.isArray(payload.area) ? payload.area : []),
      ...(Array.isArray(payload.pois) ? payload.pois : []),
      ...(Array.isArray(payload.statistics?.priorityCitys) ? payload.statistics!.priorityCitys! : []),
      ...(Array.isArray(payload.statistics?.allAdmins) ? payload.statistics!.allAdmins! : []),
    ]
    const seen = new Set<string>()
    placeSearchResults.value = candidates.flatMap((item, index) => {
      const result = placeResult(item, index)
      if (!result) return []
      const identity = `${result.name}-${result.longitude}-${result.latitude}`
      if (seen.has(identity)) return []
      seen.add(identity)
      return [result]
    }).slice(0, 8)
  } catch (reason) {
    if (requestVersion !== placeSearchRequestVersion) return
    placeSearchResults.value = []
    placeSearchError.value = reason instanceof Error ? reason.message : '地点搜索暂不可用'
  } finally {
    if (requestVersion === placeSearchRequestVersion) placeSearchLoading.value = false
  }
}

function focusPlaceResult(place: PlaceSearchResult) {
  if (!map) return
  searchPlaceMarker?.remove()
  searchPlaceMarker = L.circleMarker([place.latitude, place.longitude], {
    radius: 7,
    color: '#dffcff',
    weight: 2,
    fillColor: '#1dddec',
    fillOpacity: .92,
  }).addTo(map)
  const popup = document.createElement('div')
  const title = document.createElement('strong')
  const address = document.createElement('small')
  title.textContent = place.name
  address.textContent = place.address
  popup.append(title, address)
  searchPlaceMarker.bindPopup(popup).openPopup()
  if (place.bounds) {
    const [west, south, east, north] = place.bounds
    map.fitBounds([[south, west], [north, east]], { padding: [70, 70], maxZoom: 17 })
  } else {
    map.setView([place.latitude, place.longitude], Math.max(14, Math.min(place.level || 16, 18)), { animate: true })
  }
  searchKeyword.value = ''
}

function selectSearchResult(task: DashboardMapTask) {
  focusSearchResult(task, true)
}

async function toggleSearch() {
  searchExpanded.value = !searchExpanded.value
  if (!searchExpanded.value) {
    placeSearchRequestVersion += 1
    searchKeyword.value = ''
    placeSearchResults.value = []
    placeSearchError.value = ''
    return
  }
  await nextTick()
  searchInput.value?.focus()
}

function focusFirstSearchResult() {
  const task = taskSearchResults.value[0]
  if (task) focusSearchResult(task, true)
  else if (placeSearchResults.value[0]) focusPlaceResult(placeSearchResults.value[0])
}

function locateUser() {
  if (!map) return
  if (!navigator.geolocation) {
    showToolMessage('当前浏览器不支持定位')
    return
  }
  showToolMessage('正在获取当前位置…', 10000)
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      locationGroup?.clearLayers()
      const point = L.latLng(coords.latitude, coords.longitude)
      L.circle(point, { radius: Math.max(coords.accuracy, 20), color: '#33d9ff', fillOpacity: .12 }).addTo(locationGroup!)
      L.circleMarker(point, { radius: 7, color: '#fff', fillColor: '#17bce0', fillOpacity: 1, weight: 2 })
        .bindPopup(`当前位置<br>定位精度约 ${Math.round(coords.accuracy)} 米`).addTo(locationGroup!).openPopup()
      map?.setView(point, 15)
      showToolMessage('定位成功')
    },
    () => { showToolMessage('定位失败，请允许浏览器访问位置') },
    { enableHighAccuracy: true, timeout: 10000 },
  )
}

function resetNorth() {
  map?.setView(TAIZHOU_CENTER, TAIZHOU_ZOOM)
  showToolMessage('已回到江苏泰州，地图保持正北向上')
}

function startTool(tool: 'distance' | 'area' | 'marker') {
  activeTool.value = activeTool.value === tool ? null : tool
  measureOpen.value = tool !== 'marker'
  baseMapOpen.value = false
  measurePoints = []
  if (tool !== 'marker') measureGroup?.clearLayers()
  measureResult.value = tool === 'distance' ? '点击地图连续选取测距点，双击结束' : tool === 'area' ? '点击地图绘制范围，双击结束' : '点击地图添加可拖动标注'
}

function geodesicArea(points: L.LatLng[]) {
  const radius = 6378137
  let area = 0
  points.forEach((point, index) => {
    const next = points[(index + 1) % points.length]!
    area += (next.lng - point.lng) * Math.PI / 180 * (2 + Math.sin(point.lat * Math.PI / 180) + Math.sin(next.lat * Math.PI / 180))
  })
  return Math.abs(area * radius * radius / 2)
}

function formatDistance(metres: number) {
  return metres >= 1000 ? `${(metres / 1000).toFixed(2)} 公里` : `${metres.toFixed(1)} 米`
}

function formatArea(squareMetres: number) {
  return squareMetres >= 1_000_000 ? `${(squareMetres / 1_000_000).toFixed(2)} 平方公里` : `${squareMetres.toFixed(0)} 平方米`
}

function redrawMeasurement() {
  if (!map || !measureGroup) return
  measureGroup.clearLayers()
  measurePoints.forEach((point, index) => {
    L.circleMarker(point, { radius: 4, color: '#fff', fillColor: '#21dff1', fillOpacity: 1, weight: 1 })
      .bindTooltip(String(index + 1), { permanent: true, className: 'measure-index', direction: 'top' }).addTo(measureGroup!)
  })
  if (activeTool.value === 'distance' && measurePoints.length > 1) {
    L.polyline(measurePoints, { color: '#22e5f4', weight: 3 }).addTo(measureGroup)
    const distance = measurePoints.slice(1).reduce((sum, point, index) => sum + map!.distance(measurePoints[index]!, point), 0)
    measureResult.value = `测量距离：${formatDistance(distance)}`
  }
  if (activeTool.value === 'area' && measurePoints.length > 2) {
    L.polygon(measurePoints, { color: '#38e7c0', fillColor: '#1abf9b', fillOpacity: .22, weight: 2 }).addTo(measureGroup)
    measureResult.value = `测量面积：${formatArea(geodesicArea(measurePoints))}`
  }
}

function addAnnotation(point: L.LatLng) {
  const icon = L.divIcon({ className: 'custom-annotation', html: '<span>⌖</span>', iconSize: [27, 27], iconAnchor: [13, 26] })
  L.marker(point, { icon, draggable: true })
    .bindPopup(`地图标注<br>${point.lng.toFixed(6)}, ${point.lat.toFixed(6)}`)
    .addTo(annotationGroup!).openPopup()
}

function clearMeasurements() {
  measurePoints = []
  measureGroup?.clearLayers()
  activeTool.value = null
  measureResult.value = ''
  showToolMessage('已清除测量结果')
}

function clearAnnotations() {
  annotationGroup?.clearLayers()
  if (activeTool.value === 'marker') activeTool.value = null
  showToolMessage('已清除全部标注')
}

function switchMode(mode: 'vector' | 'image') {
  mapMode.value = mode
  addBaseLayers(mode)
  baseMapOpen.value = false
}

function renderAdministrativeBoundaries() {
  if (!map) return
  administrativeBoundaryGroup?.remove()
  administrativeBoundaryGroup = L.layerGroup()
  L.geoJSON(taizhouDistrictBoundariesWgs84 as GeoJsonObject, {
    pane: 'administrative-boundaries',
    style: {
      color: '#2bd8ff',
      weight: 2.5,
      opacity: 1,
      fillColor: '#66c7ff',
      fillOpacity: .25,
    },
  }).addTo(administrativeBoundaryGroup)
  L.geoJSON(taizhouCityBoundaryWgs84 as GeoJsonObject, {
    pane: 'administrative-boundaries',
    style: {
      color: '#2bd8ff',
      weight: 2.5,
      opacity: 1,
      fillOpacity: 0,
      className: 'taizhou-city-boundary',
    },
  }).addTo(administrativeBoundaryGroup)
  administrativeBoundaryGroup.addTo(map)
}

function renderHailingBoundary() {
  hailingBoundaryGroup?.remove()
  hailingBoundaryGroup = undefined
  if (!map || props.focusLayerId || !HAILING_DISTRICT) return
  hailingBoundaryGroup = L.layerGroup()
  L.geoJSON(HAILING_DISTRICT as GeoJsonObject, {
    pane: 'administrative-boundaries',
    interactive: false,
    style: {
      color: '#63d6ff',
      weight: 3.5,
      opacity: 1,
      fill: false,
      fillOpacity: 0,
      lineCap: 'round',
      lineJoin: 'round',
      className: 'hailing-boundary-glow',
    },
  }).addTo(hailingBoundaryGroup)
  hailingBoundaryGroup.addTo(map)
}

function updateScale() {
  if (!map) return
  const referenceWidth = 110
  const centerY = map.getSize().y / 2
  const left = map.containerPointToLatLng([0, centerY])
  const right = map.containerPointToLatLng([referenceWidth, centerY])
  const metres = map.distance(left, right)
  const magnitude = 10 ** Math.floor(Math.log10(metres))
  const niceDistance = [1, 2, 5].reduce((best, factor) => {
    const candidate = factor * magnitude
    return candidate <= metres && candidate > best ? candidate : best
  }, magnitude / 10)
  scaleWidth.value = Math.max(34, Math.round(referenceWidth * niceDistance / metres))
  scaleLabel.value = niceDistance >= 1000 ? `${niceDistance / 1000} km` : `${niceDistance} m`
}

async function initMap() {
  if (!container.value) return
  if (!token) {
    mapError.value = '未配置天地图 Token'
    return
  }
  try {
    await nextTick()
    map = L.map(container.value, {
      center: TAIZHOU_CENTER,
      zoom: TAIZHOU_ZOOM,
      maxZoom: 22,
      zoomControl: false,
      attributionControl: false,
      doubleClickZoom: false,
      preferCanvas: true,
    })
    const labelsPane = map.createPane('labels')
    labelsPane.style.zIndex = '250'
    labelsPane.style.pointerEvents = 'none'
    const mapServiceImageryPane = map.createPane(MAP_SERVICE_IMAGERY_PANE)
    mapServiceImageryPane.style.zIndex = '225'
    mapServiceImageryPane.style.pointerEvents = 'none'
    const mapServiceVectorPane = map.createPane(MAP_SERVICE_VECTOR_PANE)
    mapServiceVectorPane.style.zIndex = '335'
    mapServiceVectorPane.style.pointerEvents = 'none'
    const boundariesPane = map.createPane('administrative-boundaries')
    boundariesPane.style.zIndex = '350'
    boundariesPane.style.pointerEvents = 'none'
    measureGroup = L.layerGroup().addTo(map)
    annotationGroup = L.layerGroup().addTo(map)
    locationGroup = L.layerGroup().addTo(map)
    addBaseLayers('image')
    if (showAdministrativeBoundaries) renderAdministrativeBoundaries()
    renderHailingBoundary()
    if (props.focusLayerId) scheduleSceneFocus()
    else scheduleOverviewFocus()
    void loadMapServices()
    updateScale()
    map.on('moveend zoomend resize', updateScale)
    map.on('click', (event) => {
      if (activeTool.value === 'marker') addAnnotation(event.latlng)
      if (activeTool.value === 'distance' || activeTool.value === 'area') {
        measurePoints.push(event.latlng)
        redrawMeasurement()
      }
    })
    map.on('dblclick', () => { activeTool.value = null })
    resizeObserver = new ResizeObserver(() => {
      if (resizeFrame !== undefined) window.cancelAnimationFrame(resizeFrame)
      resizeFrame = window.requestAnimationFrame(() => {
        map?.invalidateSize({ pan: false })
        updateScale()
      })
    })
    resizeObserver.observe(container.value)
    window.setTimeout(() => map?.invalidateSize(), 100)
  } catch {
    mapError.value = '地图初始化失败，请重新加载'
  }
}

function retryMap() {
  map?.remove()
  map = undefined
  mapError.value = ''
  initMap()
}

onMounted(initMap)
watch(() => props.layers, () => {
  if (!map) return
  // 旧业务场景只用于搜索和场景入口定位，不再作为地图图层自动绘制。
  if (props.focusLayerId && focusedSceneLayerId !== props.focusLayerId) scheduleSceneFocus()
}, { deep: true })
watch(() => props.focusLayerId, () => {
  focusedSceneLayerId = ''
  overviewFocused = false
  renderHailingBoundary()
  if (props.focusLayerId) scheduleSceneFocus()
  else scheduleOverviewFocus()
})
watch(searchKeyword, (value) => {
  if (searchFocusTimer) window.clearTimeout(searchFocusTimer)
  const keyword = value.trim().toLowerCase()
  if (!keyword) {
    placeSearchRequestVersion += 1
    placeSearchResults.value = []
    placeSearchLoading.value = false
    placeSearchError.value = ''
    return
  }
  searchFocusTimer = window.setTimeout(() => {
    const exact = taskSearchResults.value.find((task) =>
      [task.name, task.taskId, task.area].some((field) => field.toLowerCase() === keyword))
    if (exact) focusSearchResult(exact)
    void searchPlaces(value.trim())
  }, 260)
})
onBeforeUnmount(() => {
  if (toolMessageTimer) window.clearTimeout(toolMessageTimer)
  if (sceneFocusTimer) window.clearTimeout(sceneFocusTimer)
  if (overviewFocusTimer) window.clearTimeout(overviewFocusTimer)
  if (searchFocusTimer) window.clearTimeout(searchFocusTimer)
  if (resizeFrame !== undefined) window.cancelAnimationFrame(resizeFrame)
  resizeObserver?.disconnect()
  mapServiceLayers.forEach((handle) => handle.layer.remove())
  mapServiceLayers.clear()
  map?.remove()
})
</script>

<template>
  <div class="dashboard-map">
    <div ref="container" class="dashboard-map__canvas"></div>
    <div v-if="mapError" class="dashboard-map__empty"><span>{{ mapError }}</span><button @click="retryMap">重新加载</button></div>
    <div v-else-if="!mapReady" class="dashboard-map__loading">正在加载江苏泰州天地图…</div>

    <div class="layer-panel-stack">
      <aside class="layer-manager">
        <div class="tool-title"><b>图层管理</b><span class="tool-title-state">显示</span></div>
        <div class="layer-manager-list">
          <div v-if="mapServicesLoading" class="layer-panel-message">正在读取地图服务…</div>
          <div v-else-if="mapServicesError" class="layer-panel-message error">{{ mapServicesError }}</div>
          <div v-else-if="!mapServices.length" class="layer-panel-message">暂无已启用的地图服务</div>
          <template v-else>
            <button v-for="service in mapServices" :key="service.id" class="layer-row map-service-row" :class="{ active: visibleMapServiceIds.includes(String(service.id)) }" :title="service.name" @click="toggleMapService(service)">
              <span><b>{{ service.name }}</b></span><em>{{ visibleMapServiceIds.includes(String(service.id)) ? '●' : '○' }}</em>
            </button>
          </template>
        </div>
      </aside>

      <aside v-if="vectorFilterPanels.length" class="parcel-type-panel">
        <div class="tool-title"><b>地块类型</b></div>
        <section v-for="panel in vectorFilterPanels" :key="panel.serviceId" class="parcel-filter-group">
          <div class="parcel-filter-heading"><b>{{ panel.serviceName }}</b><small>{{ panel.fieldLabel }}</small></div>
          <label class="parcel-filter-row parcel-filter-all">
            <span>全部地块</span>
            <input
              type="checkbox"
              :checked="allVectorCategoriesChecked(panel)"
              :indeterminate="someVectorCategoriesChecked(panel)"
              @change="toggleAllVectorCategories(panel, $event)"
            />
          </label>
          <label v-for="item in panel.items" :key="item.value" class="parcel-filter-row">
            <span>{{ item.value }}</span>
            <input v-model="item.checked" type="checkbox" @change="applyVectorCategoryFilter(panel)" />
          </label>
        </section>
      </aside>
    </div>

    <div class="map-search" :class="{ expanded: searchExpanded }">
      <input v-if="searchExpanded" ref="searchInput" v-model="searchKeyword" placeholder="搜索任务名称、编号或地点" @keydown.enter.prevent="focusFirstSearchResult" @keydown.esc="toggleSearch" />
      <button class="map-search-toggle" type="button" :aria-label="searchExpanded ? '收起地图搜索' : '展开地图搜索'" :title="searchExpanded ? '收起搜索' : '搜索任务'" @click="toggleSearch">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="5.5"/><path d="m15 15 4.5 4.5"/></svg>
      </button>
      <div v-if="showSearchSuggestions" class="search-results" aria-live="polite">
        <template v-if="taskSearchResults.length">
          <div class="search-result-title">相关任务</div>
          <button v-for="task in taskSearchResults" :key="task.taskId" @click="selectSearchResult(task)"><b>{{ task.name }}</b><small>{{ task.taskId }} · {{ task.area }}</small></button>
        </template>
        <template v-if="placeSearchResults.length">
          <div class="search-result-title">可能的地点</div>
          <button v-for="place in placeSearchResults" :key="place.id" @click="focusPlaceResult(place)"><b>{{ place.name }}</b><small>{{ place.address }}</small></button>
        </template>
        <p v-if="placeSearchLoading">正在搜索地点…</p>
        <p v-else-if="placeSearchError">{{ placeSearchError }}</p>
        <p v-else-if="!taskSearchResults.length && !placeSearchResults.length">未找到相关任务或地点</p>
      </div>
    </div>

    <aside class="map-tools">
      <div class="map-mode-switch" aria-label="底图选择">
        <button :class="{ active: mapMode === 'image' }" title="切换卫星影像" @click="switchMode('image')"><i class="mode-indicator"></i><span>卫星地图</span></button>
        <button :class="{ active: mapMode === 'vector' }" title="切换电子地图" @click="switchMode('vector')"><i class="mode-indicator"></i><span>电子地图</span></button>
      </div>
      <button title="当前位置" @click="locateUser"><i>⌖</i><span>定位</span></button>
      <button title="回到泰州并保持正北" @click="resetNorth"><i class="compass">N</i><span>指南针</span></button>
      <button :class="{ active: measureOpen }" title="测量工具" @click="measureOpen = !measureOpen"><i>╱</i><span>测量</span></button>
      <div v-if="measureOpen" class="tool-submenu right-submenu">
        <button :class="{ active: activeTool === 'distance' }" @click="startTool('distance')">距离测量</button>
        <button :class="{ active: activeTool === 'area' }" @click="startTool('area')">面积测量</button>
        <button @click="clearMeasurements">清除测量</button>
      </div>
      <button :class="{ active: activeTool === 'marker' }" title="添加标注" @click="startTool('marker')"><i>⚑</i><span>标注</span></button>
      <button title="清除标注" @click="clearAnnotations"><i>×</i><span>清除</span></button>
      <button @click="map?.zoomIn()"><i>＋</i><span>放大</span></button>
      <button @click="map?.zoomOut()"><i>－</i><span>缩小</span></button>
    </aside>

    <div v-if="measureResult" class="measure-result">{{ measureResult }}</div>
    <Transition name="tool-message"><div v-if="toolMessage" class="tool-message" @click="dismissToolMessage">{{ toolMessage }}　×</div></Transition>
    <div class="map-scale" :style="{ width: `${scaleWidth}px` }" :aria-label="`比例尺 ${scaleLabel}`"><b>{{ scaleLabel }}</b><i></i></div>
  </div>
</template>

<style scoped lang="scss">
.dashboard-map { position: relative; width: 100%; height: 100%; overflow: hidden; background: #031a31; }.dashboard-map__canvas { position: absolute; inset: 0; }
.dashboard-map__empty,.dashboard-map__loading { position: absolute; z-index: 700; inset: 0; display: grid; place-content: center; gap: 12px; justify-items: center; color: #56ddef; background: #031a31e8; font-size: 15px; }.dashboard-map__empty button { padding: 6px 14px; color: #d8faff; background: #075477; border: 1px solid #24cbe3; cursor: pointer; }
.layer-panel-stack { position: absolute; z-index: 500; top: 80px; left: 10px; width: 255px; height: calc(100% - 90px); display: flex; flex-direction: column; gap: 8px; }
.layer-manager { position: relative; width: 100%; max-height: calc(100% - 20px); overflow-y: auto; color: #bde6ef; background: #03182eed; border: 1px solid #0b6189; box-shadow: 0 0 14px #00a7d52b; }.tool-title { min-height: 34px; display: flex; align-items: center; justify-content: space-between; padding: 6px 8px; background: #06476b; border-bottom: 1px solid #0d6388; font-size: 15px; }.tool-title button { padding: 2px 4px; color: #7bdcea; background: transparent; border: 0; font-size: 12px; cursor: pointer; }
.layer-row { width: 100%; display: grid; grid-template-columns: 8px 1fr auto; align-items: center; gap: 7px; padding: 7px 8px; color: #6f99aa; background: transparent; border: 0; border-bottom: 1px solid #0a3e59; text-align: left; cursor: pointer; }.layer-row:hover,.layer-row.active { color: #d6f8ff; background: #07567866; }.layer-row>i { width: 7px; height: 7px; border-radius: 50%; box-shadow: 0 0 6px currentColor; }.layer-row span,.layer-row b,.layer-row small { min-width: 0; display: block; }.layer-row b { overflow: hidden; font-size: 14px; text-overflow: ellipsis; white-space: nowrap; }.layer-row small { margin-top: 3px; color: #52798a; font-size: 11px; }.layer-row em { color: #39ddef; font-size: 14px; font-style: normal; }.layer-section-title { padding: 5px 8px; color: #6591a3; background: #04243d; font-size: 12px; }.route-symbol { width: 12px!important; height: 2px!important; border-radius: 0!important; background: repeating-linear-gradient(90deg,#ff4d5b 0 3px,transparent 3px 5px)!important; }
.map-search { position: absolute; z-index: 550; top: 10px; right: 70px; width: 42px; min-height: 31px; display: flex; align-items: center; padding: 0; color: #55dff3; background: #031a31ef; border: 1px solid #11618a; box-shadow: 0 0 10px #00a9de1f; transition: width .18s ease, padding .18s ease; }.map-search.expanded { width: 270px; padding: 0 9px; }.map-search input { min-width: 0; height: 29px; flex: 1; border: 0; outline: 0; color: #c6edf7; background: transparent; font-size: 14px; }.map-search-toggle { width: 40px; height: 100%; flex: 0 0 40px; padding: 0; color: currentColor; background: transparent; border: 0; cursor: pointer; font-size: 23px; line-height: 1; transform: scaleX(-1); }.search-results { position: absolute; left: -1px; right: -1px; top: 31px; background: #031a31f5; border: 1px solid #11618a; }.search-results button { width: 100%; padding: 7px 9px; color: #bfe8f1; background: transparent; border: 0; border-bottom: 1px solid #0b405c; text-align: left; cursor: pointer; }.search-results button:hover { background: #075479; }.search-results b,.search-results small { display: block; font-size: 14px; }.search-results small { margin-top: 3px; color: #5c8293; font-size: 11px; }
.map-tools { position: absolute; z-index: 600; right: 10px; top: 10px; width: 50px; display: grid; gap: 4px; }.map-tools>button { min-height: 40px; display: grid; place-items: center; gap: 2px; padding: 4px; color: #84b2c3; background: #031a30ed; border: 1px solid #155a7c; cursor: pointer; }.map-tools>button:hover,.map-tools>button.active { color: #fff; border-color: #24cbe3; background: #075477; }.map-tools i { font-size: 16px; font-style: normal; }.map-tools span { font-size: 11px; }.compass { width: 20px; height: 20px; display: grid; place-items: center; border: 1px solid #31d9e9; border-radius: 50%; color: #ff7180; font-size: 14px!important; }.tool-submenu { position: absolute; top: 88px; right: 55px; width: 82px; padding: 4px; background: #031a31f5; border: 1px solid #157298; }.tool-submenu button { width: 100%; padding: 7px; color: #88b7c7; background: transparent; border: 0; text-align: left; font-size: 12px; cursor: pointer; }.tool-submenu button:hover,.tool-submenu button.active { color: #fff; background: #08698e; }.base-submenu { top: 220px; }
.measure-result,.tool-message { position: absolute; z-index: 550; left: 50%; bottom: 12px; transform: translateX(-50%); padding: 7px 12px; color: #c8f8ff; background: #03223aef; border: 1px solid #18a2c1; font-size: 14px; box-shadow: 0 0 10px #12bbd544; }.tool-message { bottom: 46px; cursor: pointer; }.tool-message-enter-active,.tool-message-leave-active { transition: opacity .2s ease, transform .2s ease; }.tool-message-enter-from,.tool-message-leave-to { opacity: 0; transform: translate(-50%, 6px); }.map-scale { position: absolute; z-index: 500; right: 68px; bottom: 7px; padding: 4px 8px; color: #77a9b9; background: #021728cc; font-size: 12px; }
:deep(.business-task-marker),:deep(.business-drone-marker),:deep(.custom-annotation) { background: transparent; border: 0; }:deep(.business-task-marker span) { width: 23px; height: 23px; display: grid; place-items: center; color: white; background: color-mix(in srgb, var(--marker-color), #062239 35%); border: 2px solid var(--marker-color); border-radius: 50% 50% 50% 5px; transform: rotate(-45deg); box-shadow: 0 0 10px var(--marker-color); font-size: 14px; }:deep(.business-drone-marker) { display: flex; align-items: center; gap: 4px; color: #79eff9; }:deep(.business-drone-marker span) { width: 24px; height: 24px; display: grid; place-items: center; background: #087b9e; border: 1px solid #4defff; border-radius: 50%; box-shadow: 0 0 10px #22e5f4; }:deep(.business-drone-marker b) { padding: 2px 4px; background: #03233ddd; font-size: 12px; white-space: nowrap; }:deep(.business-task-label),:deep(.measure-index) { color: #c9f7ff; background: #03223ddd; border: 1px solid #17698e; box-shadow: none; border-radius: 2px; font: 11px "Microsoft YaHei"; }:deep(.leaflet-popup-content-wrapper),:deep(.leaflet-popup-tip) { color: #d9f8ff; background: #061d34; border: 1px solid #1685ad; border-radius: 2px; }:deep(.business-popup strong),:deep(.business-popup span),:deep(.business-popup small) { display: block; }:deep(.business-popup span) { margin-top: 5px; color: #8db5c3; font-size: 14px; }:deep(.business-popup small) { margin-top: 6px; color: #5d899b; }:deep(.custom-annotation span) { width: 25px; height: 25px; display: grid; place-items: center; color: #fff; background: #e86835; border: 2px solid #ffd7a8; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); box-shadow: 0 0 8px #ff8a45; }

/* Compact, grouped controls keep the map surface visually open. */
.layer-manager { width: 126px; max-height: calc(100% - 52px); overflow: visible; border: 0; background: transparent; box-shadow: none; }
.tool-title,.layer-section-title { min-height: 26px; padding: 0 8px; color: #bff3ff; background: linear-gradient(90deg, #056ea7, #073f6d); border: 1px solid #1688bf; font-size: 12px; }
.tool-title { justify-content: space-between; }.tool-title button { padding: 1px 2px; color: #91e6ff; font-size: 10px; }
.layer-row { min-height: 27px; grid-template-columns: 7px 1fr auto; gap: 5px; padding: 4px 7px; border: 1px solid #0d5278; border-top: 0; background: #031c37e8; }.layer-row b { font-size: 12px; }.layer-row em { font-size: 10px; }.layer-row>i { width: 6px; height: 6px; }.layer-section-title { margin-top: 7px; }
.quick-tools { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid #0d5278; border-top: 0; background: #031c37e8; }.quick-tools button { min-height: 33px; display: grid; grid-template-columns: 16px 1fr; align-items: center; gap: 3px; padding: 4px 6px; color: #9bcfe4; background: transparent; border: 0; border-right: 1px solid #0d5278; border-bottom: 1px solid #0d5278; font-size: 11px; cursor: pointer; }.quick-tools button:nth-child(2n) { border-right: 0; }.quick-tools button:last-child { grid-column: 1 / 3; }.quick-tools button:hover,.quick-tools button.active { color: white; background: #08698e; }.quick-tools i { color: #5ae1f4; font-size: 14px; font-style: normal; }
.layer-submenu { top: auto; right: auto; left: 132px; bottom: 0; width: 96px; }.tool-submenu { z-index: 650; }
.map-search { top: 10px; right: 10px; width: 260px; min-height: 34px; }.map-search input { height: 32px; font-size: 12px; }
.map-tools { top: 52px; right: 10px; width: 72px; gap: 4px; }.map-tools>button { min-height: 36px; grid-template-columns: 20px 1fr; justify-content: start; padding: 4px 6px; }.map-tools i { font-size: 14px; }.map-tools span { font-size: 11px; }.compass { width: 18px; height: 18px; font-size: 12px!important; }

/* The layer panel is the only left-side control; operational tools form one right-side rail. */
.layer-manager { width: 100%; height: auto; max-height: min(350px,48vh); display: flex; flex: 0 0 auto; flex-direction: column; transform: none; overflow: hidden; border: 1px solid #1688bf; border-radius: 14px; background: #031c37b8; box-shadow: 0 0 18px #00a7d534; }.layer-manager-list{min-height:0;overflow-x:hidden;overflow-y:auto;scrollbar-color:#1688bf #031c37;scrollbar-width:thin}.tool-title { min-height: 46px; flex:0 0 46px; padding: 0 15px; border: 0; border-bottom: 1px solid #1688bf; background: linear-gradient(90deg, #056ea7c9, #073f6dc9); font-size: 18px; }.tool-title button { font-size: 14px; }.layer-row { box-sizing: border-box; min-height: 43px; flex: 0 0 43px; grid-template-columns: 18px 1fr auto; gap: 10px; padding: 9px 16px; border: 0; border-bottom: 1px solid #0d5278; background: #031c37b8; }.layer-row:last-child { border-bottom: 0; }.layer-row b { font-size: 17px; }.layer-row em { width: 13px; height: 13px; display: block; border: 1.5px solid #75cbe9; border-radius: 50%; font-size: 0; transform: translateX(-8px); }.layer-row.active em { border-color: #c3f8ff; background: #49d9f4; box-shadow: 0 0 7px #27dfff; }.layer-row>i { width: 16px; height: 16px; border-radius: 1px; box-shadow: none; }.layer-row.disabled { cursor: not-allowed; opacity: .55; }.dom-imagery-symbol { width: 16px!important; height: 2px!important; border: 0!important; border-radius: 0!important; background: repeating-linear-gradient(90deg,#20b9ff 0 4px,transparent 4px 7px)!important; }
.layer-section-title { min-height: 36px; flex: 0 0 36px; display: flex; align-items: center; margin: 0; padding: 0 15px; color: #a9dce9; border: 0; border-bottom: 1px solid #1688bf; background: linear-gradient(90deg,#064367d9,#032a49d9); font-size: 14px; font-weight: 700; letter-spacing: .5px; }.layer-row.jiulong-imagery-row { min-height: 43px; height: auto; flex: 0 0 auto; grid-template-columns: minmax(0,1fr) auto; }.layer-row.jiulong-imagery-row b { overflow: visible; white-space: normal; line-height: 1.35; text-overflow: clip; }.jiulong-vector-symbol { width: 16px!important; height: 2px!important; border: 0!important; border-radius: 0!important; background: #ff3f4d!important; box-shadow: 0 0 5px #ff3f4d!important; }
.layer-manager .layer-row { min-height: 43px; height: auto; flex: 0 0 auto; }
.layer-manager .layer-row b { overflow: visible; white-space: normal; line-height: 1.35; text-overflow: clip; overflow-wrap: anywhere; }
.layer-manager .map-service-row { grid-template-columns: minmax(0,1fr) auto; }
.layer-panel-message { padding: 16px 14px; color: #83b5c6; font-size: 13px; line-height: 1.5; text-align: center; }
.layer-panel-message.error { color: #ff8e98; }
.parcel-type-panel { position: relative; width: 100%; min-height: 150px; flex: 1 1 auto; overflow-y: auto; color: #bde6ef; border: 1px solid #1688bf; border-radius: 14px; background: #031c37e8; box-shadow: 0 0 18px #00a7d534; }
.parcel-type-panel>.tool-title { position: sticky; z-index: 1; top: 0; }
.parcel-filter-group+.parcel-filter-group { border-top: 1px solid #1688bf; }
.parcel-filter-heading { padding: 10px 14px 8px; border-bottom: 1px solid #0d5278; background: linear-gradient(90deg,#064367d9,#032a49d9); }
.parcel-filter-heading b,.parcel-filter-heading small { display: block; overflow-wrap: anywhere; }
.parcel-filter-heading b { color: #d6f8ff; font-size: 14px; line-height: 1.35; }
.parcel-filter-heading small { margin-top: 3px; color: #70adbe; font-size: 11px; }
.parcel-filter-row { min-height: 38px; display: grid; grid-template-columns: minmax(0,1fr) 17px; align-items: center; gap: 9px; padding: 5px 14px; border-bottom: 1px solid #0d5278; cursor: pointer; }
.parcel-filter-row:hover { color: #fff; background: #07567866; }
.parcel-filter-row input { width: 15px; height: 15px; margin: 0; accent-color: #28cce8; cursor: pointer; }
.parcel-filter-row span { min-width: 0; font-size: 13px; line-height: 1.35; overflow-wrap: anywhere; }
.parcel-filter-all { color: #d6f8ff; background: #064367a6; font-weight: 700; }
.tool-title-state{color:#91e6ff;font-size:14px;font-weight:400}
.map-search { width: 42px; min-height: 42px; padding: 0; border-color: #188fc0; border-radius: 12px; background: #031a31b8; }.map-search.expanded { width: 340px; padding: 0 12px; }.map-search input { order: 1; height: 40px; font-size: 14px; }.map-search-toggle { order: 2; width: 42px; height: 42px; flex-basis: 42px; display: grid; place-items: center; margin-left: 4px; transform: none; }.map-search-toggle svg { width: 21px; height: 21px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; }.search-results { top: 42px; max-height: 360px; overflow-y: auto; border-radius: 0 0 12px 12px; box-shadow: 0 8px 16px #00101b77; }.search-result-title { padding: 7px 12px; color: #57ddeb; border-bottom: 1px solid #0b405c; background: #073a58; font-size: 12px; font-weight: 700; letter-spacing: .5px; }.search-results button { padding: 9px 12px; }.search-results button:last-child { border-bottom: 0; }.search-results b { color: #d6f8ff; font-size: 14px; }.search-results small { color: #78a8b9; font-size: 12px; }.search-results p { margin: 0; padding: 13px 12px; color: #7da7b8; font-size: 13px; }
.map-tools { top: 56px; right: 12px; bottom: 34px; width: 138px; display: flex; flex-direction: column; justify-content: center; gap: 5px; overflow: visible; border: 0; border-radius: 0; background: transparent; }.map-tools>button { min-height: 40px; flex: 0 0 40px; grid-template-columns: 26px 1fr; gap: 8px; padding: 5px 12px; border: 1px solid #155a7c; border-radius: 9px; background: #031a30b8; box-shadow: 0 0 8px #00a9de18; }.map-tools>button:last-of-type { border-bottom: 1px solid #155a7c; }.map-tools>button:hover,.map-tools>button.active { border-color: #24cbe3; background: #075477d0; }.map-tools i { font-size: 19px; }.map-tools span { font-size: 14px; white-space: nowrap; }.compass { width: 23px; height: 23px; font-size: 14px!important; }.right-submenu { top: 50%; right: 146px; width: 118px; transform: translateY(-50%); }.right-submenu button { font-size: 13px; }
.map-mode-switch { flex: 0 0 82px; display: grid; grid-template-rows: 1fr 1fr; overflow: hidden; border: 1px solid #155a7c; border-radius: 9px; background: #031a30b8; box-shadow: 0 0 8px #00a9de18; }.map-mode-switch button { display: grid; grid-template-columns: 26px 1fr; align-items: center; gap: 8px; padding: 4px 12px; color: #84b2c3; background: transparent; border: 0; cursor: pointer; }.map-mode-switch button+button { border-top: 1px solid #155a7c; }.map-mode-switch button:hover,.map-mode-switch button.active { color: #fff; background: #075477d0; }.map-mode-switch span { font-size: 14px; white-space: nowrap; }.mode-indicator { width: 15px; height: 15px; display: block; border: 1.5px solid #75cbe9; border-radius: 50%; }.map-mode-switch button.active .mode-indicator { border-color: #c3f8ff; background: #49d9f4; box-shadow: 0 0 7px #27dfff; }
.map-scale { right: 14px; bottom: 10px; width: 96px; height: 18px; padding: 0; color: #b9e7f4; background: transparent; font-size: 11px; text-align: center; }.map-scale b { position: relative; z-index: 1; display: block; font-size: 11px; font-weight: 600; line-height: 12px; }.map-scale i { position: absolute; right: 0; bottom: 0; left: 0; height: 7px; border-right: 2px solid #b9e7f4; border-bottom: 2px solid #b9e7f4; border-left: 2px solid #b9e7f4; }
:deep(.leaflet-administrative-boundaries-pane path) { filter: drop-shadow(0 0 4px #168fe2cc); }
:deep(.leaflet-administrative-boundaries-pane .hailing-boundary-glow) { filter: drop-shadow(0 0 2px #b8f1ff) drop-shadow(0 0 6px #27bfff) drop-shadow(0 0 12px #078de0cc); }
</style>
