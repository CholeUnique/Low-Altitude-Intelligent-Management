<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, useId, watch } from 'vue'
import { Aim, Compass, Delete, EditPen, InfoFilled, Location, MapLocation, Picture, ZoomIn, ZoomOut } from '@element-plus/icons-vue'
import L from 'leaflet'
import { geodesicArea, formatDistance, formatArea } from '@/utils/map-measurement'
import type { GeoJsonObject } from 'geojson'
import 'leaflet/dist/leaflet.css'

import taizhouDistrictBoundaries from '@/assets/geo/taizhou-districts.json'
import { getJiulongArcGisLayerBounds } from '@/utils/jiulong-arcgis-layers'
import { getMapServiceRegionTree, listEnabledMapServices, listMapServicesForDepartments, updateMapService, type MapServiceItem, type MapServiceRegionGroup, type MapServiceRegionNode } from '@/api/map-service'
import { getDepartmentList } from '@/api/account-management'
import { useUserStore } from '@/stores/user'
import type { DashboardMapLayer, DronePatrolRoute } from '@/types'
import {
  createMapServiceLayer,
  createAdministrativeBoundaryLayer,
  expandMapServiceSublayers,
  probeMapService,
  identifyVectorFeatures,
  MAP_SERVICE_IMAGERY_PANE,
  MAP_SERVICE_VECTOR_PANE,
  rememberVectorLayerColor,
  searchVectorLayerText,
  setMapHoverSelection,
  vectorLayerColor,
  type IdentifiedMapFeature,
  type MapServiceCategoryLocation,
  type MapServiceLayerHandle,
} from '@/utils/map-service-layer'

const props = defineProps<{
  layers: DashboardMapLayer[]
  routes: DronePatrolRoute[]
  /** 首页全幅地图的悬浮控件样式，不改变地图事件。 */
  floatingControls?: boolean
  /** 仅隐藏首页地图上的悬浮面板，保留地图和底部工具栏。 */
  screenCleared?: boolean
  /** 从场景入口进入时，自动聚焦该场景实际任务范围。 */
  focusLayerId?: string
  /** 场景几何准备好后再定位并挂载底图，避免先下载错误视角的瓦片。 */
  focusGeometryPending?: boolean
}>()
const emit = defineEmits<{ 'toggle-clear-screen': [] }>()

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

const taizhouDistrictBoundariesWgs84 = convertAdministrativeBoundary(taizhouDistrictBoundaries)
const HAILING_DISTRICT = (taizhouDistrictBoundariesWgs84 as {
  features?: Array<{ properties?: { name?: string } }>
}).features?.find((feature) => feature.properties?.name === '海陵区')
const token = import.meta.env.VITE_TIANDITU_TOKEN
const user = useUserStore()

const subdomains = ['0', '1', '2', '3', '4', '5', '6', '7']
const container = ref<HTMLElement>()
const mapReady = ref(false)
const mapError = ref('')
const mapMode = ref<'vector' | 'image'>('image')
interface MapServiceGroup {
  id: string
  name: string
  source: MapServiceItem
  layers: MapServiceItem[]
  kind?: 'vector' | 'imagery'
}
const requestedLayerOrder: string[] = []
let dragOriginalStack: string[] = []
const mapServiceOrderSaving = ref(false)
const draggingGroupId = ref('')
const dragGhost = ref<{ name: string; x: number; y: number; width: number; height: number }>()
let dragPressTimer: number | undefined
let dragPointerId: number | undefined
let dragActive = false
let dragGroupId = ''
let dragStartX = 0, dragStartY = 0, dragRowX = 0, dragRowY = 0
let dragOriginalOrder: string[] = []
let previousUserSelect = ''
let suppressGroupClick = false
const pendingGroupIds = reactive(new Set<string>())
function groupKind(group: MapServiceGroup) {
  return group.kind || (group.layers.some(item => item.arcGisGeometryType) || /矢量|农田|行政|VECTOR|FEATURE/i.test(`${group.name} ${group.source.type}`) ? 'vector' : 'imagery')
}
function sortedServiceGroups(groups: MapServiceGroup[]) {
  return [...groups].sort((a, b) => Number(groupKind(a) === 'imagery') - Number(groupKind(b) === 'imagery'))
}
const mapServiceGroups = ref<MapServiceGroup[]>([])
const regionTreeGroups = ref<MapServiceRegionGroup[]>([])
const selectedRegion = ref('')
const regionTreeError = ref('')
const regionPickerOpen = ref(false)
const expandedRegions = ref<string[]>([])
const regionKey = (type: string, code: string | null) => JSON.stringify([type, code])
function regionEntries(nodes: MapServiceRegionNode[], depth = 0): Array<{ node: MapServiceRegionNode; depth: number }> {
  return nodes.flatMap(node => [{ node, depth }, ...regionEntries(Array.isArray(node.children) ? node.children : [], depth + 1)])
}
function visibleRegionEntries(type: string, nodes: MapServiceRegionNode[], depth = 0): Array<{ node: MapServiceRegionNode; depth: number }> {
  return nodes.flatMap(node => [{ node, depth }, ...(expandedRegions.value.includes(regionKey(type, node.code)) ? visibleRegionEntries(type, node.children || [], depth + 1) : [])])
}
const regionSelectionOptions = computed(() => regionTreeGroups.value.map(group => ({ ...group, entries: visibleRegionEntries(group.dataType, group.roots || []) })))
const selectedRegionLabel = computed(() => {
  if (!selectedRegion.value) return '请选择区划'
  if (selectedRegion.value === 'all') return '全部图层'
  const [type, code] = JSON.parse(selectedRegion.value) as [string, string | null]
  const group = regionTreeGroups.value.find(item => item.dataType === type)
  const node = group && regionEntries(group.roots || []).find(entry => entry.node.code === code)?.node
  return node ? `${group?.dataTypeName || type} / ${node.name}` : '请选择区划'
})
function regionServiceCount(type: string, code: string | null) {
  const group = regionTreeGroups.value.find(item => item.dataType === type)
  const node = group && regionEntries(group.roots || []).find(entry => entry.node.code === code)?.node
  const codes = new Set(node ? regionEntries([node]).map(entry => entry.node.code || null) : [code])
  return mapServiceGroups.value.filter(item => item.source.dataType === type && codes.has(item.source.regionCode || null)).length
}
function selectRegion(type: string, node: MapServiceRegionNode) {
  const key = regionKey(type, node.code)
  selectedRegion.value = key
  toggleRegion(type, node)
}
function toggleRegion(type: string, node: MapServiceRegionNode) {
  const key = regionKey(type, node.code)
  if (!node.children?.length) return
  if (expandedRegions.value.includes(key)) {
    const descendants = new Set(regionEntries([node]).map(entry => regionKey(type, entry.node.code)))
    expandedRegions.value = expandedRegions.value.filter(item => !descendants.has(item))
  } else {
    expandedRegions.value = [...expandedRegions.value, key]
  }
}
const visibleServiceGroups = computed(() => {
  if (!selectedRegion.value) return []
  if (selectedRegion.value === 'all') return mapServiceGroups.value
  const [type, code] = JSON.parse(selectedRegion.value) as [string, string | null]
  const group = regionTreeGroups.value.find(item => item.dataType === type)
  const node = group && regionEntries(group.roots || []).find(entry => entry.node.code === code)?.node
  if (!node) return []
  return mapServiceGroups.value.filter(item => item.source.dataType === type && (item.source.regionCode || null) === node.code)
})
const mapServicesLoading = ref(false)
const mapServicesError = ref('')
const jiulongBoundaryVisible = ref(false)

const jiulongBoundaryError = ref('')
const jiulongBoundaryLoading = ref(false)
const layerPanelCollapsed = ref(Boolean(props.floatingControls))
async function toggleLayerPanel() {
  layerPanelCollapsed.value = !layerPanelCollapsed.value
  regionPickerOpen.value = !layerPanelCollapsed.value
}
const layerPanelId = `dashboard-layers-${useId().replace(/:/g, '')}`
const visibleMapServiceIds = ref<string[]>([])
const expandedMapServiceGroupIds = ref<string[]>([])
const expandedCategoryIds = ref<string[]>([])
interface VectorFilterPanel {
  fieldName: string
  serviceId: string
  serviceName: string
  fieldLabel: string
  items: Array<{ value: string; label: string; color: string; checked: boolean }>
  apply: (values: string[]) => void
  locateValue: (value: string) => Promise<MapServiceCategoryLocation>
}
const vectorFilterPanels = ref<VectorFilterPanel[]>([])
const vectorLayerColors = ref<Record<string, string>>({})
const vectorFillOpacity = ref<Record<string, number>>({})
const layerContextMenu = ref<{ x: number; y: number; serviceId: string }>()
const layerColorPicker = ref<{ x: number; y: number; serviceId: string; color: string; hue: number; saturation: number; value: number }>()
const colorWheelCanvas = ref<HTMLCanvasElement>()
const COLOR_WHEEL_SIZE = 168
const attributeSearchResults = ref<IdentifiedMapFeature[]>([])
interface AttributeSearchGroup { key: string; serviceId: string; serviceName: string; field: string; label: string; value: string; features: IdentifiedMapFeature[] }
const attributeSearchGroups = computed(() => {
  const groups = new Map<string, AttributeSearchGroup>()
  const keyword = searchKeyword.value.trim().toLowerCase()
  attributeSearchResults.value.forEach(feature => {
    const category = feature.category?.value.toLowerCase().includes(keyword) ? feature.category : undefined
    const field = category?.field || feature.matchFieldName
    if (!field) return
    const value = category?.value || feature.title
    const key = `${feature.serviceId}:${field}:${value}`
    const existing = groups.get(key)
    if (existing) existing.features.push(feature)
    else groups.set(key, { key, serviceId: feature.serviceId, serviceName: feature.serviceName, field, label: category?.label || feature.matchLabel || field, value, features: [feature] })
  })
  return [...groups.values()]
})
const attributeFilters = ref<Record<string, string>>({})
const attributeSearchLoading = ref(false)
const attributeSearchError = ref('')
const searchExpanded = ref(false)
const searchKeyword = ref('')
const searchInput = ref<HTMLInputElement>()
const toolMessage = ref('')
const measureOpen = ref(false)
const baseMapOpen = ref(false)
const activeTool = ref<'distance' | 'area' | 'marker' | null>(null)
const locating = ref(false)
const measureResult = ref('')
const scaleWidth = ref(96)
const scaleLabel = ref('5 km')
interface ParcelSearchResult {
  serviceId: string
  id: string
  serviceName: string
  fieldLabel: string
  value: string
  label: string
  locate: () => Promise<MapServiceCategoryLocation>
}
const parcelSearchResults = computed<ParcelSearchResult[]>(() => {
  const keyword = searchKeyword.value.trim().toLowerCase()
  if (!keyword) return []
  return vectorFilterPanels.value.flatMap((panel) => panel.items.map((item) => ({
    serviceId: panel.serviceId,
    id: `${panel.serviceId}::${item.value}`,
    serviceName: panel.serviceName,
    fieldLabel: panel.fieldLabel,
    value: item.value,
    label: item.label,
    locate: () => panel.locateValue(item.value),
  })))
    .filter((item) => `${item.label}${item.serviceName}${item.fieldLabel}`.toLowerCase().includes(keyword))
    .slice(0, 12)
})
const showSearchSuggestions = computed(() => (props.floatingControls || searchExpanded.value) && Boolean(searchKeyword.value.trim()))

let map: L.Map | undefined
let resizeObserver: ResizeObserver | undefined
let resizeFrame: number | undefined
let baseLayer: L.TileLayer | undefined
let labelLayer: L.TileLayer | undefined
let baseLayersInitialized = false
let measureGroup: L.LayerGroup | undefined
let annotationGroup: L.LayerGroup | undefined
let locationGroup: L.LayerGroup | undefined
let searchHighlightGroup: L.LayerGroup | undefined
let selectionHighlightGroup: L.LayerGroup | undefined
const featureCandidates = ref<IdentifiedMapFeature[]>([])
const selectedFeatureIndex = ref(0)
const activeFeature = computed(() => featureCandidates.value[selectedFeatureIndex.value])
let hailingBoundaryGroup: L.LayerGroup | undefined
let jiulongAdminHandle: MapServiceLayerHandle | undefined
let jiulongAdminRequest = 0
let jiulongAdminPendingFit = jiulongBoundaryVisible.value
const jiulongAdminService = ref<MapServiceItem>()
const jiulongAdminSourceId = ref('')
let toolMessageTimer: ReturnType<typeof window.setTimeout> | undefined
let markerHintTimer: ReturnType<typeof window.setTimeout> | undefined
let searchFocusTimer: ReturnType<typeof window.setTimeout> | undefined
let searchHighlightTimer: ReturnType<typeof window.setInterval> | undefined
let searchHighlightClearTimer: ReturnType<typeof window.setTimeout> | undefined
let attributeSearchRequestVersion = 0
let featureSelectionRequestVersion = 0
let focusedSceneLayerId = ''
let overviewFocused = false
const mapServiceLayers = new Map<string, MapServiceLayerHandle>()
const mapServicePaneNames = new Map<string, string>()
const loadingMapServiceIds = reactive(new Set<string>())
const mapServiceVisibilityVersions = new Map<string, number>()
let mapServiceRequestVersion = 0
let mapServicePaneSerial = 0
let measurePoints: L.LatLng[] = []

function dismissToolMessage() {
  if (toolMessageTimer) window.clearTimeout(toolMessageTimer)
  toolMessageTimer = undefined
  toolMessage.value = ''
}

function showToolMessage(message: string, duration = 4000) {
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
  const tileOptions = { subdomains, maxNativeZoom: 18, maxZoom: 22, updateWhenIdle:true, updateWhenZooming:false, keepBuffer:2 }
  baseLayer = L.tileLayer(tileUrl(base), tileOptions)
  labelLayer = L.tileLayer(tileUrl(label), { ...tileOptions, pane: 'labels' })
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

function paneForMapService(service: MapServiceItem) {
  if (!map) return MAP_SERVICE_IMAGERY_PANE
  const paneKey = String(service.id)
  let paneName = mapServicePaneNames.get(paneKey)
  if (!paneName) {
    paneName = `dashboard-service-${++mapServicePaneSerial}`
    const pane = map.createPane(paneName)
    pane.style.zIndex = service.arcGisGeometryType ? '335' : '235'
    pane.style.pointerEvents = 'none'
    mapServicePaneNames.set(paneKey, paneName)
  }
  const pane = map.getPane(paneName)
  if (pane) pane.style.zIndex = service.arcGisGeometryType ? '335' : '235'
  return paneName
}

function assignMapServicePane(layer: L.Layer, paneName: string) {
  if (layer instanceof L.LayerGroup) {
    layer.eachLayer((child) => assignMapServicePane(child, paneName))
    return
  }
  layer.options.pane = paneName
}

function syncMapServiceStack() {
  // 影像和矢量使用独立层级；同类按开启操作顺序叠放，与响应先后无关。
  requestedLayerOrder.forEach((id) => {
    const pane = map?.getPane(mapServicePaneNames.get(id) || '')
    if (pane?.parentElement) pane.parentElement.appendChild(pane)
  })
}

function stopMapServiceDrag() {
  if (dragPressTimer) window.clearTimeout(dragPressTimer)
  dragPressTimer = undefined
  window.removeEventListener('pointermove', onMapServicePointerMove)
  window.removeEventListener('pointerup', onMapServicePointerUp)
  window.removeEventListener('pointercancel', onMapServicePointerCancel)
  window.removeEventListener('blur', onMapServicePointerCancel)
  if (dragActive) document.body.style.userSelect = previousUserSelect
  dragPointerId = undefined
  dragGroupId = ''
  dragActive = false
  draggingGroupId.value = ''
  dragGhost.value = undefined
}

function onMapServicePointerDown(event: PointerEvent, group: MapServiceGroup) {
  if (event.button !== 0 || mapServiceOrderSaving.value || mapServicesLoading.value || (selectedRegion.value && selectedRegion.value !== 'all')) return
  stopMapServiceDrag()
  dragPointerId = event.pointerId
  dragStartX = event.clientX
  dragStartY = event.clientY
  dragGroupId = group.id
  const row = event.currentTarget as HTMLElement
  const rect = row.getBoundingClientRect()
  dragRowX = rect.left
  dragRowY = rect.top
  dragOriginalOrder = mapServiceGroups.value.map((item) => item.id)
  dragOriginalStack = [...requestedLayerOrder]
  window.addEventListener('pointermove', onMapServicePointerMove)
  window.addEventListener('pointerup', onMapServicePointerUp)
  window.addEventListener('pointercancel', onMapServicePointerCancel)
  window.addEventListener('blur', onMapServicePointerCancel)
  dragPressTimer = window.setTimeout(() => {
    dragPressTimer = undefined
    dragActive = true
    draggingGroupId.value = group.id
    previousUserSelect = document.body.style.userSelect
    document.body.style.userSelect = 'none'
    dragGhost.value = { name: group.name, x: rect.left, y: rect.top, width: rect.width, height: rect.height }
  }, 240)
}

function onMapServicePointerMove(event: PointerEvent) {
  if (event.pointerId !== dragPointerId) return
  if (!dragActive) {
    if (Math.hypot(event.clientX - dragStartX, event.clientY - dragStartY) > 6) stopMapServiceDrag()
    return
  }
  event.preventDefault()
  if (dragGhost.value) {
    dragGhost.value = { ...dragGhost.value, x: dragRowX + event.clientX - dragStartX, y: dragRowY + event.clientY - dragStartY }
  }
  const list = document.getElementById(layerPanelId)?.querySelector<HTMLElement>('.map-service-sort-list')
  if (!list) return
  const scroller = list.parentElement
  if (scroller) {
    const bounds = scroller.getBoundingClientRect()
    if (event.clientY < bounds.top + 28) scroller.scrollTop -= 12
    else if (event.clientY > bounds.bottom - 28) scroller.scrollTop += 12
  }
  const siblings = [...list.querySelectorAll<HTMLElement>('.map-service-group')]
    .filter((element) => element.dataset.groupId !== dragGroupId)
  const insertAt = siblings.findIndex((element) => event.clientY < element.getBoundingClientRect().top + element.getBoundingClientRect().height / 2)
  const targetIndex = insertAt < 0 ? siblings.length : insertAt
  const currentIndex = mapServiceGroups.value.findIndex((item) => item.id === dragGroupId)
  if (currentIndex < 0 || currentIndex === targetIndex) return
  const reordered = [...mapServiceGroups.value]
  const [moved] = reordered.splice(currentIndex, 1)
  if (!moved) return
  const kind = groupKind(moved)
  const otherKindBefore = siblings.slice(0, targetIndex).some(element => {
    const group = mapServiceGroups.value.find(item => item.id === element.dataset.groupId)
    return group && groupKind(group) !== kind
  })
  const vectors = reordered.filter(item => groupKind(item) === 'vector').length
  // 跨分区拖动直接拒绝，既不改变画面顺序，也不向后端保存无效顺序。
  if ((kind === 'imagery' && targetIndex < vectors) || (kind === 'vector' && otherKindBefore)) return
  reordered.splice(targetIndex, 0, moved)
  mapServiceGroups.value = reordered
  requestedLayerOrder.splice(0, requestedLayerOrder.length, ...[...reordered].reverse().flatMap(group => group.layers.map(service => String(service.id))))
  syncMapServiceStack()
}

async function persistMapServiceOrder(previousOrder: string[], requestVersion: number) {
  const previousStack = [...dragOriginalStack]
  mapServiceOrderSaving.value = true
  try {
    const departments = await getDepartmentList()
    const departmentIds = departments.map((department) => String(department.id))
    if (!departmentIds.length) throw new Error('无法获取部门列表，排序未保存')
    const allServices = await listMapServicesForDepartments(departmentIds)
    if (requestVersion !== mapServiceRequestVersion) return
    const visibleOrder = mapServiceGroups.value.map((group) => group.id)
    const visibleIds = new Set(visibleOrder)
    if (visibleOrder.some((id) => !allServices.some((service) => String(service.id) === id))) {
      throw new Error('部分地图服务未能从后台读到，排序未保存')
    }
    const orderedVisible = new Map(mapServiceGroups.value.map((group) => [group.id, group.source]))
    let visibleIndex = 0
    const reordered = allServices.map((service) => visibleIds.has(String(service.id))
      ? orderedVisible.get(visibleOrder[visibleIndex++]!) || service
      : service)
    const changes = reordered.map((service, index) => ({ service, sort: index + 1, oldSort: Number(service.sort) || 0 }))
      .filter(({ service, sort }) => Number(service.sort) !== sort)
    const updateSort = (service: MapServiceItem, sort: number) => updateMapService({
      id: service.id,
      name: service.name,
      serviceUrl: service.serviceUrl,
      ...(service.type ? { type: service.type } : {}),
      sort,
      remark: service.remark,
      deptIds: service.deptIds || [],
    })
    const results = await Promise.allSettled(changes.map(({ service, sort }) => updateSort(service, sort)))
    if (results.some((result) => result.status === 'rejected')) {
      await Promise.allSettled(changes.map(({ service, oldSort }) => updateSort(service, oldSort)))
      throw new Error('后台排序保存失败，已尝试恢复原顺序')
    }
    if (requestVersion === mapServiceRequestVersion) {
      mapServiceGroups.value.forEach((group) => {
        group.source.sort = reordered.findIndex((service) => String(service.id) === group.id) + 1
      })
      showToolMessage('图层顺序已保存，所有用户将共用此排序')
    }
  } catch (reason) {
    if (requestVersion === mapServiceRequestVersion) {
      const byId = new Map(mapServiceGroups.value.map((group) => [group.id, group]))
      mapServiceGroups.value = previousOrder.map((id) => byId.get(id)).filter((group): group is MapServiceGroup => Boolean(group))
      requestedLayerOrder.splice(0, requestedLayerOrder.length, ...previousStack)
      syncMapServiceStack()
      showToolMessage(reason instanceof Error ? reason.message : '排序保存失败', 5000)
    }
  } finally {
    mapServiceOrderSaving.value = false
  }
}

function onMapServicePointerUp(event: PointerEvent) {
  if (event.pointerId !== dragPointerId) return
  const wasDragging = dragActive
  const previousOrder = dragOriginalOrder
  const requestVersion = mapServiceRequestVersion
  stopMapServiceDrag()
  if (!wasDragging) return
  suppressGroupClick = true
  window.setTimeout(() => { suppressGroupClick = false }, 100)
  if (previousOrder.some((id, index) => id !== mapServiceGroups.value[index]?.id)) {
    if (user.currentUser?.role === 'ADMIN') void persistMapServiceOrder(previousOrder, requestVersion)
    else showToolMessage('图层顺序仅在当前页面生效；管理员可保存为所有用户共用的顺序')
  }
}

function onMapServicePointerCancel() {
  if (dragActive) {
    const byId = new Map(mapServiceGroups.value.map((group) => [group.id, group]))
    mapServiceGroups.value = dragOriginalOrder.map((id) => byId.get(id)).filter((group): group is MapServiceGroup => Boolean(group))
    requestedLayerOrder.splice(0, requestedLayerOrder.length, ...dragOriginalStack)
    syncMapServiceStack()
  }
}

function onMapServiceGroupClick(group: MapServiceGroup) {
  if (pendingGroupIds.has(group.id)) return
  if (suppressGroupClick) {
    suppressGroupClick = false
    return
  }
  if (group.layers.length === 1 && categoryPanelFor(group.layers[0]!)) toggleCategoryFolder(group.layers[0]!)
  else if (group.layers.length === 1) void toggleMapServiceGroupVisibility(group)
  else void toggleMapServiceGroup(group)
}

async function loadMapServices() {
  const requestVersion = ++mapServiceRequestVersion
  jiulongAdminRequest += 1
  jiulongAdminHandle?.layer.remove()
  jiulongAdminHandle = undefined
  jiulongAdminService.value = undefined
  jiulongAdminSourceId.value = ''
  jiulongBoundaryLoading.value = false
  jiulongBoundaryError.value = ''
  // 部门切换时先撤掉旧图层，避免新列表返回前仍展示上一部门的服务。
  clearSelectionHighlight()
  attributeFilters.value = {}
  mapServiceLayers.forEach((handle) => handle.layer.remove())
  mapServiceLayers.clear()
  loadingMapServiceIds.clear()
  mapServiceVisibilityVersions.clear()
  visibleMapServiceIds.value = []
  vectorFilterPanels.value = []
  expandedCategoryIds.value = []
  expandedMapServiceGroupIds.value = []
  mapServiceGroups.value = []
  regionTreeGroups.value = []
  selectedRegion.value = ''
  expandedRegions.value = []
  regionTreeError.value = ''
  mapServicesLoading.value = true
  mapServicesError.value = ''
  void getMapServiceRegionTree({ deptId: user.activeDeptId, status: 1 }).then(result => {
    if (requestVersion === mapServiceRequestVersion) regionTreeGroups.value = Array.isArray(result) ? result : []
  }).catch(() => { if (requestVersion === mapServiceRequestVersion) regionTreeError.value = '行政区划加载失败' })
  try {
    const sourceServices = await listEnabledMapServices(user.activeDeptId)
    if (requestVersion !== mapServiceRequestVersion) return
    pendingGroupIds.clear()
    sourceServices.forEach(source => pendingGroupIds.add(String(source.id)))
    requestedLayerOrder.splice(0)
    mapServiceGroups.value = sortedServiceGroups(sourceServices.map(source => ({
      id: String(source.id), name: source.name, source, layers: [source],
    })))
    const retry = async <T,>(operation: () => Promise<T>): Promise<T> => {
      try { return await operation() } catch { return operation() }
    }
    // 三个服务并发预检，列表先展示，失败条目静默移除；部门切换后旧结果作废。
    let next = 0
    await Promise.all(Array.from({ length: Math.min(3, sourceServices.length) }, async () => {
      while (next < sourceServices.length && requestVersion === mapServiceRequestVersion) {
        const source = sourceServices[next++]!
        const id = String(source.id)
        try {
          const expanded = await retry(() => expandMapServiceSublayers(source, true))
          const available: MapServiceItem[] = []
          for (const layer of expanded) {
            if (requestVersion !== mapServiceRequestVersion) return
            try { await retry(() => probeMapService(layer)); available.push(layer) } catch { /* 单个子层不可用不隐藏整个服务。 */ }
          }
          if (requestVersion !== mapServiceRequestVersion) return
          if (!available.length) throw new Error('服务不可用')
          const layers = detachJiulongAdminLayer(source, available)
          const group = mapServiceGroups.value.find(item => item.id === id)
          if (group) {
            group.layers = layers
            group.kind = available.some(layer => layer.arcGisGeometryType) ? 'vector' : 'imagery'
          }
          mapServiceGroups.value = sortedServiceGroups(mapServiceGroups.value)
          assignVectorColors(mapServiceGroups.value)
        } catch {
          if (requestVersion !== mapServiceRequestVersion) return
          mapServiceGroups.value = mapServiceGroups.value.filter(item => item.id !== id)
        } finally {
          if (requestVersion === mapServiceRequestVersion) pendingGroupIds.delete(id)
        }
      }
    }))
  } catch (reason) {
    if (requestVersion !== mapServiceRequestVersion) return
    mapServiceGroups.value = []
    expandedMapServiceGroupIds.value = []
    mapServicesError.value = reason instanceof Error ? reason.message : '地图服务列表加载失败'
  } finally {
    if (requestVersion === mapServiceRequestVersion) {
      mapServicesLoading.value = false
      if (jiulongBoundaryVisible.value) void renderJiulongBoundary(false)
    }
  }
}

function hideMapService(service: MapServiceItem) {
  const id = String(service.id)
  mapServiceVisibilityVersions.set(id, (mapServiceVisibilityVersions.get(id) || 0) + 1)
  loadingMapServiceIds.delete(id)
  mapServiceLayers.get(id)?.layer.remove()
  if (activeFeature.value?.serviceId === id) clearSelectionHighlight()
  visibleMapServiceIds.value = visibleMapServiceIds.value.filter((layerId) => layerId !== id)
  vectorFilterPanels.value = vectorFilterPanels.value.filter((panel) => panel.serviceId !== id)
  expandedCategoryIds.value = expandedCategoryIds.value.filter((layerId) => layerId !== id)
}

function taizhouServiceBounds(service: MapServiceItem) {
  const isTaizhou = /泰州\s*天地图/.test(service.name)
    || /^https?:\/\/jiangsu\.tianditu\.gov\.cn\/taizhou\/forwarder\//i.test(service.serviceUrl)
  // 服务方确认业务覆盖泰州全市；缺少精确范围时，用行政外包范围定位并限制请求。
  if (isTaizhou) return L.geoJSON(taizhouDistrictBoundariesWgs84 as GeoJsonObject).getBounds()
}

function mapServiceViewBounds(service: MapServiceItem, handle: MapServiceLayerHandle) {
  return handle.bounds?.isValid() ? handle.bounds : taizhouServiceBounds(service)
}

async function toggleMapService(service: MapServiceItem) {
  if (!map) return
  const id = String(service.id)
  const existing = mapServiceLayers.get(id)
  if (existing && map.hasLayer(existing.layer)) {
    hideMapService(service)
    return
  }
  if (loadingMapServiceIds.has(id)) return
  const orderIndex = requestedLayerOrder.indexOf(id)
  if (orderIndex >= 0) requestedLayerOrder.splice(orderIndex, 1)
  requestedLayerOrder.push(id)
  loadingMapServiceIds.add(id)
  const requestVersion = mapServiceRequestVersion
  const visibilityVersion = (mapServiceVisibilityVersions.get(id) || 0) + 1
  mapServiceVisibilityVersions.set(id, visibilityVersion)
  try {
    const color = service.arcGisGeometryType ? vectorLayerColors.value[id] || vectorLayerColor(id) : undefined
    const handle = existing || await createMapServiceLayer(service, color, {
      fallbackRequestBounds: taizhouServiceBounds(service),
      boundsOverride: getJiulongArcGisLayerBounds(service.serviceUrl),
    })
    if (existing && color) existing.setColor?.(color)
    if (requestVersion !== mapServiceRequestVersion || visibilityVersion !== mapServiceVisibilityVersions.get(id)) {
      handle.layer.remove()
      return
    }
    mapServiceLayers.set(id, handle)
    if (!existing) {
      let lastTileErrorTime = 0
      handle.layer.on('tileerror', (event: L.TileErrorEvent) => {
        if (!map?.hasLayer(handle.layer) || requestVersion !== mapServiceRequestVersion) return
        const now = Date.now()
        if (now - lastTileErrorTime < 8000) return
        lastTileErrorTime = now
        showToolMessage(`${service.name}：${event.error?.message || '地图瓦片加载失败，请检查实际瓦片请求及访问授权'}`, 6500)
      })
    }
    assignMapServicePane(handle.layer, paneForMapService(service))
    handle.setFillOpacity?.(vectorFillOpacity.value[id] ?? .25)
    const viewBounds = mapServiceViewBounds(service, handle)
    if (viewBounds?.isValid() && !viewBounds.contains(map.getBounds())) {
      map.invalidateSize({ pan: false })
      // 默认行政视角直接就位再添加图层，避免先请求旧的大视窗；真实服务范围保留平滑定位。
      map.fitBounds(viewBounds, { padding: [48, 48], maxZoom: 19, animate: Boolean(handle.bounds?.isValid()) })
      overviewFocused = true
    }
    handle.layer.addTo(map)
    syncMapServiceStack()
    if (!visibleMapServiceIds.value.includes(id)) visibleMapServiceIds.value = [...visibleMapServiceIds.value, id]
    if (handle.categoryFilter && !vectorFilterPanels.value.some((panel) => panel.serviceId === id)) {
      vectorFilterPanels.value = [...vectorFilterPanels.value, {
        fieldName: handle.categoryFilter.fieldName,
        serviceId: id,
        serviceName: service.name,
        fieldLabel: handle.categoryFilter.fieldLabel,
        items: handle.categoryFilter.values.map((item) => ({ ...item, checked: true })),
        apply: handle.categoryFilter.setVisibleValues,
        locateValue: handle.categoryFilter.locateValue,
      }]
      if (!expandedCategoryIds.value.includes(id)) expandedCategoryIds.value = [...expandedCategoryIds.value, id]
    }
  } catch (reason) {
    if (requestVersion === mapServiceRequestVersion && visibilityVersion === mapServiceVisibilityVersions.get(id)) showToolMessage(`${service.name}：${reason instanceof Error ? reason.message : '加载失败'}`, 6500)
  } finally {
    if (requestVersion === mapServiceRequestVersion && visibilityVersion === mapServiceVisibilityVersions.get(id)) loadingMapServiceIds.delete(id)
  }
}

function layerIconKind(service: MapServiceItem) {
  if (service.arcGisGeometryType) return 'vector'
  if (/image|raster|wmts/i.test(service.type) || /ImageServer/i.test(service.serviceUrl) || /影像|正射/.test(service.name)) return 'imagery'
  return 'layer'
}

function assignVectorColors(groups: MapServiceGroup[]) {
  const next = { ...vectorLayerColors.value }
  groups.forEach((group) => {
    group.layers.forEach((service) => {
      if (!service.arcGisGeometryType) return
      const id = String(service.id)
      next[id] = next[id] || vectorLayerColor(id)
    })
  })
  if (jiulongAdminService.value) {
    const id = String(jiulongAdminService.value.id)
    next[id] = next[id] || '#9AEEFE'
  }
  vectorLayerColors.value = next
}

function vectorRowColor(service: MapServiceItem) {
  if (!service.arcGisGeometryType) return undefined
  return vectorLayerColors.value[String(service.id)]
}

function closeLayerMenus(event?: Event) {
  const target = event?.target
  if (target instanceof Element && target.closest('.layer-context-menu, .layer-color-picker')) return
  layerContextMenu.value = undefined
  layerColorPicker.value = undefined
}

function onLayerContextMenu(event: MouseEvent, service: MapServiceItem) {
  if (!service.arcGisGeometryType) return
  event.preventDefault()
  layerColorPicker.value = undefined
  layerContextMenu.value = { x: event.clientX, y: event.clientY, serviceId: String(service.id) }
}

function onGroupContextMenu(event: MouseEvent, group: MapServiceGroup) {
  const service = singleVectorService(group)
  if (service) onLayerContextMenu(event, service)
}

function onSublayerContextMenu(event: MouseEvent, service: MapServiceItem) {
  onLayerContextMenu(event, service)
}

function groupIconColor(group: MapServiceGroup) {
  const color = singleVectorService(group) ? vectorRowColor(singleVectorService(group)!) : undefined
  return color ? { color } : undefined
}

function hexToHsv(hex: string) {
  const red = parseInt(hex.slice(1, 3), 16) / 255
  const green = parseInt(hex.slice(3, 5), 16) / 255
  const blue = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const delta = max - min
  let hue = 0
  if (delta) {
    if (max === red) hue = ((green - blue) / delta) % 6
    else if (max === green) hue = (blue - red) / delta + 2
    else hue = (red - green) / delta + 4
    hue *= 60
    if (hue < 0) hue += 360
  }
  return { hue, saturation: max === 0 ? 0 : delta / max, value: max }
}

function hsvToHex(hue: number, saturation: number, value: number) {
  const chroma = value * saturation
  const secondary = chroma * (1 - Math.abs(((hue / 60) % 2) - 1))
  const match = value - chroma
  const sector = Math.floor(hue / 60) % 6
  const rows = [
    [chroma, secondary, 0],
    [secondary, chroma, 0],
    [0, chroma, secondary],
    [0, secondary, chroma],
    [secondary, 0, chroma],
    [chroma, 0, secondary],
  ]
  const [red, green, blue] = rows[sector] ?? [0, 0, 0]
  const channel = (amount: number) => Math.round((amount + match) * 255).toString(16).padStart(2, '0')
  return `#${channel(red ?? 0)}${channel(green ?? 0)}${channel(blue ?? 0)}`
}

function drawColorWheel() {
  const canvas = colorWheelCanvas.value
  const context = canvas?.getContext('2d')
  if (!canvas || !context) return
  const size = canvas.width
  const center = size / 2
  const radius = center - 1
  const image = context.createImageData(size, size)
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = x + 0.5 - center
      const dy = y + 0.5 - center
      const distance = Math.hypot(dx, dy)
      const index = (y * size + x) * 4
      if (distance > radius) continue
      const hue = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360
      const hex = hsvToHex(hue, Math.min(1, distance / radius), 1)
      image.data[index] = parseInt(hex.slice(1, 3), 16)
      image.data[index + 1] = parseInt(hex.slice(3, 5), 16)
      image.data[index + 2] = parseInt(hex.slice(5, 7), 16)
      image.data[index + 3] = 255
    }
  }
  context.putImageData(image, 0, 0)
}

function openLayerColorPicker() {
  const menu = layerContextMenu.value
  if (!menu) return
  const color = vectorLayerColors.value[menu.serviceId] || vectorLayerColor(menu.serviceId)
  const hsv = hexToHsv(color)
  layerColorPicker.value = { x: menu.x, y: menu.y, serviceId: menu.serviceId, color, ...hsv }
  layerContextMenu.value = undefined
  void nextTick(drawColorWheel)
}

const colorWheelCursorStyle = computed(() => {
  const picker = layerColorPicker.value
  if (!picker) return {}
  const radius = (COLOR_WHEEL_SIZE / 2 - 1) * picker.saturation
  const angle = (picker.hue * Math.PI) / 180
  return {
    left: `${COLOR_WHEEL_SIZE / 2 + Math.cos(angle) * radius}px`,
    top: `${COLOR_WHEEL_SIZE / 2 + Math.sin(angle) * radius}px`,
  }
})

const colorValueTrack = computed(() => {
  const picker = layerColorPicker.value
  if (!picker) return '#000'
  return `linear-gradient(90deg, #000, ${hsvToHex(picker.hue, picker.saturation, 1)})`
})

function onColorWheelPointer(event: PointerEvent) {
  const canvas = colorWheelCanvas.value
  const picker = layerColorPicker.value
  if (!canvas || !picker) return
  canvas.setPointerCapture(event.pointerId)
  const pick = (pointer: PointerEvent) => {
    const current = layerColorPicker.value
    if (!current) return
    const rect = canvas.getBoundingClientRect()
    const x = ((pointer.clientX - rect.left) / rect.width) * canvas.width
    const y = ((pointer.clientY - rect.top) / rect.height) * canvas.height
    const center = canvas.width / 2
    const radius = center - 1
    const dx = x - center
    const dy = y - center
    const distance = Math.min(Math.hypot(dx, dy), radius)
    const hue = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360
    const saturation = distance / radius
    layerColorPicker.value = { ...current, hue, saturation }
    applyLayerColor(hsvToHex(hue, saturation, current.value))
  }
  pick(event)
  const stop = () => {
    canvas.removeEventListener('pointermove', pick)
    canvas.removeEventListener('pointerup', stop)
    canvas.removeEventListener('pointercancel', stop)
  }
  canvas.addEventListener('pointermove', pick)
  canvas.addEventListener('pointerup', stop)
  canvas.addEventListener('pointercancel', stop)
}

function onColorValueInput(event: Event) {
  const picker = layerColorPicker.value
  if (!picker) return
  const value = Number((event.target as HTMLInputElement).value) / 100
  layerColorPicker.value = { ...picker, value }
  applyLayerColor(hsvToHex(picker.hue, picker.saturation, value))
}

const pickerAllowsFill = computed(() => layerColorPicker.value && searchableVectorServices()
  .some(service => String(service.id) === layerColorPicker.value?.serviceId && service.arcGisGeometryType === 'esriGeometryPolygon'))
function onFillOpacityInput(event: Event) {
  const id = layerColorPicker.value?.serviceId
  if (!id) return
  const opacity = Number((event.target as HTMLInputElement).value) / 100
  vectorFillOpacity.value = { ...vectorFillOpacity.value, [id]: opacity }
  const handle = jiulongAdminService.value && String(jiulongAdminService.value.id) === id ? jiulongAdminHandle : mapServiceLayers.get(id)
  handle?.setFillOpacity?.(opacity)
}

function applyLayerColor(color: string) {
  const picker = layerColorPicker.value
  if (!picker || !/^#[0-9a-fA-F]{6}$/.test(color)) return
  layerColorPicker.value = { ...picker, color }
  vectorLayerColors.value = { ...vectorLayerColors.value, [picker.serviceId]: color }
  rememberVectorLayerColor(picker.serviceId, color)
  const handle = jiulongAdminService.value && String(jiulongAdminService.value.id) === picker.serviceId ? jiulongAdminHandle : mapServiceLayers.get(picker.serviceId)
  const shades = handle?.setColor?.(color) || []
  const panel = vectorFilterPanels.value.find((item) => item.serviceId === picker.serviceId)
  panel?.items.forEach((item, index) => {
    const shade = shades[index]
    if (shade) item.color = shade
  })
}

function singleVectorService(group: MapServiceGroup) {
  const service = group.layers.length === 1 ? group.layers[0] : undefined
  return service?.arcGisGeometryType ? service : undefined
}

function isMapServiceGroupActive(group: MapServiceGroup) {
  return (jiulongBoundaryVisible.value && jiulongAdminSourceId.value === group.id)
    || group.layers.some((service) => visibleMapServiceIds.value.includes(String(service.id)) || loadingMapServiceIds.has(String(service.id)))
}

function isMapServiceGroupExpanded(group: MapServiceGroup) {
  return group.layers.length > 1 && expandedMapServiceGroupIds.value.includes(group.id)
}

function categoryPanelFor(service: MapServiceItem) {
  if (!visibleMapServiceIds.value.includes(String(service.id))) return
  return vectorFilterPanels.value.find((panel) => panel.serviceId === String(service.id))
}

function isCategoryExpanded(service: MapServiceItem) {
  return expandedCategoryIds.value.includes(String(service.id))
}

function toggleCategoryFolder(service: MapServiceItem) {
  const id = String(service.id)
  expandedCategoryIds.value = expandedCategoryIds.value.includes(id)
    ? expandedCategoryIds.value.filter((item) => item !== id)
    : [...expandedCategoryIds.value, id]
}

async function toggleMapServiceGroup(group: MapServiceGroup) {
  if (group.layers.length === 1) {
    await toggleMapService(group.layers[0]!)
    return
  }
  const hideGroup = isMapServiceGroupExpanded(group)
  expandedMapServiceGroupIds.value = hideGroup
    ? expandedMapServiceGroupIds.value.filter((id) => id !== group.id)
    : [...expandedMapServiceGroupIds.value, group.id]
  const targets = hideGroup || group.layers.some(service => visibleMapServiceIds.value.includes(String(service.id))) ? [] : group.layers.slice(0, 1)
  await Promise.all(targets.map(toggleMapService))
}

async function toggleMapServiceGroupVisibility(group: MapServiceGroup) {
  if (isMapServiceGroupActive(group)) {
    // 关闭父服务同时关闭从该服务抽取的行政边界；单独关闭兄弟子图层不影响边界。
    if (jiulongAdminSourceId.value === group.id) closeJiulongBoundary()
    group.layers.forEach(hideMapService)
  } else {
    await Promise.all(group.layers.map(toggleMapService))
  }
}

function applyVectorCategoryFilter(panel: VectorFilterPanel) {
  panel.apply(panel.items.filter(item => item.checked).map(item => item.value))
  if (attributeFilters.value[panel.serviceId]?.startsWith(`${panel.fieldLabel}：`)) {
    const next = { ...attributeFilters.value }; delete next[panel.serviceId]; attributeFilters.value = next
  }
  const selected = activeFeature.value
  if (selected?.serviceId === panel.serviceId && selected.category && panel.items.some(item => item.value === selected.category?.value && !item.checked)) clearSelectionHighlight()
}

async function onServiceRowClick(service: MapServiceItem) {
  if (categoryPanelFor(service)) toggleCategoryFolder(service)
  else await toggleMapService(service)
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
  void nextTick(() => {
    if (!baseLayersInitialized) initializeBaseLayers()
    else if (focusedSceneLayerId !== props.focusLayerId) focusSceneLayer()
  })
}

function focusHailingDistrict() {
  if (!map || props.focusLayerId || overviewFocused || jiulongBoundaryVisible.value || !HAILING_DISTRICT) return
  const bounds = L.geoJSON(HAILING_DISTRICT as GeoJsonObject).getBounds()
  if (!bounds.isValid()) return
  map.invalidateSize({ pan: false })
  // 中间地图窗口按完整边界自适应，不再额外放大一级，避免默认视野过近。
  map.fitBounds(bounds, { padding: [36, 36], maxZoom: 13, animate: false })
  overviewFocused = true
}

function scheduleOverviewFocus() {
  if (props.focusLayerId || overviewFocused) return
  void nextTick(() => {
    if (!baseLayersInitialized) initializeBaseLayers()
    else focusHailingDistrict()
  })
}

function initializeBaseLayers() {
  if (!map || baseLayersInitialized || props.focusGeometryPending) return
  // 此时尚无瓦片层：先应用最终初始视角，之后底图/注记只下载这个视角。
  // 场景无可用几何时保留城市视角，不让空/失败的范围请求阻塞底图。
  if (props.focusLayerId) focusSceneLayer()
  else focusHailingDistrict()
  baseLayersInitialized = true
  addBaseLayers(mapMode.value)
  void loadMapServices()
}

function clearSearchHighlight() {
  if (searchHighlightTimer !== undefined) window.clearInterval(searchHighlightTimer)
  if (searchHighlightClearTimer !== undefined) window.clearTimeout(searchHighlightClearTimer)
  searchHighlightTimer = undefined
  searchHighlightClearTimer = undefined
  searchHighlightGroup?.clearLayers()
}

function flashSearchLocation(location: MapServiceCategoryLocation) {
  if (!map || !searchHighlightGroup) return
  clearSearchHighlight()
  const outlines: L.LatLngExpression[][] = []
  const points: L.LatLngExpression[] = []
  const toLatLngs = (coordinates?: number[][]) => (coordinates || []).flatMap((coordinate) => {
    const [longitude, latitude] = coordinate
    return Number.isFinite(longitude) && Number.isFinite(latitude)
      ? [[latitude!, longitude!] as L.LatLngTuple]
      : []
  })
  for (const geometry of location.geometries) {
    for (const ring of geometry.rings || []) {
      const latLngs = toLatLngs(ring)
      if (latLngs.length > 1) outlines.push(latLngs)
    }
    for (const path of geometry.paths || []) {
      const latLngs = toLatLngs(path)
      if (latLngs.length > 1) outlines.push(latLngs)
    }
    for (const point of geometry.points || []) {
      const latLngs = toLatLngs([point])
      if (latLngs[0]) points.push(latLngs[0])
    }
    if (Number.isFinite(geometry.x) && Number.isFinite(geometry.y)) points.push([geometry.y!, geometry.x!])
  }

  const paths: L.Path[] = []
  if (outlines.length) {
    paths.push(L.polyline(outlines, {
      pane: 'search-highlight',
      interactive: false,
      color: '#ffe13b',
      weight: 5,
      opacity: 1,
    }).addTo(searchHighlightGroup))
  }
  for (const point of points) {
    paths.push(L.circleMarker(point, {
      pane: 'search-highlight',
      interactive: false,
      radius: 10,
      color: '#ffe13b',
      weight: 4,
      fillColor: '#fff176',
      fillOpacity: .35,
    }).addTo(searchHighlightGroup))
  }
  if (!paths.length) return

  let highlighted = true
  searchHighlightTimer = window.setInterval(() => {
    highlighted = !highlighted
    paths.forEach((path) => path.setStyle({
      opacity: highlighted ? 1 : .12,
      fillOpacity: highlighted ? .35 : .04,
    }))
  }, 220)
  searchHighlightClearTimer = window.setTimeout(clearSearchHighlight, 2200)
}

function clearSelectionHighlight() {
  selectionHighlightGroup?.clearLayers()
  featureCandidates.value = []
  if (map) setMapHoverSelection(map)
}

function pinFeatureHighlight(feature: IdentifiedMapFeature, _anchor?: L.LatLng, candidates: IdentifiedMapFeature[] = [feature]) {
  if (!map || !selectionHighlightGroup) return
  featureSelectionRequestVersion += 1
  clearSearchHighlight()
  clearSelectionHighlight()
  const outlines: L.LatLngExpression[][] = []
  const polygons: L.LatLngExpression[][] = []
  const points: L.LatLngExpression[] = []
  const toLatLngs = (coordinates?: number[][]) => (coordinates || []).flatMap((coordinate) => {
    const [longitude, latitude] = coordinate
    return Number.isFinite(longitude) && Number.isFinite(latitude) ? [[latitude!, longitude!] as L.LatLngTuple] : []
  })
  for (const geometry of feature.location.geometries) {
    for (const ring of geometry.rings || []) {
      const latLngs = toLatLngs(ring)
      if (latLngs.length > 2) polygons.push(latLngs)
    }
    for (const path of geometry.paths || []) {
      const latLngs = toLatLngs(path)
      if (latLngs.length > 1) outlines.push(latLngs)
    }
    for (const point of geometry.points || []) {
      const latLngs = toLatLngs([point])
      if (latLngs[0]) points.push(latLngs[0])
    }
    if (Number.isFinite(geometry.x) && Number.isFinite(geometry.y)) points.push([geometry.y!, geometry.x!])
  }
  polygons.forEach((ring) => L.polygon(ring, {
    pane: 'search-highlight',
    interactive: false,
    color: '#ffe14a',
    weight: 3,
    fillColor: '#ffe14a',
    fillOpacity: .28,
  }).addTo(selectionHighlightGroup!))
  if (outlines.length) {
    L.polyline(outlines, {
      pane: 'search-highlight',
      interactive: false,
      color: '#ffe14a',
      weight: 4,
    }).addTo(selectionHighlightGroup)
  }
  points.forEach((point) => L.circleMarker(point, {
    pane: 'search-highlight',
    interactive: false,
    radius: 9,
    color: '#ffe14a',
    weight: 3,
    fillColor: '#fff4a8',
    fillOpacity: .85,
  }).addTo(selectionHighlightGroup!))

  featureCandidates.value = candidates
  selectedFeatureIndex.value = Math.max(0, candidates.indexOf(feature))
  const service = searchableVectorServices().find(item => String(item.id) === feature.serviceId)
  setMapHoverSelection(map, service, feature)
}

async function focusParcelSearchResult(result: ParcelSearchResult) {
  if (!map) return
  attributeSearchRequestVersion += 1
  const panel = vectorFilterPanels.value.find(item => item.serviceId === result.serviceId)
  if (panel) {
    mapServiceLayers.get(result.serviceId)?.setAttributeFilter?.()
    panel.items.forEach(item => { item.checked = item.value === result.value })
    applyVectorCategoryFilter(panel)
    attributeFilters.value = { ...attributeFilters.value, [result.serviceId]: `${panel.fieldLabel}：${result.value}` }
  }
  clearSelectionHighlight()
  try {
    const location = await result.locate()
    const bounds = location.bounds
    if (!bounds?.isValid()) {
      showToolMessage(`${result.label} 暂无可定位的地块范围`)
      return
    }
    map.invalidateSize({ pan: false })
    map.fitBounds(bounds, { padding: [70, 70], maxZoom: 18, animate: true })
    flashSearchLocation(location)
    searchKeyword.value = ''
  } catch {
    showToolMessage(`${result.label} 地块范围查询失败`)
  }
}

function searchableVectorServices() {
  const services = mapServiceGroups.value.flatMap(group => group.layers)
  if (jiulongAdminService.value) services.push(jiulongAdminService.value)
  return services.filter(service => Number.isFinite(Number(service.arcGisLayerId)) && Boolean(service.arcGisGeometryType))
}

async function searchLayerAttributes(keyword: string) {
  const requestVersion = ++attributeSearchRequestVersion
  attributeSearchResults.value = []
  attributeSearchError.value = ''
  const text = keyword.trim()
  if (!text) { attributeSearchLoading.value = false; return }
  const services = searchableVectorServices()
  attributeSearchLoading.value = true
  const found: IdentifiedMapFeature[] = []
  let failed = 0
  try {
    for (let offset = 0; offset < services.length; offset += 4) {
      if (requestVersion !== attributeSearchRequestVersion) return
      const batch = await Promise.allSettled(services.slice(offset, offset + 4).map(service => searchVectorLayerText(service, text)))
      batch.forEach(result => { if (result.status === 'fulfilled') found.push(...result.value); else failed += 1 })
    }
    if (requestVersion !== attributeSearchRequestVersion) return
    const seen = new Set<string>()
    attributeSearchResults.value = found.filter(feature => {
      const identity = `${feature.serviceId}:${JSON.stringify(feature.rows)}:${JSON.stringify(feature.location.geometries)}`
      if (seen.has(identity)) return false
      seen.add(identity); return true
    })
    attributeSearchError.value = failed ? `${failed} 个图层查询失败，可重试；已显示其他图层的结果。` : ''
    const exact = attributeSearchGroups.value.filter(group => group.value.toLowerCase() === text.toLowerCase())
    if (exact.length) await focusAttributeGroups(exact, requestVersion)
    else if (attributeSearchGroups.value.length === 1) await focusAttributeGroups(attributeSearchGroups.value, requestVersion)
  } finally {
    if (requestVersion === attributeSearchRequestVersion) attributeSearchLoading.value = false
  }
}

async function focusAttributeGroups(groups: AttributeSearchGroup[], version = attributeSearchRequestVersion) {
  if (!map) return
  const bounds = L.latLngBounds([])
  for (const group of groups) {
    if (version !== attributeSearchRequestVersion) return
    const service = searchableVectorServices().find(item => String(item.id) === group.serviceId)
    if (!service) continue
    if (service === jiulongAdminService.value) {
      if (!jiulongBoundaryVisible.value) { jiulongBoundaryVisible.value = true; await renderJiulongBoundary(false); renderHailingBoundary() }
    } else if (!visibleMapServiceIds.value.includes(group.serviceId)) await toggleMapService(service)
    if (version !== attributeSearchRequestVersion) return
    const handle = service === jiulongAdminService.value ? jiulongAdminHandle : mapServiceLayers.get(group.serviceId)
    const panel = categoryPanelFor(service)
    if (panel?.fieldName === group.field) {
      handle?.setAttributeFilter?.()
      panel.items.forEach(item => { item.checked = item.value === group.value })
      applyVectorCategoryFilter(panel)
      expandedCategoryIds.value = [...new Set([...expandedCategoryIds.value, group.serviceId])]
    } else handle?.setAttributeFilter?.(group.field, group.value)
    attributeFilters.value = { ...attributeFilters.value, [group.serviceId]: `${group.label}：${group.value}` }
    const parent = mapServiceGroups.value.find(item => item.layers.some(layer => String(layer.id) === group.serviceId))
    if (parent && parent.layers.length > 1) expandedMapServiceGroupIds.value = [...new Set([...expandedMapServiceGroupIds.value, parent.id])]
    group.features.forEach(feature => { if (feature.location.bounds?.isValid()) bounds.extend(feature.location.bounds) })
  }
  if (version !== attributeSearchRequestVersion) return
  clearSelectionHighlight()
  if (bounds.isValid()) { map.invalidateSize({ pan:false }); map.fitBounds(bounds, { padding:[70,70],maxZoom:18,animate:true }) }
}
function clearAttributeFilter(service: MapServiceItem) {
  const id = String(service.id)
  const handle = service === jiulongAdminService.value ? jiulongAdminHandle : mapServiceLayers.get(id)
  handle?.setAttributeFilter?.()
  const panel = categoryPanelFor(service)
  if (panel) { panel.items.forEach(item => { item.checked = true }); applyVectorCategoryFilter(panel) }
  const next = { ...attributeFilters.value }; delete next[id]; attributeFilters.value = next
}

async function identifyClickedFeature(event: L.LeafletMouseEvent) {
  if (!map || activeTool.value) return
  const pixel = map.latLngToContainerPoint(event.latlng)
  const northWest = map.containerPointToLatLng(pixel.subtract([8, 8]))
  const southEast = map.containerPointToLatLng(pixel.add([8, 8]))
  const envelope = {
    west: Math.min(northWest.lng, southEast.lng),
    south: Math.min(northWest.lat, southEast.lat),
    east: Math.max(northWest.lng, southEast.lng),
    north: Math.max(northWest.lat, southEast.lat),
  }
  const requestVersion = ++featureSelectionRequestVersion
  const services = searchableVectorServices().filter(service => service !== jiulongAdminService.value
    && !/九龙镇行政区/.test(service.name) && visibleMapServiceIds.value.includes(String(service.id)))
  const results = await Promise.allSettled(services.map(service => {
    const handle = service === jiulongAdminService.value ? jiulongAdminHandle : mapServiceLayers.get(String(service.id))
    return identifyVectorFeatures(service, envelope, handle?.definitionExpression?.() || '1=1')
  }))
  if (requestVersion !== featureSelectionRequestVersion || !map || activeTool.value) return
  const candidates = results.flatMap(result => result.status === 'fulfilled' ? result.value : [])
  if (candidates[0]) pinFeatureHighlight(candidates[0], event.latlng, candidates)
  else clearSelectionHighlight()
}

async function toggleSearch() {
  searchExpanded.value = !searchExpanded.value
  if (!searchExpanded.value) {
    searchKeyword.value = ''
    return
  }
  await nextTick()
  searchInput.value?.focus()
}

function focusFirstSearchResult() {
  const attribute = attributeSearchGroups.value[0]
  if (attribute) {
    void focusAttributeGroups([attribute])
    return
  }
  const parcel = parcelSearchResults.value[0]
  if (parcel) void focusParcelSearchResult(parcel)
}

function locateUser() {
  if (!map) return
  if (!navigator.geolocation) {
    showToolMessage('当前浏览器不支持定位')
    return
  }
  locating.value = true
  showToolMessage('正在获取当前位置…', 10000)
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      locating.value = false
      locationGroup?.clearLayers()
      const point = L.latLng(coords.latitude, coords.longitude)
      L.circle(point, { radius: Math.max(coords.accuracy, 20), color: '#33d9ff', fillOpacity: .12 }).addTo(locationGroup!)
      L.circleMarker(point, { radius: 7, color: '#fff', fillColor: '#17bce0', fillOpacity: 1, weight: 2 })
        .bindPopup(`当前位置<br>定位精度约 ${Math.round(coords.accuracy)} 米`).addTo(locationGroup!).openPopup()
      map?.setView(point, 15)
      showToolMessage('定位成功')
    },
    () => {
      locating.value = false
      showToolMessage('定位失败，请允许浏览器访问位置')
    },
    { enableHighAccuracy: true, timeout: 10000 },
  )
}

function resetNorth() {
  if (!map || !HAILING_DISTRICT) return
  const bounds = jiulongBoundaryVisible.value ? jiulongAdminHandle?.bounds
    : L.geoJSON(HAILING_DISTRICT as GeoJsonObject).getBounds()
  if (!bounds?.isValid()) return
  map.invalidateSize({ pan: false })
  // 与首页刷新后的默认定位参数完全一致：展示完整海陵区边界并保持正北。
  map.fitBounds(bounds, { padding: [36, 36], maxZoom: 13, animate: true })
  overviewFocused = true
  showToolMessage(`已回到${jiulongBoundaryVisible.value ? '九龙镇' : '海陵区'}视角，地图保持正北向上`)
}

function toggleMeasureMenu() {
  measureOpen.value = !measureOpen.value
  if (!measureOpen.value && (activeTool.value === 'distance' || activeTool.value === 'area')) activeTool.value = null
}

const markerHint = '点击地图添加可拖动标注'

function clearMarkerHint() {
  if (markerHintTimer) window.clearTimeout(markerHintTimer)
  markerHintTimer = undefined
  if (measureResult.value === markerHint) measureResult.value = ''
}

function startTool(tool: 'distance' | 'area' | 'marker') {
  clearMarkerHint()
  activeTool.value = activeTool.value === tool ? null : tool
  measureOpen.value = tool !== 'marker'
  baseMapOpen.value = false
  measurePoints = []
  if (tool !== 'marker') measureGroup?.clearLayers()
  measureResult.value = activeTool.value === 'distance' ? '点击地图连续选取测距点，单击鼠标右键结束' : activeTool.value === 'area' ? '点击地图绘制范围，单击鼠标右键结束' : activeTool.value === 'marker' ? markerHint : ''
  if (activeTool.value === 'marker') markerHintTimer = window.setTimeout(clearMarkerHint, 4000)
}

function redrawMeasurement(cursor?: L.LatLng) {
  if (!map || !measureGroup) return
  measureGroup.clearLayers()
  measurePoints.forEach((point, index) => {
    L.circleMarker(point, { radius: 4, color: '#fff', fillColor: '#21dff1', fillOpacity: 1, weight: 1, interactive: false })
      .bindTooltip(String(index + 1), { permanent: true, className: 'measure-index', direction: 'top' }).addTo(measureGroup!)
  })
  const previewPoints = cursor ? [...measurePoints, cursor] : measurePoints
  if (activeTool.value === 'distance' && previewPoints.length > 1) {
    L.polyline(previewPoints, { color: '#22e5f4', weight: 3, dashArray: cursor ? '7 5' : undefined, interactive: false }).addTo(measureGroup)
    const distance = previewPoints.slice(1).reduce((sum, point, index) => sum + map!.distance(previewPoints[index]!, point), 0)
    measureResult.value = `测量距离：${formatDistance(distance)}`
  }
  if (activeTool.value === 'area' && previewPoints.length > 1) {
    const options: L.PathOptions = { color: '#38e7c0', fillColor: '#1abf9b', fillOpacity: .22, weight: 2, dashArray: cursor ? '7 5' : undefined, interactive: false }
    if (previewPoints.length > 2) {
      L.polygon(previewPoints, options).addTo(measureGroup)
      measureResult.value = `测量面积：${formatArea(geodesicArea(previewPoints))} · 右键结束`
    } else {
      L.polyline(previewPoints, options).addTo(measureGroup)
    }
  }
}

function finishMeasurement(event: L.LeafletMouseEvent) {
  if (activeTool.value !== 'distance' && activeTool.value !== 'area') return
  event.originalEvent.preventDefault()
  const completedTool = activeTool.value
  const minimum = completedTool === 'area' ? 3 : 2
  if (measurePoints.length < minimum) {
    showToolMessage(completedTool === 'area' ? '面积测量至少需要选择 3 个点' : '距离测量至少需要选择 2 个点')
    return
  }
  // 先移除跟随鼠标的临时点并重绘最终形状，再退出绘制状态。
  redrawMeasurement()
  activeTool.value = null
  if (completedTool === 'area') measureResult.value = `测量面积：${formatArea(geodesicArea(measurePoints))}`
  else {
    const distance = measurePoints.slice(1).reduce((sum, point, index) => sum + map!.distance(measurePoints[index]!, point), 0)
    measureResult.value = `测量距离：${formatDistance(distance)}`
  }
}

function addAnnotation(point: L.LatLng) {
  clearMarkerHint()
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
  clearMarkerHint()
  annotationGroup?.clearLayers()
  if (activeTool.value === 'marker') activeTool.value = null
  showToolMessage('已清除全部标注')
}

function switchMode(mode: 'vector' | 'image') {
  mapMode.value = mode
  if (baseLayersInitialized) addBaseLayers(mode)
  baseMapOpen.value = false
}

function renderHailingBoundary() {
  hailingBoundaryGroup?.remove()
  hailingBoundaryGroup = undefined
  // 九龙镇边界与默认行政区划互斥，同时只显示其中一套。
  if (!map || props.focusLayerId || !HAILING_DISTRICT || jiulongBoundaryVisible.value || user.organizationId === 'agriculture-rural') return
  hailingBoundaryGroup = L.layerGroup()
  const boundary = HAILING_DISTRICT as GeoJsonObject
  // Leaflet uses Canvas here, so a second stroke provides a reliable 50% dark-blue halo.
  L.geoJSON(boundary, {
    pane: 'administrative-boundaries',
    interactive: false,
    style: {
      color: '#135888',
      weight: 10,
      opacity: .5,
      fill: false,
      lineCap: 'round',
      lineJoin: 'round',
    },
  }).addTo(hailingBoundaryGroup)
  L.geoJSON(boundary, {
    pane: 'administrative-boundaries',
    interactive: false,
    style: {
      color: '#9AEEFE',
      weight: 4,
      opacity: 1,
      fill: false,
      lineCap: 'round',
      lineJoin: 'round',
      className: 'hailing-boundary-glow',
    },
  }).addTo(hailingBoundaryGroup)
  hailingBoundaryGroup.addTo(map)
}

function detachJiulongAdminLayer(source: MapServiceItem, layers: MapServiceItem[]) {
  const admin = layers.find((layer) => /九龙镇行政区/.test(layer.name))
  const rest = layers.filter((layer) => layer !== admin)
  if (!admin || !rest.length) return layers
  const fromFarmland = /永久基本农田/.test(source.name)
  if (!fromFarmland && jiulongAdminService.value) return layers
  jiulongAdminService.value = admin
  jiulongAdminSourceId.value = String(source.id)
  return rest
}

function closeJiulongBoundary(clearError = true) {
  jiulongAdminRequest += 1
  jiulongAdminHandle?.layer.remove()
  jiulongAdminHandle = undefined
  jiulongBoundaryVisible.value = false
  jiulongBoundaryLoading.value = false
  jiulongAdminPendingFit = false
  if (clearError) jiulongBoundaryError.value = ''
  if (activeFeature.value?.serviceId === String(jiulongAdminService.value?.id)) clearSelectionHighlight()
  renderHailingBoundary()
}

async function renderJiulongBoundary(fit: boolean) {
  const request = ++jiulongAdminRequest
  jiulongAdminHandle?.layer.remove()
  jiulongAdminHandle = undefined
  if (!map || !jiulongBoundaryVisible.value) return
  jiulongBoundaryError.value = ''
  const service = jiulongAdminService.value
  if (!service) {
    if (mapServicesLoading.value) {
      if (fit) jiulongAdminPendingFit = true
      return
    }
    closeJiulongBoundary(false)
    jiulongBoundaryError.value = '当前可用服务中未找到九龙镇行政区边界，已关闭显示。请检查来源服务是否启用。'
    return
  }
  const shouldFit = fit || jiulongAdminPendingFit
  jiulongAdminPendingFit = false
  jiulongBoundaryLoading.value = true
  try {
    const color = vectorLayerColors.value[String(service.id)] = vectorLayerColors.value[String(service.id)] || '#9AEEFE'
    const handle = await createAdministrativeBoundaryLayer(service, color)
    if (request !== jiulongAdminRequest || !map || !jiulongBoundaryVisible.value) {
      handle.layer.remove()
      return
    }
    jiulongAdminHandle = handle
    handle.setFillOpacity?.(vectorFillOpacity.value[String(service.id)] ?? .1)
    handle.layer.addTo(map)
    if (shouldFit && handle.bounds?.isValid()) {
      map.fitBounds(handle.bounds, { padding: [48, 48], maxZoom: 15, animate: true })
      overviewFocused = true
    }
  } catch (reason) {
    if (request !== jiulongAdminRequest) return
    closeJiulongBoundary(false)
    jiulongBoundaryError.value = reason instanceof Error ? reason.message : '九龙镇行政区加载失败'
  } finally {
    if (request === jiulongAdminRequest) jiulongBoundaryLoading.value = false
  }
}

function toggleJiulongBoundary() {
  if (jiulongBoundaryVisible.value) {
    closeJiulongBoundary()
    return
  }
  jiulongBoundaryError.value = ''
  jiulongBoundaryVisible.value = true
  void renderJiulongBoundary(true)
  renderHailingBoundary()
}

function retryJiulongBoundary() {
  jiulongBoundaryError.value = ''
  jiulongBoundaryVisible.value = true
  jiulongAdminPendingFit = true
  if (jiulongAdminService.value) void renderJiulongBoundary(true)
  else void loadMapServices()
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
    if (!container.value) return
    baseLayersInitialized = false
    mapServicePaneNames.clear()
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
    const searchHighlightPane = map.createPane('search-highlight')
    searchHighlightPane.style.zIndex = '640'
    searchHighlightPane.style.pointerEvents = 'none'
    measureGroup = L.layerGroup().addTo(map)
    annotationGroup = L.layerGroup().addTo(map)
    locationGroup = L.layerGroup().addTo(map)
    searchHighlightGroup = L.layerGroup().addTo(map)
    selectionHighlightGroup = L.layerGroup().addTo(map)
    renderHailingBoundary()
    initializeBaseLayers()
    updateScale()
    map.on('moveend zoomend resize', updateScale)
    map.on('click', (event) => {
      if (activeTool.value === 'marker') addAnnotation(event.latlng)
      if (activeTool.value === 'distance' || activeTool.value === 'area') {
        measurePoints.push(event.latlng)
        redrawMeasurement()
        return
      }
      if (!activeTool.value) void identifyClickedFeature(event)
    })
    window.removeEventListener('pointerdown', closeLayerMenus)
    window.addEventListener('pointerdown', closeLayerMenus)
    map.on('mousemove', (event) => {
      if ((activeTool.value === 'distance' || activeTool.value === 'area') && measurePoints.length) redrawMeasurement(event.latlng)
    })
    map.on('contextmenu', finishMeasurement)
    resizeObserver = new ResizeObserver(() => {
      if (resizeFrame !== undefined) window.cancelAnimationFrame(resizeFrame)
      resizeFrame = window.requestAnimationFrame(() => {
        map?.invalidateSize({ pan: false })
        updateScale()
      })
    })
    resizeObserver.observe(container.value)
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
watch(() => user.activeDeptId, () => { if (map && baseLayersInitialized) void loadMapServices() })
watch(() => props.focusGeometryPending, () => { initializeBaseLayers() })
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
    attributeSearchRequestVersion += 1
    attributeSearchResults.value = []
    attributeSearchLoading.value = false
    return
  }
  searchFocusTimer = window.setTimeout(() => {
    const keyword = value.trim()
    void searchLayerAttributes(keyword)
  }, 260)
})
onBeforeUnmount(() => {
  if (toolMessageTimer) window.clearTimeout(toolMessageTimer)
  if (markerHintTimer) window.clearTimeout(markerHintTimer)
  if (searchFocusTimer) window.clearTimeout(searchFocusTimer)
  clearSearchHighlight()
  clearSelectionHighlight()
  window.removeEventListener('pointerdown', closeLayerMenus)
  if (resizeFrame !== undefined) window.cancelAnimationFrame(resizeFrame)
  resizeObserver?.disconnect()
  mapServiceLayers.forEach((handle) => handle.layer.remove())
  mapServiceLayers.clear()
  jiulongAdminRequest += 1
  jiulongAdminHandle?.layer.remove()
  jiulongAdminHandle = undefined
  map?.remove()
  map = undefined
})
</script>

<template>
  <div class="dashboard-map" :class="{ 'dashboard-map--floating': floatingControls, 'dashboard-map--clear-screen': screenCleared, 'dashboard-map--has-measure-result': Boolean(measureResult), 'dashboard-map--measuring': activeTool === 'distance' || activeTool === 'area' || activeTool === 'marker' }">
    <div ref="container" class="dashboard-map__canvas"></div>
    <div v-if="mapError" class="dashboard-map__empty"><span>{{ mapError }}</span><button @click="retryMap">重新加载</button></div>
    <div v-else-if="!mapReady" class="dashboard-map__loading">正在加载江苏泰州天地图…</div>

    <div class="left-map-rail">
    <div class="layer-panel-stack" :class="{ 'is-collapsed': layerPanelCollapsed }">
      <button v-if="floatingControls" class="layer-panel-toggle" type="button" :aria-label="layerPanelCollapsed ? '展开图层管理' : '收起图层管理'" :aria-controls="layerPanelId" :aria-expanded="!layerPanelCollapsed" @click="toggleLayerPanel">
        <svg class="layer-stack-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 9 5-9 5-9-5zM3 12l9 5 9-5M3 17l9 5 9-5" /></svg>
        <span>图层管理</span><b class="layer-panel-count">{{ mapServiceGroups.length }}</b><svg class="layer-panel-chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
      </button>
      <button v-else
        class="layer-panel-handle"
        type="button"
        :aria-label="layerPanelCollapsed ? '展开图层管理' : '收起图层管理'"
        :aria-expanded="!layerPanelCollapsed"
        :title="layerPanelCollapsed ? '展开' : '收起'"
        @click="toggleLayerPanel"
      >{{ layerPanelCollapsed ? '图层管理 ⌄' : '⌃' }}</button>
      <div class="layer-panel-reveal">
      <aside :id="layerPanelId" class="layer-manager" :inert="layerPanelCollapsed" :aria-hidden="layerPanelCollapsed">
        <div v-if="!floatingControls" class="tool-title"><b><svg class="layer-stack-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 9 5-9 5-9-5zM3 12l9 5 9-5M3 17l9 5 9-5" /></svg>图层管理</b><span class="tool-title-state">{{ mapServiceGroups.length }} 项服务</span></div>
        <div v-if="floatingControls" :id="`${layerPanelId}-search`" class="layer-manager-search"></div>
        <div class="layer-manager-list" :aria-busy="mapServiceOrderSaving">
          <div class="region-filter"><label>行政区划</label><button type="button" class="region-picker-trigger" :title="regionPickerOpen ? '收起' : '展开'" :aria-expanded="regionPickerOpen" @click="regionPickerOpen = !regionPickerOpen">{{ selectedRegionLabel }} <span>{{ regionPickerOpen ? '⌃' : '⌄' }}</span></button><div v-if="regionPickerOpen" class="region-picker"><button type="button" class="region-option" :class="{ active: selectedRegion === 'all' }" @click="selectedRegion = 'all'; regionPickerOpen = false">全部图层</button><section v-for="regionGroup in regionSelectionOptions" :key="regionGroup.dataType"><strong>{{ regionGroup.dataTypeName || regionGroup.dataType }}</strong><template v-for="entry in regionGroup.entries" :key="regionKey(regionGroup.dataType, entry.node.code)"><button type="button" class="region-node region-node-select" :class="{ active: selectedRegion === regionKey(regionGroup.dataType, entry.node.code) }" :style="{ paddingLeft: `${12 + entry.depth * 10}px` }" :aria-expanded="entry.node.children?.length ? expandedRegions.includes(regionKey(regionGroup.dataType, entry.node.code)) : undefined" @click="selectRegion(regionGroup.dataType, entry.node)"><span>{{ entry.node.name }}（{{ regionServiceCount(regionGroup.dataType, entry.node.code) }}）</span><span v-if="entry.node.children?.length" class="region-node-toggle" :title="expandedRegions.includes(regionKey(regionGroup.dataType, entry.node.code)) ? '收起' : '展开'" aria-hidden="true">{{ expandedRegions.includes(regionKey(regionGroup.dataType, entry.node.code)) ? '⌄' : '›' }}</span></button>          <div v-if="selectedRegion === regionKey(regionGroup.dataType, entry.node.code) || expandedRegions.includes(regionKey(regionGroup.dataType, entry.node.code))" class="map-service-sort-list region-service-list" :style="{ '--region-layer-indent': `${entry.depth * 10 + 10}px` }">
            <div v-for="(group, groupIndex) in mapServiceGroups.filter(item => item.source.dataType === regionGroup.dataType && (item.source.regionCode || null) === entry.node.code)" :key="group.id" class="map-service-group" :class="{ 'is-dragging': draggingGroupId === group.id }" :data-group-id="group.id" :data-layer-kind="groupKind(group)">
              <button :style="{ paddingLeft: `${12 + entry.depth * 10}px` }" :disabled="pendingGroupIds.has(group.id)" class="layer-row map-service-row" :class="{ active: isMapServiceGroupActive(group), 'has-categories': group.layers.length === 1 && categoryPanelFor(group.layers[0]!) }" :title="`${group.name}(长按可拖动排序)`" :role="group.layers.length === 1 ? 'switch' : undefined" :aria-checked="group.layers.length === 1 ? isMapServiceGroupActive(group) : undefined" :aria-expanded="group.layers.length > 1 ? isMapServiceGroupExpanded(group) : (group.layers[0] ? isCategoryExpanded(group.layers[0]) : undefined)" @pointerdown="onMapServicePointerDown($event, group)" @click="onMapServiceGroupClick(group)" @contextmenu="onGroupContextMenu($event, group)">
                <i class="layer-kind" :style="groupIconColor(group)"><Picture v-if="layerIconKind(group.source) === 'imagery'" /><MapLocation v-else-if="group.layers.some(service => service.arcGisGeometryType)" /><svg v-else class="layer-stack-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 9 5-9 5-9-5zM3 12l9 5 9-5M3 17l9 5 9-5" /></svg></i><span><b>{{ group.name }}</b></span><em role="switch" tabindex="0" :aria-checked="isMapServiceGroupActive(group)" :aria-label="`切换${group.name}可视性`" :title="isMapServiceGroupActive(group) ? '关闭整个服务及其依赖边界' : '显示服务图层'" @pointerdown.stop @click.stop="toggleMapServiceGroupVisibility(group)" @keydown.enter.stop.prevent="toggleMapServiceGroupVisibility(group)">{{ isMapServiceGroupActive(group) ? '●' : '○' }}</em>
              </button>
              <div v-if="group.layers.length === 1 && attributeFilters[String(group.layers[0]!.id)]" class="attribute-filter-chip">{{ attributeFilters[String(group.layers[0]!.id)] }}<button type="button" aria-label="清除属性筛选" @click="clearAttributeFilter(group.layers[0]!)">×</button></div>
              <div v-if="group.layers.length === 1 && categoryPanelFor(group.layers[0]!) && isCategoryExpanded(group.layers[0]!)" class="map-service-sublayers category-folder">
                <div class="category-field-label">{{ categoryPanelFor(group.layers[0]!)!.fieldLabel }}</div>
                <label class="layer-row map-service-row category-row">
                  <i class="category-swatch category-swatch--all"></i><span><b>全部类型</b></span>
                  <input type="checkbox" :checked="allVectorCategoriesChecked(categoryPanelFor(group.layers[0]!)!)" :indeterminate="someVectorCategoriesChecked(categoryPanelFor(group.layers[0]!)!)" @change="toggleAllVectorCategories(categoryPanelFor(group.layers[0]!)!, $event)" />
                </label>
                <label v-for="item in categoryPanelFor(group.layers[0]!)!.items" :key="item.value" class="layer-row map-service-row category-row">
                  <i class="category-swatch" :style="{ background: item.color }"></i><span><b>{{ item.label }}</b></span>
                  <input v-model="item.checked" type="checkbox" @change="applyVectorCategoryFilter(categoryPanelFor(group.layers[0]!)!)" />
                </label>
              </div>
              <div v-if="isMapServiceGroupExpanded(group)" class="map-service-sublayers">
                <div v-for="service in group.layers" :key="service.id" class="map-service-leaf">
                  <button class="layer-row map-service-row map-service-sublayer" :class="{ active: visibleMapServiceIds.includes(String(service.id)), 'has-categories': categoryPanelFor(service) }" :title="service.name" role="switch" :aria-checked="visibleMapServiceIds.includes(String(service.id))" :aria-expanded="categoryPanelFor(service) ? isCategoryExpanded(service) : undefined" @click="onServiceRowClick(service)" @contextmenu="onSublayerContextMenu($event, service)">
                    <i class="layer-kind" :style="vectorRowColor(service) ? { color: vectorRowColor(service) } : undefined"><MapLocation v-if="service.arcGisGeometryType" /><Picture v-else /></i><span><b>{{ service.name }}</b></span><em role="switch" tabindex="0" :aria-checked="visibleMapServiceIds.includes(String(service.id))" :aria-label="`切换${service.name}可视性`" @click.stop="toggleMapService(service)" @keydown.enter.stop.prevent="toggleMapService(service)" :title="visibleMapServiceIds.includes(String(service.id)) ? '隐藏' : '显示'">{{ visibleMapServiceIds.includes(String(service.id)) ? '●' : '○' }}</em>
                  </button>
                  <div v-if="attributeFilters[String(service.id)]" class="attribute-filter-chip">{{ attributeFilters[String(service.id)] }}<button type="button" aria-label="清除属性筛选" @click="clearAttributeFilter(service)">×</button></div>
                  <div v-if="categoryPanelFor(service) && isCategoryExpanded(service)" class="category-folder">
                    <div class="category-field-label">{{ categoryPanelFor(service)!.fieldLabel }}</div>
                    <label class="layer-row map-service-row category-row">
                      <i class="category-swatch category-swatch--all"></i><span><b>全部类型</b></span>
                      <input type="checkbox" :checked="allVectorCategoriesChecked(categoryPanelFor(service)!)" :indeterminate="someVectorCategoriesChecked(categoryPanelFor(service)!)" @change="toggleAllVectorCategories(categoryPanelFor(service)!, $event)" />
                    </label>
                    <label v-for="item in categoryPanelFor(service)!.items" :key="item.value" class="layer-row map-service-row category-row">
                      <i class="category-swatch" :style="{ background: item.color }"></i><span><b>{{ item.label }}</b></span>
                      <input v-model="item.checked" type="checkbox" @change="applyVectorCategoryFilter(categoryPanelFor(service)!)" />
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div></template></section></div><small v-if="regionTreeError">{{ regionTreeError }}，可选择全部图层</small></div>
          <div v-if="mapServiceOrderSaving" class="layer-order-save-status" role="status">正在保存共享排序…</div>
          <div v-if="selectedRegion === 'all' && jiulongAdminService" class="map-service-group administrative-boundary-group">
            <button class="layer-row map-service-row" @contextmenu="jiulongAdminService && onLayerContextMenu($event, jiulongAdminService)" :class="{ active: jiulongBoundaryVisible }" type="button" title="九龙镇行政区划边界" role="switch" :aria-checked="jiulongBoundaryVisible" @click="toggleJiulongBoundary">
              <i class="layer-kind" :style="jiulongAdminService ? { color: vectorRowColor(jiulongAdminService) } : undefined"><MapLocation /></i><span><b>九龙镇行政区划边界</b></span><em :title="jiulongBoundaryVisible ? '隐藏' : '显示'">{{ jiulongBoundaryVisible ? '●' : '○' }}</em>
            </button>
          </div>
          <div v-if="jiulongBoundaryError" class="layer-panel-message error" role="status">{{ jiulongBoundaryError }} <button type="button" :disabled="mapServicesLoading" @click="retryJiulongBoundary">重试</button></div>
          <div v-if="mapServicesError" class="layer-panel-message error">{{ mapServicesError }}</div>
          <div v-else-if="!mapServicesLoading && !mapServiceGroups.length" class="layer-panel-message">暂无可用的地图服务</div>
          <TransitionGroup v-else-if="selectedRegion === 'all'" tag="div" name="map-service-sort" class="map-service-sort-list">
            <div v-for="(group, groupIndex) in visibleServiceGroups" :key="group.id" class="map-service-group" :class="{ 'is-dragging': draggingGroupId === group.id }" :data-group-id="group.id" :data-layer-kind="groupKind(group)"><div v-if="groupIndex === 0 || groupKind(visibleServiceGroups[groupIndex - 1]!) !== groupKind(group)" class="map-service-kind-label">{{ groupKind(group) === 'vector' ? '矢量图层' : '影像图层' }}</div>
              <button :disabled="pendingGroupIds.has(group.id)" class="layer-row map-service-row" :class="{ active: isMapServiceGroupActive(group), 'has-categories': group.layers.length === 1 && categoryPanelFor(group.layers[0]!) }" :title="`${group.name}(长按可拖动排序)`" :role="group.layers.length === 1 ? 'switch' : undefined" :aria-checked="group.layers.length === 1 ? isMapServiceGroupActive(group) : undefined" :aria-expanded="group.layers.length > 1 ? isMapServiceGroupExpanded(group) : (group.layers[0] ? isCategoryExpanded(group.layers[0]) : undefined)" @pointerdown="onMapServicePointerDown($event, group)" @click="onMapServiceGroupClick(group)" @contextmenu="onGroupContextMenu($event, group)">
                <i class="layer-kind" :style="groupIconColor(group)"><Picture v-if="layerIconKind(group.source) === 'imagery'" /><MapLocation v-else-if="group.layers.some(service => service.arcGisGeometryType)" /><svg v-else class="layer-stack-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 9 5-9 5-9-5zM3 12l9 5 9-5M3 17l9 5 9-5" /></svg></i><span><b>{{ group.name }}</b></span><em role="switch" tabindex="0" :aria-checked="isMapServiceGroupActive(group)" :aria-label="`切换${group.name}可视性`" :title="isMapServiceGroupActive(group) ? '关闭整个服务及其依赖边界' : '显示服务图层'" @pointerdown.stop @click.stop="toggleMapServiceGroupVisibility(group)" @keydown.enter.stop.prevent="toggleMapServiceGroupVisibility(group)">{{ isMapServiceGroupActive(group) ? '●' : '○' }}</em>
              </button>
              <div v-if="group.layers.length === 1 && attributeFilters[String(group.layers[0]!.id)]" class="attribute-filter-chip">{{ attributeFilters[String(group.layers[0]!.id)] }}<button type="button" aria-label="清除属性筛选" @click="clearAttributeFilter(group.layers[0]!)">×</button></div>
              <div v-if="group.layers.length === 1 && categoryPanelFor(group.layers[0]!) && isCategoryExpanded(group.layers[0]!)" class="map-service-sublayers category-folder">
                <div class="category-field-label">{{ categoryPanelFor(group.layers[0]!)!.fieldLabel }}</div>
                <label class="layer-row map-service-row category-row">
                  <i class="category-swatch category-swatch--all"></i><span><b>全部类型</b></span>
                  <input type="checkbox" :checked="allVectorCategoriesChecked(categoryPanelFor(group.layers[0]!)!)" :indeterminate="someVectorCategoriesChecked(categoryPanelFor(group.layers[0]!)!)" @change="toggleAllVectorCategories(categoryPanelFor(group.layers[0]!)!, $event)" />
                </label>
                <label v-for="item in categoryPanelFor(group.layers[0]!)!.items" :key="item.value" class="layer-row map-service-row category-row">
                  <i class="category-swatch" :style="{ background: item.color }"></i><span><b>{{ item.label }}</b></span>
                  <input v-model="item.checked" type="checkbox" @change="applyVectorCategoryFilter(categoryPanelFor(group.layers[0]!)!)" />
                </label>
              </div>
              <div v-if="isMapServiceGroupExpanded(group)" class="map-service-sublayers">
                <div v-for="service in group.layers" :key="service.id" class="map-service-leaf">
                  <button class="layer-row map-service-row map-service-sublayer" :class="{ active: visibleMapServiceIds.includes(String(service.id)), 'has-categories': categoryPanelFor(service) }" :title="service.name" role="switch" :aria-checked="visibleMapServiceIds.includes(String(service.id))" :aria-expanded="categoryPanelFor(service) ? isCategoryExpanded(service) : undefined" @click="onServiceRowClick(service)" @contextmenu="onSublayerContextMenu($event, service)">
                    <i class="layer-kind" :style="vectorRowColor(service) ? { color: vectorRowColor(service) } : undefined"><MapLocation v-if="service.arcGisGeometryType" /><Picture v-else /></i><span><b>{{ service.name }}</b></span><em role="switch" tabindex="0" :aria-checked="visibleMapServiceIds.includes(String(service.id))" :aria-label="`切换${service.name}可视性`" @click.stop="toggleMapService(service)" @keydown.enter.stop.prevent="toggleMapService(service)" :title="visibleMapServiceIds.includes(String(service.id)) ? '隐藏' : '显示'">{{ visibleMapServiceIds.includes(String(service.id)) ? '●' : '○' }}</em>
                  </button>
                  <div v-if="attributeFilters[String(service.id)]" class="attribute-filter-chip">{{ attributeFilters[String(service.id)] }}<button type="button" aria-label="清除属性筛选" @click="clearAttributeFilter(service)">×</button></div>
                  <div v-if="categoryPanelFor(service) && isCategoryExpanded(service)" class="category-folder">
                    <div class="category-field-label">{{ categoryPanelFor(service)!.fieldLabel }}</div>
                    <label class="layer-row map-service-row category-row">
                      <i class="category-swatch category-swatch--all"></i><span><b>全部类型</b></span>
                      <input type="checkbox" :checked="allVectorCategoriesChecked(categoryPanelFor(service)!)" :indeterminate="someVectorCategoriesChecked(categoryPanelFor(service)!)" @change="toggleAllVectorCategories(categoryPanelFor(service)!, $event)" />
                    </label>
                    <label v-for="item in categoryPanelFor(service)!.items" :key="item.value" class="layer-row map-service-row category-row">
                      <i class="category-swatch" :style="{ background: item.color }"></i><span><b>{{ item.label }}</b></span>
                      <input v-model="item.checked" type="checkbox" @change="applyVectorCategoryFilter(categoryPanelFor(service)!)" />
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </TransitionGroup>
        </div>
      </aside>
      </div>
    </div>

    <aside class="map-tools">
      <div class="map-mode-switch" aria-label="底图选择">
        <button type="button" :class="{ active: mapMode === 'image' }" aria-label="卫星地图" :aria-pressed="mapMode === 'image'" @click="switchMode('image')"><i class="map-tool-icon"><Picture /></i><span>卫星地图</span></button>
        <button type="button" :class="{ active: mapMode === 'vector' }" aria-label="电子地图" :aria-pressed="mapMode === 'vector'" @click="switchMode('vector')"><i class="map-tool-icon"><MapLocation /></i><span>电子地图</span></button>
      </div>
      <button type="button" :class="{ 'is-busy': locating }" aria-label="定位当前位置" :aria-busy="locating" @click="locateUser"><i class="map-tool-icon"><Aim /></i><span>定位当前位置</span></button>
      <button type="button" aria-label="回到默认视角" @click="resetNorth"><i class="map-tool-icon"><Compass /></i><span>回到默认视角</span></button>
      <div class="measure-tool" :class="{ 'is-open': measureOpen }">
        <button type="button" :class="{ active: measureOpen || activeTool === 'distance' || activeTool === 'area' }" aria-label="测量工具" :aria-expanded="measureOpen" @click="toggleMeasureMenu"><i class="map-tool-icon"><EditPen /></i><span>测量工具</span></button>
        <div v-if="measureOpen" class="tool-submenu right-submenu">
          <button type="button" :class="{ active: activeTool === 'distance' }" @click="startTool('distance')">距离测量</button>
          <button type="button" :class="{ active: activeTool === 'area' }" @click="startTool('area')">面积测量</button>
          <button type="button" @click="clearMeasurements">清除测量</button>
        </div>
      </div>
      <button type="button" :class="{ active: activeTool === 'marker' }" aria-label="添加标注" :aria-pressed="activeTool === 'marker'" @click="startTool('marker')"><i class="map-tool-icon"><Location /></i><span>添加标注</span></button>
      <button type="button" aria-label="清除标注" @click="clearAnnotations"><i class="map-tool-icon"><Delete /></i><span>清除标注</span></button>
      <button v-if="floatingControls" type="button" :class="{ active: screenCleared }" :aria-label="screenCleared ? '恢复地图面板' : '地图窗口清屏'" :aria-pressed="Boolean(screenCleared)" :title="screenCleared ? '恢复地图面板' : '地图窗口清屏'" @click="emit('toggle-clear-screen')"><i class="map-tool-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5H5v4m10-4h4v4M9 19H5v-4m10 4h4v-4"/><path d="M9 12H5m0 0 2-2m-2 2 2 2m8-2h4m0 0-2-2m2 2-2 2"/></svg></i><span>{{ screenCleared ? '恢复面板' : '地图清屏' }}</span></button>
      <button type="button" aria-label="放大地图" @click="map?.zoomIn()"><i class="map-tool-icon"><ZoomIn /></i><span>放大地图</span></button>
      <button type="button" aria-label="缩小地图" @click="map?.zoomOut()"><i class="map-tool-icon"><ZoomOut /></i><span>缩小地图</span></button>
      <div v-if="measureResult" class="measure-result" role="status">
        <span class="measure-result__icon" aria-hidden="true"><EditPen /></span>
        <span>{{ measureResult }}</span>
      </div>
    </aside>
    </div>

    <Teleport :to="`#${layerPanelId}-search`" :disabled="!floatingControls" defer>
    <div class="map-search" :class="{ expanded: searchExpanded || floatingControls }">
      <input v-if="searchExpanded || floatingControls" ref="searchInput" aria-label="搜索图层属性" v-model="searchKeyword" placeholder="搜索地块类型、人名或图层属性" @keydown.enter.prevent="focusFirstSearchResult" @keydown.esc="floatingControls ? searchKeyword = '' : toggleSearch()" />
      <button class="map-search-toggle" type="button" :aria-label="floatingControls ? '定位搜索结果' : (searchExpanded ? '收起地图搜索' : '展开地图搜索')" :title="floatingControls ? '定位搜索结果' : (searchExpanded ? '收起搜索' : '搜索地块或地点')" @click="floatingControls ? focusFirstSearchResult() : toggleSearch()">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="5.5"/><path d="m15 15 4.5 4.5"/></svg>
      </button>
      <div v-if="showSearchSuggestions" class="search-results" aria-live="polite">
        <template v-if="attributeSearchGroups.length">
          <div class="search-result-title">图层属性 · 点击显示整类数据</div>
          <button v-for="group in attributeSearchGroups" :key="group.key" @click="focusAttributeGroups([group])"><b>{{ group.value }}</b><small>{{ group.serviceName }} · {{ group.label }} · {{ group.features.length }} 个要素</small></button>
        </template>
        <template v-if="parcelSearchResults.length">
          <div class="search-result-title" :class="{ separated: attributeSearchResults.length }">已打开图层的分类</div>
          <button v-for="item in parcelSearchResults" :key="item.id" @click="focusParcelSearchResult(item)"><b>{{ item.label }}</b><small>{{ item.serviceName }} · {{ item.fieldLabel }}</small></button>
        </template>
        <p v-if="attributeSearchLoading">正在搜索图层属性…</p>
        <p v-if="attributeSearchError" role="status">{{ attributeSearchError }}</p>
        <p v-else-if="!attributeSearchLoading && !parcelSearchResults.length && !attributeSearchResults.length">未找到相关图层属性</p>
      </div>
    </div>

    </Teleport>

    <Teleport to="body">
      <div v-if="layerContextMenu" class="layer-context-menu" :style="{ left: `${layerContextMenu.x}px`, top: `${layerContextMenu.y}px` }">
        <button type="button" @click="openLayerColorPicker">选择颜色</button>
      </div>
      <div v-if="layerColorPicker" class="layer-color-picker" :style="{ left: `${layerColorPicker.x}px`, top: `${layerColorPicker.y}px` }">
        <div class="color-wheel">
          <canvas ref="colorWheelCanvas" :width="COLOR_WHEEL_SIZE" :height="COLOR_WHEEL_SIZE" @pointerdown="onColorWheelPointer"></canvas>
          <i class="color-wheel-cursor" :style="colorWheelCursorStyle"></i>
        </div>
        <label v-if="pickerAllowsFill" class="color-value-slider">填充透明度 {{ 100 - Math.round((vectorFillOpacity[layerColorPicker.serviceId] ?? .25) * 100) }}%<input type="range" aria-label="填充不透明度" min="5" max="60" :value="Math.round((vectorFillOpacity[layerColorPicker.serviceId] ?? .25) * 100)" @input="onFillOpacityInput" /></label>
        <label class="color-value-slider">明度<input type="range" min="0" max="100" :value="Math.round(layerColorPicker.value * 100)" :style="{ background: colorValueTrack }" @input="onColorValueInput" /></label>
      </div>
      <Transition name="tool-message">
        <div v-if="toolMessage" class="tool-message" role="status" aria-live="polite">
          <span class="tool-message__icon" aria-hidden="true"><InfoFilled /></span>
          <span class="tool-message__text">{{ toolMessage }}</span>
          <button type="button" class="tool-message__close" aria-label="关闭提示" @click="dismissToolMessage">×</button>
        </div>
      </Transition>
    </Teleport>
    <div class="map-scale" :style="{ width: `${scaleWidth}px` }" :aria-label="`比例尺 ${scaleLabel}`"><b>{{ scaleLabel }}</b><i></i></div>
  </div>
</template>

<style scoped lang="scss">
.region-filter { display: grid; gap: 6px; padding: 10px 12px; color: #8fc4d5; font-size: 12px; border-bottom: 1px solid #164b62; }
.region-picker-trigger { display:flex; justify-content:space-between; align-items:center; width:100%; min-height:34px; padding:0 9px; border:1px solid #27647d; border-radius:4px; color:#d5f2fa; background:#092738; text-align:left; cursor:pointer; }
.region-picker { padding:0; background:transparent; }
.region-picker section strong { display:block; padding:7px 8px 3px; color:#8fc4d5; font-size:12px; }
.region-option { display:flex; justify-content:space-between; width:100%; padding:6px 8px; border:0; border-radius:3px; color:#d5f2fa; background:transparent; text-align:left; cursor:pointer; }
.region-option:hover,.region-option.active,.region-node:hover,.region-node.active { background:#18516a; color:#fff; }
.region-node { display:flex; align-items:center; justify-content:space-between; width:100%; border-radius:3px; }
.region-node-select,.region-node-toggle { border:0; color:inherit; background:transparent; cursor:pointer; }
.region-node-select { flex:1; min-width:0; padding:6px 8px; text-align:left; font-size:14px; }
.layer-manager .region-service-list .map-service-group > .map-service-row { grid-template-columns: 16px minmax(0,1fr) auto; gap: 10px; }
.region-node-toggle { width:30px; font-size:15px; }

.region-filter small { color: #efb5a6; line-height: 1.4; }
.dashboard-map { position: relative; width: 100%; height: 100%; overflow: hidden; background: #031a31; }.dashboard-map__canvas { position: absolute; inset: 0; }
.dashboard-map:not(.dashboard-map--measuring) :deep(.leaflet-grab),
.dashboard-map:not(.dashboard-map--measuring) :deep(.leaflet-interactive) { cursor: default; }
.dashboard-map--measuring :deep(.leaflet-container) { cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='30' height='30' viewBox='0 0 30 30'%3E%3Cpath fill='%2337dff3' stroke='%23042b44' stroke-width='2' d='m5 22 3-7L20 3l7 7L15 22l-7 3z'/%3E%3Cpath fill='%23fff' d='m18 5 7 7-2 2-7-7z'/%3E%3C/svg%3E") 4 26, crosshair!important; }
.dashboard-map__empty,.dashboard-map__loading { position: absolute; z-index: 700; inset: 0; display: grid; place-content: center; gap: 12px; justify-items: center; color: #56ddef; background: #031a31e8; font-size: 15px; }.dashboard-map__empty button { padding: 6px 14px; color: #d8faff; background: #075477; border: 1px solid #24cbe3; cursor: pointer; }
.layer-panel-stack { position: absolute; z-index: 500; top: 80px; left: 10px; width: 255px; max-height: min(420px, 58%); display: flex; flex-direction: column; gap: 8px; }
.layer-manager { position: relative; width: 100%; max-height: calc(100% - 20px); overflow-y: auto; color: #bde6ef; background: #03182eed; border: 1px solid #0b6189; box-shadow: 0 0 14px #00a7d52b; }.tool-title { min-height: 34px; display: flex; align-items: center; justify-content: space-between; padding: 6px 8px; background: #06476b; border-bottom: 1px solid #0d6388; font-size: 15px; }.tool-title button { padding: 2px 4px; color: #7bdcea; background: transparent; border: 0; font-size: 12px; cursor: pointer; }
.layer-row { width: 100%; display: grid; grid-template-columns: 8px 1fr auto; align-items: center; gap: 7px; padding: 7px 8px; color: #6f99aa; background: transparent; border: 0; border-bottom: 1px solid #0a3e59; text-align: left; cursor: pointer; }.layer-row:hover,.layer-row.active { color: #d6f8ff; background: #07567866; }.layer-row>i { width: 7px; height: 7px; border-radius: 50%; box-shadow: 0 0 6px currentColor; }.layer-row span,.layer-row b,.layer-row small { min-width: 0; display: block; }.layer-row b { overflow: hidden; font-size: 14px; text-overflow: ellipsis; white-space: nowrap; }.layer-row small { margin-top: 3px; color: #52798a; font-size: 11px; }.layer-row em { color: #39ddef; font-size: 14px; font-style: normal; }.layer-section-title { padding: 5px 8px; color: #6591a3; background: #04243d; font-size: 12px; }.route-symbol { width: 12px!important; height: 2px!important; border-radius: 0!important; background: repeating-linear-gradient(90deg,#ff4d5b 0 3px,transparent 3px 5px)!important; }
.map-search { position: absolute; z-index: 550; top: 10px; right: 70px; width: 42px; min-height: 31px; display: flex; align-items: center; padding: 0; color: #55dff3; background: #031a31ef; border: 1px solid #11618a; box-shadow: 0 0 10px #00a9de1f; transition: width .18s ease, padding .18s ease; }.map-search.expanded { width: 270px; padding: 0 9px; }.map-search input { min-width: 0; height: 29px; flex: 1; border: 0; outline: 0; color: #c6edf7; background: transparent; font-size: 14px; }.map-search-toggle { width: 40px; height: 100%; flex: 0 0 40px; padding: 0; color: currentColor; background: transparent; border: 0; cursor: pointer; font-size: 23px; line-height: 1; transform: scaleX(-1); }.search-results { position: absolute; left: -1px; right: -1px; top: 31px; background: #031a31f5; border: 1px solid #11618a; }.search-results button { width: 100%; padding: 7px 9px; color: #bfe8f1; background: transparent; border: 0; border-bottom: 1px solid #0b405c; text-align: left; cursor: pointer; }.search-results button:hover { background: #075479; }.search-results b,.search-results small { display: block; font-size: 14px; }.search-results small { margin-top: 3px; color: #5c8293; font-size: 11px; }
.map-tools { position: absolute; z-index: 600; right: 10px; top: 10px; width: 50px; display: grid; gap: 4px; }.map-tools>button { min-height: 40px; display: grid; place-items: center; gap: 2px; padding: 4px; color: #84b2c3; background: #031a30ed; border: 1px solid #155a7c; cursor: pointer; }.map-tools>button:hover,.map-tools>button.active { color: #fff; border-color: #24cbe3; background: #075477; }.map-tools i { font-size: 16px; font-style: normal; }.map-tools span { font-size: 11px; }.compass { width: 20px; height: 20px; display: grid; place-items: center; border: 1px solid #31d9e9; border-radius: 50%; color: #ff7180; font-size: 14px!important; }.tool-submenu { position: absolute; top: 88px; right: 55px; width: 82px; padding: 4px; background: #031a31f5; border: 1px solid #157298; }.tool-submenu button { width: 100%; padding: 7px; color: #88b7c7; background: transparent; border: 0; text-align: left; font-size: 12px; cursor: pointer; }.tool-submenu button:hover,.tool-submenu button.active { color: #fff; background: #08698e; }.base-submenu { top: 220px; }
.measure-result,.tool-message { position: absolute; z-index: 550; left: 50%; bottom: 12px; transform: translateX(-50%); padding: 7px 12px; color: #c8f8ff; background: #03223aef; border: 1px solid #18a2c1; font-size: 14px; box-shadow: 0 0 10px #12bbd544; }.tool-message { bottom: 46px; cursor: pointer; }.tool-message-enter-active,.tool-message-leave-active { transition: opacity .2s ease, transform .2s ease; }.tool-message-enter-from,.tool-message-leave-to { opacity: 0; transform: translate(-50%, 6px); }.map-scale { position: absolute; z-index: 500; right: 68px; bottom: 7px; padding: 4px 8px; color: #77a9b9; background: #021728cc; font-size: 12px; }
:deep(.business-task-marker),:deep(.business-drone-marker),:deep(.custom-annotation) { background: transparent; border: 0; }:deep(.business-task-marker span) { width: 23px; height: 23px; display: grid; place-items: center; color: white; background: color-mix(in srgb, var(--marker-color), #062239 35%); border: 2px solid var(--marker-color); border-radius: 50% 50% 50% 5px; transform: rotate(-45deg); box-shadow: 0 0 10px var(--marker-color); font-size: 14px; }:deep(.business-drone-marker) { display: flex; align-items: center; gap: 4px; color: #79eff9; }:deep(.business-drone-marker span) { width: 24px; height: 24px; display: grid; place-items: center; background: #087b9e; border: 1px solid #4defff; border-radius: 50%; box-shadow: 0 0 10px #22e5f4; }:deep(.business-drone-marker b) { padding: 2px 4px; background: #03233ddd; font-size: 12px; white-space: nowrap; }:deep(.business-task-label),:deep(.measure-index) { color: #c9f7ff; background: #03223ddd; border: 1px solid #17698e; box-shadow: none; border-radius: 2px; font: 11px "Microsoft YaHei"; }:deep(.leaflet-popup-content-wrapper),:deep(.leaflet-popup-tip) { color: #d9f8ff; background: #061d34; border: 1px solid #1685ad; border-radius: 2px; }:deep(.business-popup strong),:deep(.business-popup span),:deep(.business-popup small) { display: block; }:deep(.business-popup span) { margin-top: 5px; color: #8db5c3; font-size: 14px; }:deep(.business-popup small) { margin-top: 6px; color: #5d899b; }:deep(.custom-annotation span) { width: 25px; height: 25px; display: grid; place-items: center; color: #fff; background: #e86835; border: 2px solid #ffd7a8; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); box-shadow: 0 0 8px #ff8a45; }

/* Map layer controls and tools share the left rail; category filters sit beneath search. */
.layer-manager { width: 100%; height: auto; max-height: none; min-height: 0; display: flex; flex: 1 1 auto; flex-direction: column; transform: none; overflow: hidden; border: 1px solid #1688bf; border-radius: 14px; background: #031c37b8; box-shadow: 0 0 18px #00a7d534; }.layer-manager-list{min-height:0;overflow-x:hidden;overflow-y:auto;scrollbar-width:none}.layer-manager-list::-webkit-scrollbar{display:none}.tool-title { min-height: 46px; flex:0 0 46px; padding: 0 15px; border: 0; border-bottom: 1px solid #1688bf; background: linear-gradient(90deg, #056ea7c9, #073f6dc9); font-size: 18px; }.tool-title button { font-size: 14px; }.layer-row { box-sizing: border-box; min-height: 43px; flex: 0 0 43px; grid-template-columns: 18px 1fr auto; gap: 10px; padding: 9px 16px; border: 0; border-bottom: 1px solid #0d5278; background: #031c37b8; }.layer-row:last-child { border-bottom: 0; }.layer-row b { font-size: 17px; }.layer-row em { width: 13px; height: 13px; display: block; border: 1.5px solid #75cbe9; border-radius: 50%; font-size: 0; transform: translateX(-8px); }.layer-row.active em { border-color: #c3f8ff; background: #49d9f4; box-shadow: 0 0 7px #27dfff; }.layer-row>i { width: 16px; height: 16px; border-radius: 1px; box-shadow: none; }.layer-row.disabled { cursor: not-allowed; opacity: .55; }.dom-imagery-symbol { width: 16px!important; height: 2px!important; border: 0!important; border-radius: 0!important; background: repeating-linear-gradient(90deg,#20b9ff 0 4px,transparent 4px 7px)!important; }
.layer-section-title { min-height: 36px; flex: 0 0 36px; display: flex; align-items: center; margin: 0; padding: 0 15px; color: #a9dce9; border: 0; border-bottom: 1px solid #1688bf; background: linear-gradient(90deg,#064367d9,#032a49d9); font-size: 14px; font-weight: 700; letter-spacing: .5px; }.layer-row.jiulong-imagery-row { min-height: 43px; height: auto; flex: 0 0 auto; grid-template-columns: minmax(0,1fr) auto; }.layer-row.jiulong-imagery-row b { overflow: visible; white-space: normal; line-height: 1.35; text-overflow: clip; }.jiulong-vector-symbol { width: 16px!important; height: 2px!important; border: 0!important; border-radius: 0!important; background: #ff3f4d!important; box-shadow: 0 0 5px #ff3f4d!important; }
.layer-manager .layer-row { min-height: 43px; height: auto; flex: 0 0 auto; }
.layer-manager .layer-row b { overflow: visible; white-space: normal; line-height: 1.35; text-overflow: clip; overflow-wrap: anywhere; }
.layer-manager .map-service-row { grid-template-columns: minmax(0,1fr) auto; }
.layer-manager .map-service-group { border-bottom: 1px solid #0d5278; }
.layer-manager .map-service-group:last-child { border-bottom: 0; }
.layer-manager .map-service-group>.map-service-row { border-bottom: 0; }
.layer-manager .map-service-row { touch-action: pan-y; }
.layer-manager .map-service-sublayers { position: relative; padding-left: 16px; border-top: 1px solid #0b4668; background: #02172dcc; }
.layer-manager .map-service-sublayers::before { position: absolute; top: 0; bottom: 0; left: 17px; width: 1px; background: #1785aa80; content: ''; }
.layer-manager .map-service-sublayer { position: relative; min-height: 38px; padding: 7px 16px 7px 24px; border-bottom: 1px dashed #0b4668; background: #04253ebf; }
.layer-manager .map-service-sublayer:last-child { border-bottom: 0; }
.layer-manager .map-service-sublayer::before { position: absolute; top: 50%; left: 0; width: 9px; height: 1px; background: #1785aa; content: ''; }
.layer-manager .map-service-sublayer b { font-size: 14px; font-weight: 500; }
.layer-manager .map-service-sublayer em { width: 11px; height: 11px; }
.layer-manager .map-service-row.has-categories { grid-template-columns: 18px minmax(0,1fr) 16px 16px; }
.category-folder { margin: 0 8px 6px 16px; }
.category-field-label { padding: 6px 12px 2px; color: #70adbe; font-size: 11px; }
.layer-manager .category-row { grid-template-columns: 14px minmax(0,1fr) 16px; min-height: 34px; }
.category-swatch { width: 12px; height: 12px; border-radius: 3px; box-shadow: inset 0 0 0 1px #ffffff55; }
.category-swatch--all { background: repeating-linear-gradient(135deg,#9ad7ea 0 3px,transparent 3px 6px); }
.category-row input { width: 14px; height: 14px; margin: 0; accent-color: #28cce8; cursor: pointer; }
.layer-panel-message { padding: 16px 14px; color: #83b5c6; font-size: 13px; line-height: 1.5; text-align: center; }
.layer-panel-message.error { color: #ff8e98; }
.parcel-type-panel { position: relative; width: 100%; max-height: min(220px, 32%); min-height: 0; flex: 0 1 auto; display: flex; flex-direction: column; overflow: hidden; color: #bde6ef; border: 1px solid #1688bf; border-radius: 14px; background: #031c37e8; box-shadow: 0 0 18px #00a7d534; pointer-events: auto; }
.parcel-type-list { min-height: 0; overflow: auto; }
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
.search-result-title.separated { margin-top: 4px; border-top: 2px solid #1688bf; }
.map-tools { top: 56px; right: 12px; bottom: 34px; width: 138px; display: flex; flex-direction: column; justify-content: center; gap: 5px; overflow: visible; border: 0; border-radius: 0; background: transparent; }.map-tools>button { min-height: 40px; flex: 0 0 40px; grid-template-columns: 26px 1fr; gap: 8px; padding: 5px 12px; border: 1px solid #155a7c; border-radius: 9px; background: #031a30b8; box-shadow: 0 0 8px #00a9de18; }.map-tools>button:last-of-type { border-bottom: 1px solid #155a7c; }.map-tools>button:hover,.map-tools>button.active { border-color: #24cbe3; background: #075477d0; }.map-tools i { font-size: 19px; }.map-tools span { font-size: 14px; white-space: nowrap; }.compass { width: 23px; height: 23px; font-size: 14px!important; }.right-submenu { top: 50%; right: 146px; width: 118px; transform: translateY(-50%); }.right-submenu button { font-size: 13px; }
.map-mode-switch { flex: 0 0 82px; display: grid; grid-template-rows: 1fr 1fr; overflow: hidden; border: 1px solid #155a7c; border-radius: 9px; background: #031a30b8; box-shadow: 0 0 8px #00a9de18; }.map-mode-switch button { display: grid; grid-template-columns: 26px 1fr; align-items: center; gap: 8px; padding: 4px 12px; color: #84b2c3; background: transparent; border: 0; cursor: pointer; }.map-mode-switch button+button { border-top: 1px solid #155a7c; }.map-mode-switch button:hover,.map-mode-switch button.active { color: #fff; background: #075477d0; }.map-mode-switch span { font-size: 14px; white-space: nowrap; }.mode-indicator { width: 15px; height: 15px; display: block; border: 1.5px solid #75cbe9; border-radius: 50%; }.map-mode-switch button.active .mode-indicator { border-color: #c3f8ff; background: #49d9f4; box-shadow: 0 0 7px #27dfff; }
.map-scale { right: 14px; bottom: 10px; width: 96px; height: 18px; padding: 0; color: #b9e7f4; background: transparent; font-size: 11px; text-align: center; }.map-scale b { position: relative; z-index: 1; display: block; font-size: 11px; font-weight: 600; line-height: 12px; }.map-scale i { position: absolute; right: 0; bottom: 0; left: 0; height: 7px; border-right: 2px solid #b9e7f4; border-bottom: 2px solid #b9e7f4; border-left: 2px solid #b9e7f4; }
.layer-context-menu,.layer-color-picker { position: fixed; z-index: 30000; min-width: 148px; padding: 6px; color: #e7f7ff; background: #082033f5; border: 1px solid #4a90b5; border-radius: 8px; box-shadow: 0 12px 28px #00111e88; }
.layer-context-menu button { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 8px 10px; color: inherit; background: transparent; border: 0; border-radius: 6px; font-size: 13px; text-align: left; cursor: pointer; }
.layer-context-menu button:hover { background: #0d4d6e; }
.layer-color-picker { width: 196px; padding: 12px; }
.color-wheel { position: relative; width: 168px; height: 168px; margin: 0 auto; touch-action: none; cursor: crosshair; }
.color-wheel canvas { display: block; width: 168px; height: 168px; border-radius: 50%; }
.color-wheel-cursor { position: absolute; width: 14px; height: 14px; margin: -7px 0 0 -7px; border: 2px solid #fff; border-radius: 50%; box-shadow: 0 0 0 1px #001018aa; pointer-events: none; }
.color-value-slider { display: grid; gap: 6px; margin: 12px 2px 2px; color: #b7d7e6; font-size: 12px; }
.color-value-slider input { width: 100%; height: 12px; margin: 0; padding: 0; appearance: none; border: 0; border-radius: 999px; background: #000; cursor: pointer; }
.color-value-slider input::-webkit-slider-thumb { appearance: none; width: 14px; height: 14px; border: 2px solid #fff; border-radius: 50%; background: #082033; box-shadow: 0 0 0 1px #001018aa; }
.attribute-filter-chip { display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 12px;color:#82d8ec;background:#17688b22;font-size:11px;overflow-wrap:anywhere; }.attribute-filter-chip button { flex:0 0 22px;width:22px;height:22px;padding:0;color:#a5dce9;background:transparent;border:0;font-size:18px; }
</style>
<style scoped src="./DashboardMapTheme.scss" lang="scss"></style>

<style scoped src="./DashboardMapFloating.scss" lang="scss"></style>
