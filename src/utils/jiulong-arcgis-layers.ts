import L from 'leaflet'

type ArcGisLayerKind = 'cached' | 'export'

interface ArcGisLayerDefinition {
  id: string
  name: string
  kind: ArcGisLayerKind
  servicePath: string
  opacity: number
  pane: 'jiulong-imagery' | 'jiulong-features'
  focusBounds: L.LatLngBounds
  hoverField?: string
  hoverLabel?: string
}

export interface JiulongLayerControlOptions {
  /** 小型缩略图不适合显示图层控件，可由调用方关闭。 */
  collapsed?: boolean
  position?: L.ControlPosition
  /** 指定首次进入地图时自动显示的专题层；默认全部关闭，避免同时请求多期大影像。 */
  visibleLayerIds?: string[]
}

export interface JiulongLayerControlHandle {
  control: L.Control.Layers
  layers: Map<string, L.Layer>
  destroy: () => void
}

const configuredBaseUrl = import.meta.env.VITE_JIULONG_ARCGIS_BASE_URL?.trim()
const ARCGIS_BASE_URL = (configuredBaseUrl || 'http://58.213.29.198:9624/arcgis198/arcgis/rest/services/taizhou_temp').replace(/\/$/, '')

const CACHED_SERVICE_BOUNDS = L.latLngBounds(
  L.CRS.EPSG3857.unproject(L.point(13336534.537771638, 3823800.363812975)),
  L.CRS.EPSG3857.unproject(L.point(13344755.198273238, 3833062.663139018)),
)
const CHANGE_AREA_FOCUS_BOUNDS = L.latLngBounds(
  [32.48788419329846, 119.84145094324899],
  [32.49647556923956, 119.85678119750757],
)

export const JIULONG_ARCGIS_LAYERS: ArcGisLayerDefinition[] = [
  {
    id: 'jiulong-202604-high-resolution',
    name: '2026年4月局部0.02米影像',
    kind: 'cached',
    servicePath: 'Jiulong_04_gaofen/MapServer',
    opacity: 1,
    pane: 'jiulong-imagery',
    focusBounds: CHANGE_AREA_FOCUS_BOUNDS,
  },
  {
    id: 'jiulong-202604',
    name: '2026年4月九龙镇0.2米影像',
    kind: 'cached',
    servicePath: 'Jiulong_04/MapServer',
    opacity: 1,
    pane: 'jiulong-imagery',
    focusBounds: CACHED_SERVICE_BOUNDS,
  },
  {
    id: 'jiulong-202606',
    name: '2026年6月九龙镇0.2米影像',
    kind: 'cached',
    servicePath: 'Jiulong_06/MapServer',
    opacity: 1,
    pane: 'jiulong-imagery',
    focusBounds: CACHED_SERVICE_BOUNDS,
  },
  {
    id: 'jiulong-2025-land-change',
    name: '2025年国土变更数据',
    kind: 'export',
    servicePath: 'Jiulong_2025DLTB/MapServer',
    opacity: 1,
    pane: 'jiulong-features',
    focusBounds: L.latLngBounds([32.46282302121367, 119.81003169277348], [32.52543136100007, 119.87382738200003]),
    hoverField: 'DLMC',
    hoverLabel: '地类名称',
  },
  {
    id: 'jiulong-202604-09-change-area',
    name: '2026年4—9月变化区域图斑',
    kind: 'export',
    servicePath: 'Bianhuaquyu/MapServer',
    opacity: 1,
    pane: 'jiulong-features',
    focusBounds: CHANGE_AREA_FOCUS_BOUNDS,
    hoverField: '变化类',
    hoverLabel: '变化类型',
  },
]

const RED_BOUNDARY_RENDERER = JSON.stringify([{
  id: 0,
  source: { type: 'mapLayer', mapLayerId: 0 },
  drawingInfo: {
    showLabels: false,
    renderer: {
      type: 'simple',
      symbol: {
        type: 'esriSFS',
        style: 'esriSFSSolid',
        color: [255, 0, 0, 0],
        outline: {
          type: 'esriSLS',
          style: 'esriSLSSolid',
          color: [255, 0, 0, 255],
          width: 2,
        },
      },
    },
  },
}])

/**
 * ArcGIS 动态 MapServer 并非 XYZ 服务，但可以按固定地理瓦片调用 export。
 * 每张图片与其瓦片经纬度范围永久绑定，地图平移时由 Leaflet 移动瓦片，避免把
 * 上一个视口的整张 PNG 拉伸到新视口而造成矢量边界“漂移”。服务端负责把
 * 4528/4549 等源坐标系实时投影到 EPSG:3857，并只绘制透明填充的红色边界。
 */
class ArcGisVectorTileLayer extends L.GridLayer {
  private readonly serviceUrl: string

  constructor(serviceUrl: string, opacity: number, pane: string) {
    super({
      opacity,
      pane,
      tileSize: 256,
      noWrap: true,
      keepBuffer: 3,
      updateWhenIdle: false,
      updateWhenZooming: false,
    })
    this.serviceUrl = serviceUrl
  }

  override createTile(coords: L.Coords, done: L.DoneCallback) {
    const tile = document.createElement('img')
    const tileSize = this.getTileSize()
    const northWestPoint = L.point(coords.x * tileSize.x, coords.y * tileSize.y)
    const southEastPoint = northWestPoint.add(tileSize)
    const northWest = this._map.unproject(northWestPoint, coords.z)
    const southEast = this._map.unproject(southEastPoint, coords.z)
    const southWestMeters = L.CRS.EPSG3857.project(L.latLng(southEast.lat, northWest.lng))
    const northEastMeters = L.CRS.EPSG3857.project(L.latLng(northWest.lat, southEast.lng))
    const parameters = new URLSearchParams({
      bbox: [southWestMeters.x, southWestMeters.y, northEastMeters.x, northEastMeters.y].join(','),
      bboxSR: '3857',
      imageSR: '3857',
      size: `${tileSize.x},${tileSize.y}`,
      dpi: '96',
      format: 'png32',
      transparent: 'true',
      layers: 'show:0',
      dynamicLayers: RED_BOUNDARY_RENDERER,
      f: 'image',
    })
    tile.alt = ''
    tile.setAttribute('role', 'presentation')
    tile.onload = () => done(undefined, tile)
    tile.onerror = () => done(new Error('ArcGIS vector tile failed to load'), tile)
    tile.src = `${this.serviceUrl}/export?${parameters.toString()}`
    return tile
  }
}

function ensurePanes(map: L.Map) {
  const imageryPane = map.getPane('jiulong-imagery') || map.createPane('jiulong-imagery')
  imageryPane.style.zIndex = '225'
  imageryPane.style.pointerEvents = 'none'
  const featurePane = map.getPane('jiulong-features') || map.createPane('jiulong-features')
  featurePane.style.zIndex = '335'
  featurePane.style.pointerEvents = 'none'
}

function createLayer(definition: ArcGisLayerDefinition) {
  const serviceUrl = `${ARCGIS_BASE_URL}/${definition.servicePath}`
  if (definition.kind === 'cached') {
    return L.tileLayer(`${serviceUrl}/tile/{z}/{y}/{x}`, {
      bounds: CACHED_SERVICE_BOUNDS,
      minNativeZoom: 0,
      maxNativeZoom: 23,
      minZoom: 0,
      maxZoom: 23,
      opacity: definition.opacity,
      pane: definition.pane,
      noWrap: true,
      keepBuffer: 3,
    })
  }
  return new ArcGisVectorTileLayer(serviceUrl, definition.opacity, definition.pane)
}

interface ArcGisQueryResponse {
  features?: Array<{ attributes?: Record<string, unknown> }>
}

let hoverJsonpSequence = 0

/**
 * 服务未返回 Access-Control-Allow-Origin，使用 ArcGIS 原生 JSONP 点查询读取属性。
 * 查询坐标使用 WGS84，MapServer 会转换到图层自身的 4528/4549 坐标系。
 */
function queryHoverField(definition: ArcGisLayerDefinition, latlng: L.LatLng) {
  if (!definition.hoverField) return Promise.resolve<string | null>(null)

  const callbackName = `__jiulongHover_${Date.now()}_${++hoverJsonpSequence}`
  const parameters = new URLSearchParams({
    where: '1=1',
    geometry: JSON.stringify({
      x: latlng.lng,
      y: latlng.lat,
      spatialReference: { wkid: 4326 },
    }),
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: definition.hoverField,
    returnGeometry: 'false',
    f: 'json',
    callback: callbackName,
  })

  return new Promise<string | null>((resolve) => {
    const script = document.createElement('script')
    let timeoutId = 0
    let completed = false
    const callbacks = window as unknown as Record<string, (response: ArcGisQueryResponse) => void>
    const finish = (value: string | null) => {
      if (completed) return
      completed = true
      window.clearTimeout(timeoutId)
      script.remove()
      delete callbacks[callbackName]
      resolve(value)
    }

    callbacks[callbackName] = (response) => {
      const rawValue = response.features?.[0]?.attributes?.[definition.hoverField!]
      const value = rawValue == null ? '' : String(rawValue).trim()
      finish(value || null)
    }
    script.onerror = () => finish(null)
    timeoutId = window.setTimeout(() => finish(null), 6000)
    script.src = `${ARCGIS_BASE_URL}/${definition.servicePath}/0/query?${parameters.toString()}`
    document.head.appendChild(script)
  })
}

/** 在业务地图中安装统一的九龙镇专题图层选择器。 */
export function installJiulongArcGisLayers(
  map: L.Map,
  options: JiulongLayerControlOptions = {},
): JiulongLayerControlHandle {
  ensurePanes(map)
  const visibleIds = new Set(options.visibleLayerIds || [])
  const layers = new Map<string, L.Layer>()
  const focusBoundsByLayer = new Map<L.Layer, L.LatLngBounds>()
  const definitionByLayer = new Map<L.Layer, ArcGisLayerDefinition>()
  const overlays: Record<string, L.Layer> = {}

  JIULONG_ARCGIS_LAYERS.forEach((definition) => {
    const layer = createLayer(definition)
    layers.set(definition.id, layer)
    focusBoundsByLayer.set(layer, definition.focusBounds)
    definitionByLayer.set(layer, definition)
    // 全部作为独立叠加层注册：可任意多选，也允许全部取消显示。
    overlays[definition.name] = layer
    if (visibleIds.has(definition.id)) layer.addTo(map)
  })

  const control = L.control.layers(undefined, overlays, {
    collapsed: options.collapsed ?? false,
    position: options.position || 'bottomleft',
    sortLayers: false,
  }).addTo(map)
  const controlElement = control.getContainer()
  controlElement?.classList.add('jiulong-arcgis-control')
  controlElement?.setAttribute('aria-label', '九龙镇专题图层')
  controlElement?.setAttribute('title', '九龙镇专题图层')

  const focusSelectedLayer = (event: L.LayersControlEvent) => {
    const bounds = focusBoundsByLayer.get(event.layer)
    if (!bounds?.isValid()) return
    map.fitBounds(bounds, { padding: [48, 48], maxZoom: 18, animate: true })
  }
  // 只在用户勾选显示时定位；取消图层不会改变用户当前视野。
  map.on('overlayadd', focusSelectedLayer)

  const hoverTooltip = L.tooltip({
    direction: 'top',
    offset: [0, -12],
    opacity: 1,
    className: 'jiulong-feature-tooltip',
  })
  let hoverTimer: number | undefined
  let hoverRequestSequence = 0

  const closeHoverTooltip = () => {
    hoverRequestSequence += 1
    if (hoverTimer !== undefined) window.clearTimeout(hoverTimer)
    hoverTimer = undefined
    map.closeTooltip(hoverTooltip)
  }

  const queryHoveredFeatures = (event: L.LeafletMouseEvent) => {
    if (hoverTimer !== undefined) window.clearTimeout(hoverTimer)
    const activeDefinitions = [...definitionByLayer.entries()]
      .filter(([layer, definition]) => map.hasLayer(layer) && definition.hoverField)
      .map(([, definition]) => definition)

    if (!activeDefinitions.length) {
      closeHoverTooltip()
      return
    }

    const requestSequence = ++hoverRequestSequence
    hoverTimer = window.setTimeout(async () => {
      hoverTimer = undefined
      const values = await Promise.all(activeDefinitions.map(async (definition) => ({
        definition,
        value: await queryHoverField(definition, event.latlng),
      })))
      if (requestSequence !== hoverRequestSequence) return

      const matchedValues = values.filter((item) => Boolean(item.value))
      if (!matchedValues.length) {
        map.closeTooltip(hoverTooltip)
        return
      }

      const content = document.createElement('div')
      matchedValues.forEach(({ definition, value }) => {
        const row = document.createElement('div')
        const label = document.createElement('span')
        label.textContent = `${definition.hoverLabel}：`
        const fieldValue = document.createElement('strong')
        fieldValue.textContent = value
        row.append(label, fieldValue)
        content.appendChild(row)
      })
      hoverTooltip.setLatLng(event.latlng).setContent(content).openOn(map)
    }, 140)
  }

  map.on('mousemove', queryHoveredFeatures)
  map.on('mouseout overlayremove', closeHoverTooltip)

  return {
    control,
    layers,
    destroy: () => {
      map.off('overlayadd', focusSelectedLayer)
      map.off('mousemove', queryHoveredFeatures)
      map.off('mouseout overlayremove', closeHoverTooltip)
      closeHoverTooltip()
      control.remove()
      layers.forEach((layer) => layer.remove())
      layers.clear()
      focusBoundsByLayer.clear()
      definitionByLayer.clear()
    },
  }
}
