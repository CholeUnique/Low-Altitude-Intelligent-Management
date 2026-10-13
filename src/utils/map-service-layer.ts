import L from 'leaflet'
import proj4 from 'proj4'
import type { MapServiceItem } from '@/api/map-service'

export const MAP_SERVICE_IMAGERY_PANE = 'map-service-imagery'
export const MAP_SERVICE_VECTOR_PANE = 'map-service-vector'

// CGCS2000 / 3-degree Gauss-Kruger zone 40（带带号）
proj4.defs('EPSG:4528', '+proj=tmerc +lat_0=0 +lon_0=120 +k=1 +x_0=40500000 +y_0=0 +ellps=GRS80 +units=m +no_defs +type=crs')
// CGCS2000 / 3-degree Gauss-Kruger CM 120E（不带带号）
proj4.defs('EPSG:4549', '+proj=tmerc +lat_0=0 +lon_0=120 +k=1 +x_0=500000 +y_0=0 +ellps=GRS80 +units=m +no_defs +type=crs')

interface ArcGisSpatialReference {
  wkid?: number
  latestWkid?: number
}

interface ArcGisExtent {
  xmin?: number
  ymin?: number
  xmax?: number
  ymax?: number
  spatialReference?: ArcGisSpatialReference
}

interface ArcGisMapServiceMetadata {
  fullExtent?: ArcGisExtent
  initialExtent?: ArcGisExtent
  singleFusedMapCache?: boolean
  tileInfo?: {
    lods?: Array<{ level?: number }>
  }
  layers?: Array<{ id?: number; name?: string }>
}

interface ArcGisLayerMetadata {
  name?: string
  geometryType?: string
  displayField?: string
  fields?: Array<{ name?: string; alias?: string; type?: string }>
}

interface ArcGisQueryResponse {
  features?: Array<{ attributes?: Record<string, unknown>; geometry?: MapServiceSearchGeometry }>
  fieldAliases?: Record<string, string>
  exceededTransferLimit?: boolean
  objectIds?: Array<number | string>
  extent?: ArcGisExtent
}

export interface MapServiceSearchGeometry {
  x?: number
  y?: number
  points?: number[][]
  paths?: number[][][]
  rings?: number[][][]
}

export interface MapServiceCategoryLocation {
  bounds?: L.LatLngBounds
  geometryType?: string
  geometries: MapServiceSearchGeometry[]
}

export interface MapServiceCategoryValue {
  value: string
  label: string
  /** 与所属图层同色相、按分类数量拉开的深浅色。 */
  color: string
}

export interface MapServiceCategoryFilter {
  fieldName: string
  fieldLabel: string
  values: MapServiceCategoryValue[]
  setVisibleValues: (values: string[]) => void
  locateValue: (value: string) => Promise<MapServiceCategoryLocation>
}

export interface MapServiceLayerHandle {
  layer: L.Layer
  bounds?: L.LatLngBounds
  categoryFilter?: MapServiceCategoryFilter
  /** 矢量图层当前描边色；影像图层没有这项。 */
  color?: string
  /** 改基准色后返回与分类顺序一致的深浅色；没有分类时返回空数组。 */
  setColor?: (color: string) => string[]
  setFillOpacity?: (opacity: number) => void
  setAttributeFilter?: (field?: string, value?: string) => void
  definitionExpression?: () => string
}

/** 行政边界使用真实服务几何，在地图上绘制双层描边，不依赖影像导出的样式。 */
export async function createAdministrativeBoundaryLayer(service: MapServiceItem, color = '#9AEEFE'): Promise<MapServiceLayerHandle> {
  const url = serviceRoot(service.serviceUrl)
  const layerId = Number(service.arcGisLayerId)
  const response = await queryAllFeatures(`${url}/${layerId}/query`, new URLSearchParams({
    where: '1=1', outFields: '*', returnGeometry: 'true', outSR: '4326',
  }))
  const group = L.layerGroup()
  const bounds = L.latLngBounds([])
  const outlines: L.Polygon[] = []
  const fills: L.Polygon[] = []
  for (const feature of response.features || []) {
    const rings = feature.geometry?.rings
    if (!rings?.length) continue
    const coordinates = rings.map(ring => ring.map(([lng, lat]) => L.latLng(lat!, lng!)))
    coordinates.flat().forEach(point => bounds.extend(point))
    outlines.push(L.polygon(coordinates, {
      pane: 'administrative-boundaries', interactive: false, color: '#135888',
      weight: 10, opacity: .5, fill: false, lineCap: 'round', lineJoin: 'round',
    }).addTo(group))
    fills.push(L.polygon(coordinates, {
      pane: 'administrative-boundaries', interactive: false, color,
      weight: 4, opacity: 1, fillColor: color === '#9AEEFE' ? '#66B9DA' : color, fillOpacity: .1,
      lineCap: 'round', lineJoin: 'round', className: 'hailing-boundary-glow',
    }).addTo(group))
  }
  if (!bounds.isValid()) throw new Error('行政边界图层没有有效几何数据')
  return {
    layer: group, bounds, color,
    setColor: next => { fills.forEach(path => path.setStyle({ color: next, fillColor: next })); return [] },
    setFillOpacity: opacity => { fills.forEach(path => path.setStyle({ fillOpacity: opacity })) },
  }
}

export interface MapFeatureAttributeRow {
  name?: string
  label: string
  value: string
}

export interface IdentifiedMapFeature {
  serviceId: string
  serviceName: string
  title: string
  /** 命中的字段中文名，搜索结果用来说明匹配来源。 */
  matchLabel?: string
  matchFieldName?: string
  objectIdField?: string
  objectId?: string | number
  typeLabel?: string
  typeValue?: string
  category?: { field: string; label: string; value: string }
  rows: MapFeatureAttributeRow[]
  location: MapServiceCategoryLocation
}

export const VECTOR_LAYER_PALETTE = [
  '#ff4d4f', '#1890ff', '#faad14', '#13c2c2', '#722ed1', '#eb2f96',
  '#52c41a', '#fa541c', '#2f54eb', '#f759ab', '#36cfc9', '#a0d911',
]

const assignedVectorColors = new Map<string, string>()

/** 按图层稳定分配互不重复的颜色；用尽调色板后才循环。 */
export function vectorLayerColor(key: string) {
  const existing = assignedVectorColors.get(key)
  if (existing) return existing
  const used = new Set(assignedVectorColors.values())
  let color = VECTOR_LAYER_PALETTE.find(item => !used.has(item))
  let index = assignedVectorColors.size
  while (!color || used.has(color)) {
    color = hslToHex((index++ * 137.508) % 360, 78, 56 + (index % 3) * 4)
  }
  assignedVectorColors.set(key, color)
  return color
}

export function rememberVectorLayerColor(key: string, color: string) {
  assignedVectorColors.set(key, color)
}

function hexChannels(color: string): [number, number, number] {
  const normalized = color.trim().replace('#', '')
  const hex = normalized.length === 3 ? normalized.split('').map((char) => char + char).join('') : normalized
  const value = Number.parseInt(hex, 16)
  if (!Number.isFinite(value) || hex.length !== 6) return [255, 59, 48]
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

function hexToHsl(color: string) {
  const [red, green, blue] = hexChannels(color).map((channel) => channel / 255) as [number, number, number]
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const lightness = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l: lightness * 100 }
  const delta = max - min
  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min)
  const hue = max === red
    ? ((green - blue) / delta + (green < blue ? 6 : 0)) / 6
    : max === green
      ? ((blue - red) / delta + 2) / 6
      : ((red - green) / delta + 4) / 6
  return { h: hue * 360, s: saturation * 100, l: lightness * 100 }
}

function hslToHex(hue: number, saturation: number, lightness: number) {
  const sat = saturation / 100
  const lig = lightness / 100
  const chroma = (1 - Math.abs(2 * lig - 1)) * sat
  const segment = hue / 60
  const x = chroma * (1 - Math.abs(segment % 2 - 1))
  const [red, green, blue] = segment < 1 ? [chroma, x, 0]
    : segment < 2 ? [x, chroma, 0]
      : segment < 3 ? [0, chroma, x]
        : segment < 4 ? [0, x, chroma]
          : segment < 5 ? [x, 0, chroma]
            : [chroma, 0, x]
  const match = lig - chroma / 2
  const channel = (value: number) => Math.round(Math.min(255, Math.max(0, (value + match) * 255))).toString(16).padStart(2, '0')
  return `#${channel(red)}${channel(green)}${channel(blue)}`
}

/** 同一色相下按分类数量均分明度。分类越多，相邻两档的差值越小。 */
export function categoryShadeColors(baseColor: string, count: number) {
  if (count <= 0) return []
  if (count === 1) return [baseColor]
  const { h, s } = hexToHsl(baseColor)
  const minLightness = 32
  const maxLightness = 72
  return Array.from({ length: count }, (_, index) => {
    const lightness = minLightness + (maxLightness - minLightness) * (index / (count - 1))
    return hslToHex(h, s, lightness)
  })
}

function darkerShade(color: string) {
  const { h, s, l } = hexToHsl(color)
  return hslToHex(h, s, Math.max(16, l - 16))
}

export interface MapServiceInspection {
  /** 只有能够确认是影像且可取得覆盖范围的服务才参与图斑自动匹配。 */
  isImagery: boolean
  /** WGS84：[west, south, east, north]。 */
  bounds?: [number, number, number, number]
}

interface ServiceRemarkConfig {
  bounds?: L.LatLngBounds
  minZoom?: number
  maxZoom?: number
}

let jsonpSequence = 0
const tileMapMetadataCache = new Map<string, Promise<ServiceRemarkConfig>>()

function serviceRoot(serviceUrl: string) {
  return serviceUrl.trim().replace(/\/+$/, '')
}

function normalizedType(type: string) {
  return String(type || '').trim().toUpperCase().replace(/[\s-]+/g, '_')
}

function isExplicitVectorService(service: MapServiceItem) {
  const description = `${normalizedType(service.type)} ${service.name || ''}`
  return /VECTOR|FEATURE|矢量|图斑|边界|地类|变化区/i.test(description)
}

function serializableBounds(bounds?: L.LatLngBounds): MapServiceInspection['bounds'] {
  if (!bounds?.isValid()) return
  const southWest = bounds.getSouthWest()
  const northEast = bounds.getNorthEast()
  return [southWest.lng, southWest.lat, northEast.lng, northEast.lat]
}

function hasTileTemplate(url: string) {
  return /\{z\}/i.test(url) && /\{x\}/i.test(url) && /\{(?:-?y|TileRow)\}/i.test(url)
}

function leafletWmtsTemplate(url: string) {
  return url
    .replace(/\{TileMatrix\}/gi, '{z}')
    .replace(/\{TileCol\}/gi, '{x}')
    .replace(/\{TileRow\}/gi, '{y}')
}

function loadArcGisJson<T extends object>(url: string) {
  const callbackName = `__mapServiceMetadata_${Date.now()}_${++jsonpSequence}`
  return new Promise<T>((resolve, reject) => {
    const script = document.createElement('script')
    const callbacks = window as unknown as Record<string, (payload: T & { error?: unknown }) => void>
    let completed = false
    let timeoutId = 0
    const finish = (payload?: T, reason?: Error) => {
      if (completed) return
      completed = true
      window.clearTimeout(timeoutId)
      script.remove()
      delete callbacks[callbackName]
      if (reason) reject(reason)
      else resolve(payload || {} as T)
    }
    callbacks[callbackName] = (payload) => {
      if (payload?.error) finish(undefined, new Error('地图服务元数据返回错误'))
      else finish(payload)
    }
    script.onerror = () => finish(undefined, new Error('无法访问地图服务元数据'))
    timeoutId = window.setTimeout(() => finish(undefined, new Error('读取地图服务元数据超时')), 10000)
    const parameters = new URLSearchParams({ f: 'json', callback: callbackName })
    script.src = `${url}${url.includes('?') ? '&' : '?'}${parameters.toString()}`
    document.head.appendChild(script)
  })
}

function loadArcGisMetadata(url: string) {
  return loadArcGisJson<ArcGisMapServiceMetadata>(url)
}

function extentBounds(extent?: ArcGisExtent) {
  if (!extent) return
  const { xmin, ymin, xmax, ymax } = extent
  if (![xmin, ymin, xmax, ymax].every((value) => Number.isFinite(value))) return
  const wkid = extent.spatialReference?.latestWkid || extent.spatialReference?.wkid
  if (wkid === 3857 || wkid === 102100 || wkid === 102113) {
    return L.latLngBounds(
      L.CRS.EPSG3857.unproject(L.point(xmin!, ymin!)),
      L.CRS.EPSG3857.unproject(L.point(xmax!, ymax!)),
    )
  }
  if (wkid === 4528 || wkid === 4549) {
    const source = `EPSG:${wkid}`
    // 投影范围不能只转换两个对角点；四角全部转换后重新计算经纬度外包框。
    const corners = [
      [xmin!, ymin!],
      [xmin!, ymax!],
      [xmax!, ymin!],
      [xmax!, ymax!],
    ].map(([x, y]) => proj4(source, 'EPSG:4326', [x!, y!]))
    const bounds = L.latLngBounds([])
    corners.forEach(([longitude, latitude]) => {
      if (Number.isFinite(longitude) && Number.isFinite(latitude)) bounds.extend([latitude!, longitude!])
    })
    return bounds.isValid() ? bounds : undefined
  }
  // ArcGIS 地图服务常见的地理坐标系（4326、4490）均可直接作为经纬度使用。
  if (Math.abs(xmin!) <= 180 && Math.abs(xmax!) <= 180 && Math.abs(ymin!) <= 90 && Math.abs(ymax!) <= 90) {
    return L.latLngBounds([ymin!, xmin!], [ymax!, xmax!])
  }
}

function arcGisBounds(
  metadata: ArcGisMapServiceMetadata,
  config: ServiceRemarkConfig,
  preferCachedMapExtent = true,
) {
  const serviceBounds = extentBounds(metadata.fullExtent) || extentBounds(metadata.initialExtent)
  // 缓存型 MapServer 的真实瓦片可能大于人工备注范围，不能用备注裁掉有效瓦片。
  return preferCachedMapExtent && metadata.singleFusedMapCache
    ? serviceBounds || config.bounds
    : config.bounds || serviceBounds
}

function finiteNumber(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

function parseServiceRemark(remark?: string): ServiceRemarkConfig {
  if (!remark?.trim()) return {}
  try {
    let payload: unknown = JSON.parse(remark)
    // 兼容数据库中被二次 JSON 编码的备注字符串。
    if (typeof payload === 'string') payload = JSON.parse(payload)
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {}
    const record = payload as Record<string, unknown>
    const rawBounds = record.bounds ?? record.extent ?? record
    const wkid = finiteNumber(record.wkid)
      ?? finiteNumber((record.spatialReference as Record<string, unknown> | undefined)?.latestWkid)
      ?? finiteNumber((record.spatialReference as Record<string, unknown> | undefined)?.wkid)
      ?? 4326
    let extent: ArcGisExtent | undefined
    if (Array.isArray(rawBounds) && rawBounds.length >= 4) {
      extent = {
        xmin: finiteNumber(rawBounds[0]),
        ymin: finiteNumber(rawBounds[1]),
        xmax: finiteNumber(rawBounds[2]),
        ymax: finiteNumber(rawBounds[3]),
        spatialReference: { wkid },
      }
    } else if (rawBounds && typeof rawBounds === 'object') {
      const bounds = rawBounds as Record<string, unknown>
      extent = {
        xmin: finiteNumber(bounds.west ?? bounds.xmin),
        ymin: finiteNumber(bounds.south ?? bounds.ymin),
        xmax: finiteNumber(bounds.east ?? bounds.xmax),
        ymax: finiteNumber(bounds.north ?? bounds.ymax),
        spatialReference: {
          wkid: finiteNumber(bounds.wkid)
            ?? finiteNumber((bounds.spatialReference as Record<string, unknown> | undefined)?.latestWkid)
            ?? finiteNumber((bounds.spatialReference as Record<string, unknown> | undefined)?.wkid)
            ?? wkid,
        },
      }
    }
    return {
      bounds: extentBounds(extent),
      minZoom: finiteNumber(record.minZoom),
      maxZoom: finiteNumber(record.maxZoom),
    }
  } catch {
    return {}
  }
}

function tileMapMetadataUrl(template: string) {
  const metadataUrl = template.replace(
    /\/\{z\}\/\{x\}\/\{-?y\}(?:\.[^/?]+)?(?=\?|$)/i,
    '/tilemapresource.xml',
  )
  return metadataUrl === template ? undefined : metadataUrl
}

async function loadTileMapMetadata(template: string): Promise<ServiceRemarkConfig> {
  const metadataUrl = tileMapMetadataUrl(template)
  if (!metadataUrl) return {}
  const cached = tileMapMetadataCache.get(metadataUrl)
  if (cached) return cached

  const request = (async () => {
    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => controller.abort(), 5000)
    try {
      const response = await fetch(metadataUrl, { signal: controller.signal })
      if (!response.ok) throw new Error(`TMS 元数据请求失败：${response.status}`)
      const xml = new DOMParser().parseFromString(await response.text(), 'application/xml')
      if (xml.querySelector('parsererror')) throw new Error('TMS 元数据格式错误')

      const boundingBox = xml.querySelector('BoundingBox')
      const coordinate = (name: string) => {
        const value = boundingBox?.getAttribute(name)
        return value === null || value === undefined || !value.trim() ? undefined : finiteNumber(value)
      }
      const west = coordinate('minx')
      const south = coordinate('miny')
      const east = coordinate('maxx')
      const north = coordinate('maxy')
      let bounds: L.LatLngBounds | undefined
      if (west !== undefined && south !== undefined && east !== undefined && north !== undefined
        && west < east && south < north) {
        // 有些 TMS 声明 EPSG:3857，却在 BoundingBox 中填写经纬度；优先识别实际数值范围。
        if (Math.abs(west) <= 180 && Math.abs(east) <= 180 && Math.abs(south) <= 90 && Math.abs(north) <= 90) {
          bounds = L.latLngBounds([south, west], [north, east])
        } else {
          const wkid = Number(xml.querySelector('SRS')?.textContent?.match(/EPSG:(\d+)/i)?.[1])
          bounds = extentBounds({
            xmin: west, ymin: south, xmax: east, ymax: north,
            spatialReference: { wkid },
          })
        }
      }

      const levels = [...xml.querySelectorAll('TileSet')]
        .map((tileSet) => {
          const order = tileSet.getAttribute('order')
          return order === null || !order.trim() ? undefined : finiteNumber(order)
        })
        .filter((level): level is number => level !== undefined && level >= 0)
      return {
        bounds: bounds?.isValid() ? bounds : undefined,
        minZoom: levels.length ? Math.min(...levels) : undefined,
        maxZoom: levels.length ? Math.max(...levels) : undefined,
      }
    } finally {
      window.clearTimeout(timeoutId)
    }
  })()
  tileMapMetadataCache.set(metadataUrl, request)
  request.catch(() => tileMapMetadataCache.delete(metadataUrl))
  return request
}

async function tmsConfig(template: string, configured: ServiceRemarkConfig): Promise<ServiceRemarkConfig> {
  try {
    const metadata = await loadTileMapMetadata(template)
    return {
      // 备注由人工填写，可能只覆盖附近区域；TMS 自带范围和层级才与实际瓦片对应。
      bounds: metadata.bounds || configured.bounds,
      minZoom: metadata.minZoom ?? configured.minZoom,
      maxZoom: metadata.maxZoom ?? configured.maxZoom,
    }
  } catch {
    // 元数据不存在或不允许跨域读取时，仍保留原有备注配置与瓦片显示能力。
    return configured
  }
}

class ArcGisExportLayer extends L.GridLayer {
  private definitionExpression = '1=1'
  private filterRevision = 0
  private zooming = false
  private strokeColor: [number, number, number, number] = [255, 59, 48, 255]
  private fillColor: [number, number, number, number] = [255, 59, 48, 64]
  private categoryFieldName = ''
  private categoryEntries: Array<{ value: string; color: string }> = []
  private polygonFillAlpha = 64
  private renderRequests = new Map<HTMLImageElement, AbortController>()

  constructor(
    private readonly url: string,
    private readonly imageServer = false,
    private readonly vectorLayerId?: number,
    private readonly vectorGeometryType = 'esriGeometryPolygon',
    color?: string,
  ) {
    super({
      pane: vectorLayerId === undefined ? MAP_SERVICE_IMAGERY_PANE : MAP_SERVICE_VECTOR_PANE,
      tileSize: 256,
      noWrap: true,
      keepBuffer: 3,
      updateWhenIdle: false,
      // Transparent vector tiles from two zoom levels must not be painted together.
      updateWhenZooming: vectorLayerId === undefined,
    })
    if (color) this.applyColor(color)
    this.on('tileunload', (event: L.TileEvent) => {
      const tile = event.tile as HTMLImageElement
      this.renderRequests.get(tile)?.abort()
      this.renderRequests.delete(tile)
      if (tile.src.startsWith('blob:')) URL.revokeObjectURL(tile.src)
    })
  }

  setDisplayColor(color: string) {
    this.applyColor(color)
    if (this.categoryEntries.length) {
      const shades = categoryShadeColors(color, this.categoryEntries.length)
      this.categoryEntries = this.categoryEntries.map((entry, index) => ({
        value: entry.value,
        color: shades[index] || color,
      }))
    }
    this.filterRevision += 1
    if (this._map) this.redraw()
    return this.categoryEntries.map((entry) => entry.color)
  }

  setFillOpacity(opacity: number) {
    this.polygonFillAlpha = Math.round(Math.max(.05, Math.min(.6, opacity)) * 255)
    if (this.vectorGeometryType === 'esriGeometryPolygon') this.fillColor[3] = this.polygonFillAlpha
    this.filterRevision += 1
    if (this._map) this.redraw()
  }

  setCategories(fieldName: string, values: string[], color: string) {
    this.categoryFieldName = fieldName
    const shades = categoryShadeColors(color, values.length)
    this.categoryEntries = values.map((value, index) => ({
      value,
      color: shades[index] || color,
    }))
  }

  private applyColor(color: string) {
    const [red, green, blue] = hexChannels(color)
    this.strokeColor = [red, green, blue, 255]
    this.fillColor = [red, green, blue, this.vectorGeometryType === 'esriGeometryPoint' ? 230 : this.polygonFillAlpha]
  }

  private symbolColors(color: string) {
    const [red, green, blue] = hexChannels(color)
    const [outlineRed, outlineGreen, outlineBlue] = hexChannels(darkerShade(color))
    const fillAlpha = this.vectorGeometryType === 'esriGeometryPoint' ? 230 : this.polygonFillAlpha
    return {
      fill: [red, green, blue, fillAlpha] as [number, number, number, number],
      stroke: [outlineRed, outlineGreen, outlineBlue, 255] as [number, number, number, number],
    }
  }

  private vectorSymbol(
    fill = this.fillColor,
    stroke = this.strokeColor,
  ) {
    if (this.vectorGeometryType === 'esriGeometryPoint') {
      return {
        type: 'esriSMS', style: 'esriSMSCircle', color: fill, size: 9,
        outline: { type: 'esriSLS', style: 'esriSLSSolid', color: stroke, width: 1.5 },
      }
    }
    if (this.vectorGeometryType === 'esriGeometryPolyline') {
      return { type: 'esriSLS', style: 'esriSLSSolid', color: stroke, width: 2.5 }
    }
    return {
      type: 'esriSFS', style: 'esriSFSSolid', color: fill,
      outline: { type: 'esriSLS', style: 'esriSLSSolid', color: stroke, width: 2 },
    }
  }

  private vectorRenderer() {
    const classified = this.categoryEntries.filter((entry) => entry.value !== EMPTY_CATEGORY_VALUE)
    if (!this.categoryFieldName || !classified.length) {
      return { type: 'simple', symbol: this.vectorSymbol() }
    }
    const empty = this.categoryEntries.find((entry) => entry.value === EMPTY_CATEGORY_VALUE)
    const fallback = empty ? this.symbolColors(empty.color) : { fill: this.fillColor, stroke: this.strokeColor }
    return {
      type: 'uniqueValue',
      field1: this.categoryFieldName,
      defaultSymbol: this.vectorSymbol(fallback.fill, fallback.stroke),
      uniqueValueInfos: classified.map((entry) => {
        const colors = this.symbolColors(entry.color)
        return { value: entry.value, symbol: this.vectorSymbol(colors.fill, colors.stroke) }
      }),
    }
  }

  override onAdd(map: L.Map) {
    super.onAdd(map)
    if (this.vectorLayerId !== undefined) {
      map.on('zoomstart', this.hideVectorTiles, this)
      map.on('zoomend', this.finishVectorZoom, this)
      this.on('load', this.showVectorTilesWhenReady, this)
    }
    return this
  }

  override onRemove(map: L.Map) {
    this.renderRequests.forEach(controller => controller.abort())
    this.renderRequests.clear()
    if (this.vectorLayerId !== undefined) {
      map.off('zoomstart', this.hideVectorTiles, this)
      map.off('zoomend', this.finishVectorZoom, this)
      this.off('load', this.showVectorTilesWhenReady, this)
    }
    this.zooming = false
    super.onRemove(map)
    return this
  }

  private hideVectorTiles() {
    this.zooming = true
    const container = this.getContainer()
    if (container) container.style.visibility = 'hidden'
  }

  private finishVectorZoom() {
    this.zooming = false
    this.showVectorTilesWhenReady()
  }

  private showVectorTilesWhenReady() {
    // Keep the old transparent tile level hidden until the new level is complete.
    if (this.zooming) return
    if (this.isLoading()) return
    const container = this.getContainer()
    if (container) container.style.visibility = ''
  }

  override createTile(coords: L.Coords, done: L.DoneCallback) {
    const tile = document.createElement('img')
    const tileSize = this.getTileSize()
    const northWest = this._map.unproject(L.point(coords.x * tileSize.x, coords.y * tileSize.y), coords.z)
    const southEast = this._map.unproject(L.point((coords.x + 1) * tileSize.x, (coords.y + 1) * tileSize.y), coords.z)
    const southWestMeters = L.CRS.EPSG3857.project(L.latLng(southEast.lat, northWest.lng))
    const northEastMeters = L.CRS.EPSG3857.project(L.latLng(northWest.lat, southEast.lng))
    const parameters = new URLSearchParams({
      bbox: `${southWestMeters.x},${southWestMeters.y},${northEastMeters.x},${northEastMeters.y}`,
      bboxSR: '3857',
      imageSR: '3857',
      size: `${tileSize.x},${tileSize.y}`,
      dpi: '96',
      format: 'png32',
      transparent: 'true',
      f: 'image',
    })
    if (this.vectorLayerId !== undefined) {
      parameters.set('_filterRevision', String(this.filterRevision))
      parameters.set('layers', `show:${this.vectorLayerId}`)
      parameters.set('layerDefs', JSON.stringify({ [this.vectorLayerId]: this.definitionExpression }))
      parameters.set('dynamicLayers', JSON.stringify([{
        id: this.vectorLayerId,
        source: { type: 'mapLayer', mapLayerId: this.vectorLayerId },
        // 使用 dynamicLayers 重绘矢量边界时，筛选条件也必须写入动态图层定义。
        // 仅传 layerDefs 在部分旧版 ArcGIS Server 上会被 dynamicLayers 覆盖而失效。
        definitionExpression: this.definitionExpression,
        drawingInfo: {
          showLabels: false,
          renderer: this.vectorRenderer(),
        },
      }]))
    }
    tile.alt = ''
    tile.setAttribute('role', 'presentation')
    tile.onload = () => {
      if (tile.src.startsWith('blob:')) URL.revokeObjectURL(tile.src)
      done(undefined, tile)
    }
    tile.onerror = () => {
      if (tile.src.startsWith('blob:')) URL.revokeObjectURL(tile.src)
      done(new Error('地图服务影像加载失败'), tile)
    }
    const endpoint = `${this.url}/${this.imageServer ? 'exportImage' : 'export'}`
    // Hundreds of category symbols exceed proxy URL limits. Keep rendering in the POST body.
    if (parameters.toString().length > 1800) {
      const controller = new AbortController()
      this.renderRequests.set(tile, controller)
      void fetch(endpoint, { method: 'POST', body: parameters, signal: controller.signal })
        .then(async response => {
          if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) throw new Error('地图渲染请求失败')
          const blob = await response.blob()
          if (!controller.signal.aborted) tile.src = URL.createObjectURL(blob)
        })
        .catch(() => { if (!controller.signal.aborted) tile.onerror?.(new Event('error')) })
        .finally(() => this.renderRequests.delete(tile))
    } else {
      tile.src = `${endpoint}?${parameters.toString()}`
    }
    return tile
  }

  setDefinitionExpression(expression: string) {
    this.definitionExpression = expression
    this.filterRevision += 1
    this.redraw()
  }

  createFilteredCopy(expression: string) {
    const layer = new ArcGisExportLayer(this.url, this.imageServer, this.vectorLayerId, this.vectorGeometryType)
    // 仪表盘允许按服务调整叠放顺序；筛选时的无闪烁替换层必须沿用原服务 pane。
    layer.options.pane = this.options.pane
    layer.definitionExpression = expression
    layer.polygonFillAlpha = this.polygonFillAlpha
    layer.strokeColor = [...this.strokeColor]
    layer.fillColor = [...this.fillColor]
    layer.categoryFieldName = this.categoryFieldName
    layer.categoryEntries = this.categoryEntries.map((entry) => ({ ...entry }))
    layer.filterRevision = this.filterRevision + 1
    return layer
  }
}

function categoryField(metadata: ArcGisLayerMetadata) {
  const layerName = metadata.name?.trim() || ''
  const layerCandidates: Record<string, string[]> = {
    'Point_项目工程设施': ['GCMC'],
    项目工程设施: ['GCMC'],
    关联工程设施: ['GCMC'],
    项目范围: ['XMMC'],
    耕地细化: ['JYZTMC_1'],
    高标准农田GBZ: ['项目类', 'XMLX'],
  }
  const candidates = [...(layerCandidates[layerName] || []), 'DLMC', '地类名称', '变化类', 'DKLX', 'DKLXMC', '地块类型']
  return candidates.flatMap((candidate) => (metadata.fields || []).filter((field) =>
    field.name?.toUpperCase() === candidate.toUpperCase() || field.alias?.toUpperCase() === candidate.toUpperCase()))[0]
}

function hoverField(metadata: ArcGisLayerMetadata) {
  const names = ['DLMC', 'DKLXMC', 'DKLX', '地块类型', '地类名称', '变化类']
  if (metadata.name?.trim() === '高标准农田GBZ') names.push('项目类', 'XMLX')
  return names.flatMap(name => (metadata.fields || []).filter(field => field.name?.toUpperCase() === name.toUpperCase() || field.alias === name))[0]
}

function fieldLabel(field?: { name?: string; alias?: string }) {
  const name = field?.name || ''
  const labels: Record<string, string> = {
    项目类: '项目类型', XMLX: '项目类型', GCMC: '工程名称', XMMC: '项目名称', DKBM: '地块编码', DCBH: '地块编号',
    JYZTMC_1: '经营主体名称',
    DKLX: '地块类型', DKLXMC: '地块类型', DKMC: '地块名称',
    DLMC: '地类名称', '变化类': '变化类型',
  }
  return labels[name] || field?.alias || name || '名称'
}

interface MapHoverSelection { key: string; expression: string; objectIdField: string; label: string; value: string }
const selectedHoverByMap = new WeakMap<L.Map, MapHoverSelection>()
export function setMapHoverSelection(map: L.Map, service?: MapServiceItem, feature?: IdentifiedMapFeature) {
  selectedHoverByMap.delete(map)
  if (service && feature?.objectIdField && feature.objectId != null) {
    selectedHoverByMap.set(map, {
      key: `${serviceRoot(service.serviceUrl)}/${service.arcGisLayerId}`,
      expression: `${feature.objectIdField} = ${typeof feature.objectId === 'number' ? feature.objectId : sqlLiteral(String(feature.objectId))}`,
      objectIdField: feature.objectIdField,
      label: feature.typeLabel || '地块类型', value: feature.typeValue || '暂无地块类型',
    })
  }
  hoverGeneration += 1
  hoverSlots.clear()
  if (sharedHoverTooltip) map.closeTooltip(sharedHoverTooltip)
}

const hoverSlots = new Map<string, { generation: number; label: string; value: string }>()
let hoverGeneration = 0
let lastHoverStamp = -1
let sharedHoverTooltip: L.Tooltip | undefined
let sharedHoverLatLng: L.LatLng | undefined
let sharedHoverMap: L.Map | undefined

function hoverGenerationFor(event: L.LeafletMouseEvent) {
  const stamp = event.originalEvent.timeStamp
  if (stamp !== lastHoverStamp) {
    lastHoverStamp = stamp
    hoverGeneration += 1
    sharedHoverLatLng = event.latlng
    hoverSlots.clear()
    if (sharedHoverTooltip && sharedHoverMap) sharedHoverMap.closeTooltip(sharedHoverTooltip)
  }
  return hoverGeneration
}

function renderSharedHover(map: L.Map) {
  sharedHoverMap = map
  for (const [key, slot] of hoverSlots) {
    if (slot.generation !== hoverGeneration) hoverSlots.delete(key)
  }
  if (!hoverSlots.size || !sharedHoverLatLng) {
    if (sharedHoverTooltip) map.closeTooltip(sharedHoverTooltip)
    return
  }
  if (!sharedHoverTooltip) {
    sharedHoverTooltip = L.tooltip({
      direction: 'top',
      offset: [0, -12],
      opacity: 1,
      className: 'jiulong-feature-tooltip',
    })
  }
  const content = document.createElement('div')
  content.className = 'hover-stack'
  hoverSlots.forEach((row) => {
    const line = document.createElement('div')
    const label = document.createElement('span')
    const value = document.createElement('strong')
    label.textContent = `${row.label}：`
    value.textContent = row.value
    line.append(label, value)
    content.append(line)
  })
  sharedHoverTooltip.setLatLng(sharedHoverLatLng).setContent(content)
  map.openTooltip(sharedHoverTooltip)
}

function publishHover(key: string, generation: number, map: L.Map, label: string | null, value: string | null) {
  if (generation !== hoverGeneration) return
  if (label && value) hoverSlots.set(key, { generation, label, value })
  else hoverSlots.delete(key)
  renderSharedHover(map)
}

function clearHoverSlot(key: string, map?: L.Map) {
  hoverSlots.delete(key)
  if (map) renderSharedHover(map)
}

class ArcGisVectorLayer extends L.LayerGroup {
  private hoverTimer?: number
  private requestSequence = 0
  private filterSwapSequence = 0
  private pendingImageLayer?: ArcGisExportLayer
  private definitionExpression = '1=1'
  private imageLayer: L.Layer

  private get hoverKey() {
    return `${this.serviceUrl}/${this.layerId}`
  }

  constructor(
    imageLayer: L.Layer,
    private readonly serviceUrl: string,
    private readonly layerId: number,
    private readonly fieldName?: string,
    private readonly fieldLabel = '地类名称',
    private readonly fallbackFieldName?: string,
    private readonly fallbackFieldLabel = '名称',
  ) {
    super([imageLayer])
    this.imageLayer = imageLayer
  }

  override onAdd(map: L.Map) {
    super.onAdd(map)
    map.on('mousemove', this.handleMouseMove, this)
    map.on('mouseout', this.closeVectorTooltip, this)
    map.on('zoomstart', this.closeVectorTooltip, this)
    return this
  }

  override onRemove(map: L.Map) {
    map.off('mousemove', this.handleMouseMove, this)
    map.off('mouseout', this.closeVectorTooltip, this)
    map.off('zoomstart', this.closeVectorTooltip, this)
    this.closeVectorTooltip()
    super.onRemove(map)
    return this
  }

  private closeVectorTooltip() {
    this.requestSequence += 1
    if (this.hoverTimer !== undefined) window.clearTimeout(this.hoverTimer)
    this.hoverTimer = undefined
    clearHoverSlot(this.hoverKey, this._map)
  }

  private handleMouseMove(event: L.LeafletMouseEvent) {
    const focus = this._map ? selectedHoverByMap.get(this._map) : undefined
    if (focus && this.hoverKey !== focus.key) { this.closeVectorTooltip(); return }
    const fieldName = focus?.objectIdField || this.fieldName
    if (!fieldName) return
    const generation = hoverGenerationFor(event)
    if (this.hoverTimer !== undefined) window.clearTimeout(this.hoverTimer)
    const sequence = ++this.requestSequence
    this.hoverTimer = window.setTimeout(async () => {
      this.hoverTimer = undefined
      const map = this._map
      if (!map) return
      const pointer = map.latLngToContainerPoint(event.latlng)
      const northWest = map.containerPointToLatLng(pointer.subtract([6, 6]))
      const southEast = map.containerPointToLatLng(pointer.add([6, 6]))
      const parameters = new URLSearchParams({
        where: focus ? `(${this.definitionExpression}) AND (${focus.expression})` : this.definitionExpression,
        geometry: JSON.stringify({
          xmin: northWest.lng,
          ymin: southEast.lat,
          xmax: southEast.lng,
          ymax: northWest.lat,
          spatialReference: { wkid: 4326 },
        }),
        geometryType: 'esriGeometryEnvelope',
        inSR: '4326',
        spatialRel: 'esriSpatialRelIntersects',
        outFields: [fieldName, this.fallbackFieldName].filter(Boolean).join(','),
        returnGeometry: 'false',
      })
      try {
        const response = await queryAllFeatures(`${this.serviceUrl}/${this.layerId}/query`, parameters)
        if (sequence !== this.requestSequence || (this._map && selectedHoverByMap.get(this._map) !== focus)) return
        const features = response.features || []
        const hasValue = (value: unknown) => value != null && String(value).trim() !== ''
        let values = [...new Set(features.map(feature => feature.attributes?.[fieldName]).filter(hasValue).map(String))]
        let tooltipLabel = this.fieldLabel
        if (!values.length && this.fallbackFieldName) {
          const fallbackFieldName = this.fallbackFieldName
          values = [...new Set(features.map(feature => feature.attributes?.[fallbackFieldName]).filter(hasValue).map(String))]
          tooltipLabel = this.fallbackFieldLabel
        }
        publishHover(this.hoverKey, generation, map, focus?.label || tooltipLabel, features.length && focus ? focus.value : values.length ? values.join('、') : null)
      } catch {
        if (sequence === this.requestSequence && this._map) publishHover(this.hoverKey, generation, this._map, null, null)
      }
    }, 140)
  }

  setDisplayColor(color: string) {
    const colors = this.imageLayer instanceof ArcGisExportLayer ? this.imageLayer.setDisplayColor(color) : []
    this.pendingImageLayer?.setDisplayColor(color)
    return colors
  }

  setFillOpacity(opacity: number) {
    if (this.imageLayer instanceof ArcGisExportLayer) this.imageLayer.setFillOpacity(opacity)
    this.pendingImageLayer?.setFillOpacity(opacity)
  }

  setCategories(fieldName: string, values: string[], color: string) {
    if (this.imageLayer instanceof ArcGisExportLayer) this.imageLayer.setCategories(fieldName, values, color)
  }

  currentDefinitionExpression() {
    return this.definitionExpression
  }

  setDefinitionExpression(expression: string) {
    this.definitionExpression = expression
    const swapSequence = ++this.filterSwapSequence
    if (this.pendingImageLayer) {
      this.pendingImageLayer.off()
      if (this.hasLayer(this.pendingImageLayer)) this.removeLayer(this.pendingImageLayer)
      this.pendingImageLayer = undefined
    }
    // 部分旧版 ArcGIS Server 会忽略 1=0 并继续返回完整图层。
    // 全不选时直接移除渲染层，重新选择任意类型时再加入，保证显隐结果确定。
    if (expression === '1=0') {
      if (this.hasLayer(this.imageLayer)) this.removeLayer(this.imageLayer)
    } else if (!this.hasLayer(this.imageLayer)) {
      if (this.imageLayer instanceof ArcGisExportLayer) this.imageLayer.setDefinitionExpression(expression)
      this.addLayer(this.imageLayer)
    } else if (this.imageLayer instanceof ArcGisExportLayer) {
      // GridLayer.redraw() 会先清空旧瓦片，导致筛选时整层短暂消失。
      // 先透明加载一个带新筛选条件的副本，完整加载后再原子替换旧层。
      const previousLayer = this.imageLayer
      const replacementLayer = previousLayer.createFilteredCopy(expression)
      this.pendingImageLayer = replacementLayer
      replacementLayer.setOpacity(0)
      replacementLayer.once('load', () => {
        if (swapSequence !== this.filterSwapSequence || this.pendingImageLayer !== replacementLayer) {
          if (this.hasLayer(replacementLayer)) this.removeLayer(replacementLayer)
          return
        }
        replacementLayer.setOpacity(1)
        if (this.hasLayer(previousLayer)) this.removeLayer(previousLayer)
        this.imageLayer = replacementLayer
        this.pendingImageLayer = undefined
      })
      this.addLayer(replacementLayer)
    } else {
      this.imageLayer.remove()
      this.addLayer(this.imageLayer)
    }
    this.closeVectorTooltip()
  }
}

function sqlLiteral(value: string) {
  return `'${value.replace(/'/g, "''")}'`
}

const EMPTY_CATEGORY_VALUE = '__MAP_SERVICE_EMPTY_CATEGORY__'

function categoryMatchExpression(fieldName: string, value: string) {
  return value === EMPTY_CATEGORY_VALUE
    ? `(${fieldName} IS NULL OR ${fieldName} = '')`
    : `${fieldName} = ${sqlLiteral(value)}`
}

function categoryExpression(fieldName: string, allValues: string[], visibleValues: string[]) {
  if (visibleValues.length === allValues.length) return '1=1'
  if (!visibleValues.length) return '1=0'
  const visibleSet = new Set(visibleValues)
  const hiddenValues = allValues.filter((value) => !visibleSet.has(value))

  // 旧版 ArcGIS Server 对动态图层中的长 OR 表达式兼容较差。只取消少量
  // 分类时生成更短的排除条件；空值分类必须显式处理 SQL 的 NULL 三值逻辑。
  if (hiddenValues.length < visibleValues.length) {
    const clauses = hiddenValues.map((value) => value === EMPTY_CATEGORY_VALUE
      ? `(${fieldName} IS NOT NULL AND ${fieldName} <> '')`
      : `(${fieldName} <> ${sqlLiteral(value)} OR ${fieldName} IS NULL)`)
    return `(${clauses.join(' AND ')})`
  }

  const clauses = visibleValues.map((value) => categoryMatchExpression(fieldName, value))
  return `(${clauses.join(' OR ')})`
}

async function queryCategoryBounds(serviceUrl: string, layerId: number, fieldName: string, value: string) {
  const parameters = new URLSearchParams({
    where: categoryMatchExpression(fieldName, value),
    returnExtentOnly: 'true',
    returnGeometry: 'false',
    outSR: '4326',
  })
  const response = await loadArcGisJson<ArcGisQueryResponse>(
    `${serviceUrl}/${layerId}/query?${parameters.toString()}`,
  )
  return extentBounds(response.extent)
}

async function queryCategoryGeometries(
  serviceUrl: string,
  layerId: number,
  fieldName: string,
  value: string,
  objectIdFieldName: string,
) {
  const where = categoryMatchExpression(fieldName, value)
  const idParameters = new URLSearchParams({
    where,
    returnIdsOnly: 'true',
    returnGeometry: 'false',
  })
  const idResponse = await loadArcGisJson<ArcGisQueryResponse>(
    `${serviceUrl}/${layerId}/query?${idParameters.toString()}`,
  )
  const objectIds = idResponse.objectIds || []
  const geometries: MapServiceSearchGeometry[] = []
  const appendGeometries = (response: ArcGisQueryResponse) => {
    for (const feature of response.features || []) {
      if (feature.geometry) geometries.push(feature.geometry)
    }
  }

  if (objectIds.length) {
    const batchSize = 200
    for (let index = 0; index < objectIds.length; index += batchSize) {
      const parameters = new URLSearchParams({
        objectIds: objectIds.slice(index, index + batchSize).join(','),
        outFields: objectIdFieldName,
        returnGeometry: 'true',
        outSR: '4326',
      })
      appendGeometries(await loadArcGisJson<ArcGisQueryResponse>(
        `${serviceUrl}/${layerId}/query?${parameters.toString()}`,
      ))
    }
  } else {
    const parameters = new URLSearchParams({
      where,
      outFields: objectIdFieldName,
      returnGeometry: 'true',
      outSR: '4326',
    })
    appendGeometries(await loadArcGisJson<ArcGisQueryResponse>(
      `${serviceUrl}/${layerId}/query?${parameters.toString()}`,
    ))
  }

  return geometries
}

async function queryCategoryValues(serviceUrl: string, layerId: number, fieldName: string) {
  const idParameters = new URLSearchParams({
    where: '1=1',
    returnIdsOnly: 'true',
    returnGeometry: 'false',
  })
  const idResponse = await loadArcGisJson<ArcGisQueryResponse>(
    `${serviceUrl}/${layerId}/query?${idParameters.toString()}`,
  )
  const objectIds = idResponse.objectIds || []
  const valueSet = new Set<string>()
  let hasEmptyValue = false
  const appendValues = (response: ArcGisQueryResponse) => {
    for (const feature of response.features || []) {
      const value = feature.attributes?.[fieldName]
      if (value != null && String(value).trim()) valueSet.add(String(value).trim())
      else hasEmptyValue = true
    }
  }

  if (objectIds.length) {
    // ArcGIS 10.4 的查询结果受 maxRecordCount 限制，且该服务不支持 distinct/orderBy。
    // 先读取不受条数限制的全部 ObjectID，再分批查询属性，确保不会遗漏低频地块类型。
    const batchSize = 200
    for (let index = 0; index < objectIds.length; index += batchSize) {
      const parameters = new URLSearchParams({
        objectIds: objectIds.slice(index, index + batchSize).join(','),
        outFields: fieldName,
        returnGeometry: 'false',
      })
      appendValues(await loadArcGisJson<ArcGisQueryResponse>(
        `${serviceUrl}/${layerId}/query?${parameters.toString()}`,
      ))
    }
  } else {
    // 少数服务不返回 ObjectID，保留普通属性查询作为兼容降级。
    const parameters = new URLSearchParams({
      where: '1=1',
      outFields: fieldName,
      returnGeometry: 'false',
    })
    appendValues(await loadArcGisJson<ArcGisQueryResponse>(
      `${serviceUrl}/${layerId}/query?${parameters.toString()}`,
    ))
  }

  return {
    values: [...valueSet].sort((left, right) => left.localeCompare(right, 'zh-CN')),
    hasEmptyValue,
  }
}

function createTemplateLayer(url: string, tms = false, config: ServiceRemarkConfig = {}) {
  if (!hasTileTemplate(url)) throw new Error('瓦片服务地址缺少 {z}/{x}/{y} 模板参数')
  return L.tileLayer(url, {
    pane: MAP_SERVICE_IMAGERY_PANE,
    bounds: config.bounds,
    tms,
    minNativeZoom: config.minZoom,
    maxNativeZoom: config.maxZoom,
    maxZoom: Math.max(config.maxZoom || 22, 22),
    noWrap: true,
    keepBuffer: 3,
  })
}

function createWmsLayer(url: string, config: ServiceRemarkConfig) {
  let layers = ''
  try {
    const parsed = new URL(url, window.location.href)
    layers = parsed.searchParams.get('layers') || parsed.searchParams.get('LAYERS') || ''
  } catch {
    // 地址格式错误时交给 Leaflet 触发网络错误；这里只补充必要参数校验。
  }
  if (!layers) throw new Error('WMS 服务地址必须包含 layers 参数')
  return L.tileLayer.wms(url, {
    pane: MAP_SERVICE_IMAGERY_PANE,
    bounds: config.bounds,
    minZoom: config.minZoom,
    maxZoom: config.maxZoom || 22,
    layers,
    format: 'image/png',
    transparent: true,
    version: '1.3.0',
  })
}

async function createArcGisVectorHandle(
  url: string,
  layerId: number,
  layerMetadata: ArcGisLayerMetadata,
  bounds?: L.LatLngBounds,
  color = vectorLayerColor(`${url}/${layerId}`),
): Promise<MapServiceLayerHandle> {
  const tooltipField = hoverField(layerMetadata)
  const tooltipLabel = fieldLabel(tooltipField)
  const fallbackTooltipField = undefined
  const fallbackTooltipLabel = ''
  const filterField = categoryField(layerMetadata)
  const filterLabel = fieldLabel(filterField)
  const objectIdFieldName = layerMetadata.fields?.find((field) => field.type === 'esriFieldTypeOID')?.name || 'OBJECTID'
  const imageLayer = new ArcGisExportLayer(url, false, layerId, layerMetadata.geometryType, color)
  const vectorLayer = new ArcGisVectorLayer(
    imageLayer,
    url,
    layerId,
    tooltipField?.name,
    tooltipLabel,
    fallbackTooltipField,
    fallbackTooltipLabel,
  )
  let categoryDefinition = '1=1'
  let attributeDefinition = '1=1'
  const applyFilter = () => vectorLayer.setDefinitionExpression(categoryDefinition === '1=0' ? '1=0' : categoryDefinition === '1=1' ? attributeDefinition : attributeDefinition === '1=1' ? categoryDefinition : `(${categoryDefinition}) AND (${attributeDefinition})`)
  let categoryFilter: MapServiceCategoryFilter | undefined
  if (filterField?.name) {
    try {
      const categoryValues = await queryCategoryValues(url, layerId, filterField.name)
      const values = [
        ...categoryValues.values,
        ...(categoryValues.hasEmptyValue ? [EMPTY_CATEGORY_VALUE] : []),
      ]
      if (values.length) {
        vectorLayer.setCategories(filterField.name, values, color)
        const shades = categoryShadeColors(color, values.length)
        categoryFilter = {
          fieldName: filterField.name,
          fieldLabel: filterLabel,
          values: values.map((value, index) => ({
            value,
            label: value === EMPTY_CATEGORY_VALUE ? '其他' : value,
            color: shades[index] || color,
          })),
          setVisibleValues: visibleValues => {
            categoryDefinition = categoryExpression(filterField.name!, values, visibleValues)
            applyFilter()
          },
          locateValue: async (value) => {
            const [valueBounds, geometries] = await Promise.all([
              queryCategoryBounds(url, layerId, filterField.name!, value),
              queryCategoryGeometries(url, layerId, filterField.name!, value, objectIdFieldName),
            ])
            return { bounds: valueBounds, geometryType: layerMetadata.geometryType, geometries }
          },
        }
      }
    } catch {
      // 分类查询失败不影响矢量图层本身显示。
    }
  }
  return {
    layer: vectorLayer,
    bounds,
    categoryFilter,
    color,
    setColor: (next) => {
      const shades = vectorLayer.setDisplayColor(next)
      categoryFilter?.values.forEach((item, index) => {
        const shade = shades[index]
        if (shade) item.color = shade
      })
      return shades
    },
    setFillOpacity: opacity => vectorLayer.setFillOpacity(opacity),
    setAttributeFilter: (field, value) => {
      const type = layerMetadata.fields?.find(item => item.name === field)?.type
      const numeric = type && /Integer|Double|Single|OID/.test(type) && value != null && value.trim() !== '' && Number.isFinite(Number(value))
      attributeDefinition = field ? numeric ? `${field} = ${Number(value)}` : categoryMatchExpression(field, value ?? '') : '1=1'
      applyFilter()
    },
    definitionExpression: () => vectorLayer.currentDefinitionExpression(),
  }
}

async function createArcGisLayer(
  url: string,
  imageServer: boolean,
  config: ServiceRemarkConfig,
  selectedLayerId?: number,
  selectedGeometryType?: string,
  color?: string,
): Promise<MapServiceLayerHandle> {
  const metadata = await loadArcGisMetadata(url)
  const bounds = arcGisBounds(metadata, config, !imageServer)
  if (metadata.singleFusedMapCache) {
    const levels = (metadata.tileInfo?.lods || []).map((lod) => Number(lod.level)).filter(Number.isFinite)
    return {
      layer: L.tileLayer(`${url}/tile/{z}/{y}/{x}`, {
        pane: MAP_SERVICE_IMAGERY_PANE,
        bounds,
        minNativeZoom: config.minZoom ?? (levels.length ? Math.min(...levels) : 0),
        maxNativeZoom: config.maxZoom ?? (levels.length ? Math.max(...levels) : 22),
        maxZoom: Math.max(config.maxZoom || 22, 22),
        noWrap: true,
        keepBuffer: 3,
      }),
      bounds,
    }
  }
  if (!imageServer) {
    if (selectedLayerId !== undefined) {
      const layerMetadata = await loadArcGisJson<ArcGisLayerMetadata>(`${url}/${selectedLayerId}`)
      if (selectedGeometryType && !layerMetadata.geometryType) layerMetadata.geometryType = selectedGeometryType
      if (layerMetadata.geometryType) return createArcGisVectorHandle(url, selectedLayerId, layerMetadata, bounds, color)
    }
    for (const definition of (metadata.layers || []).slice(0, 12)) {
      if (!Number.isFinite(Number(definition.id))) continue
      const layerId = Number(definition.id)
      const layerMetadata = await loadArcGisJson<ArcGisLayerMetadata>(`${url}/${layerId}`)
      if (layerMetadata.geometryType !== 'esriGeometryPolygon') continue
      return createArcGisVectorHandle(url, layerId, layerMetadata, bounds, color)
    }
  }
  return { layer: new ArcGisExportLayer(url, imageServer), bounds }
}

export async function createMapServiceLayer(service: MapServiceItem, color?: string): Promise<MapServiceLayerHandle> {
  const url = serviceRoot(service.serviceUrl)
  const type = normalizedType(service.type)
  const config = parseServiceRemark(service.remark)

  if (type.includes('TMS')) {
    const resolvedConfig = await tmsConfig(url, config)
    return { layer: createTemplateLayer(url, true, resolvedConfig), bounds: resolvedConfig.bounds }
  }
  if (type.includes('XYZ')) return { layer: createTemplateLayer(url, false, config), bounds: config.bounds }
  if (type.includes('WMTS')) return { layer: createTemplateLayer(leafletWmtsTemplate(url), false, config), bounds: config.bounds }
  if (type.includes('WMS')) return { layer: createWmsLayer(url, config), bounds: config.bounds }
  if (type.includes('ARCGIS_IMAGESERVER') || /\/ImageServer(?:\?|$)/i.test(url)) {
    return createArcGisLayer(url, true, config)
  }
  if (type.includes('ARCGIS_MAPSERVER') || type === 'ARCGIS' || /\/MapServer(?:\?|$)/i.test(url)) {
    return createArcGisLayer(url, false, config, service.arcGisLayerId, service.arcGisGeometryType, color)
  }
  throw new Error(`暂不支持地图服务类型：${service.type || '未知'}`)
}

/**
 * 将动态 ArcGIS MapServer 中的矢量子图层展开为独立的图层管理条目。
 * 缓存影像、ImageServer 以及没有多个矢量子图层的服务保持原有名称和条目数量。
 */
export async function expandMapServiceSublayers(service: MapServiceItem): Promise<MapServiceItem[]> {
  const url = serviceRoot(service.serviceUrl)
  const type = normalizedType(service.type)
  if (!(type.includes('ARCGIS_MAPSERVER') || type === 'ARCGIS' || /\/MapServer(?:\?|$)/i.test(url))) return [service]

  try {
    const metadata = await loadArcGisMetadata(url)
    if (metadata.singleFusedMapCache) return [service]
    const layers = (await Promise.all((metadata.layers || []).slice(0, 50).map(async (definition) => {
      const layerId = Number(definition.id)
      if (!Number.isFinite(layerId)) return undefined
      try {
        const layerMetadata = await loadArcGisJson<ArcGisLayerMetadata>(`${url}/${layerId}`)
        if (!layerMetadata.geometryType) return undefined
        return { id: layerId, name: definition.name || `子图层${layerId}`, geometryType: layerMetadata.geometryType }
      } catch {
        return undefined
      }
    }))).filter((layer): layer is { id: number; name: string; geometryType: string } => Boolean(layer))

    if (layers.length <= 1) {
      const layer = layers[0]
      return layer ? [{ ...service, arcGisLayerId: layer.id, arcGisGeometryType: layer.geometryType }] : [service]
    }
    return layers.map((layer) => ({
      ...service,
      id: `${service.id}::${layer.id}`,
      name: layer.name,
      sourceServiceId: service.id,
      arcGisLayerId: layer.id,
      arcGisGeometryType: layer.geometryType,
    }))
  } catch {
    return [service]
  }
}

/**
 * 读取地图服务的空间覆盖范围并排除矢量服务，供异常图斑自动匹配多期影像。
 * 无覆盖范围的服务不能可靠判断空间关系，因此不会被猜测为命中。
 */
export async function inspectMapService(service: MapServiceItem): Promise<MapServiceInspection> {
  if (isExplicitVectorService(service)) return { isImagery: false }
  const url = serviceRoot(service.serviceUrl)
  const type = normalizedType(service.type)
  const config = parseServiceRemark(service.remark)

  if (type.includes('ARCGIS_IMAGESERVER') || /\/ImageServer(?:\?|$)/i.test(url)) {
    const metadata = await loadArcGisMetadata(url)
    return { isImagery: true, bounds: serializableBounds(arcGisBounds(metadata, config, false)) }
  }

  if (type.includes('ARCGIS_MAPSERVER') || type === 'ARCGIS' || /\/MapServer(?:\?|$)/i.test(url)) {
    const metadata = await loadArcGisMetadata(url)
    // 缓存切片 MapServer 在子图层元数据中也可能带 geometryType，但前端实际
    // 获取的是已经渲染好的影像瓦片，不能因此把它误判为矢量服务。
    if (metadata.singleFusedMapCache) {
      return { isImagery: true, bounds: serializableBounds(arcGisBounds(metadata, config)) }
    }
    for (const definition of (metadata.layers || []).slice(0, 12)) {
      if (!Number.isFinite(Number(definition.id))) continue
      const layerMetadata = await loadArcGisJson<ArcGisLayerMetadata>(`${url}/${Number(definition.id)}`)
      if (layerMetadata.geometryType) return { isImagery: false }
    }
    return { isImagery: true, bounds: serializableBounds(arcGisBounds(metadata, config)) }
  }

  if (type.includes('TMS')) {
    const resolvedConfig = await tmsConfig(url, config)
    return { isImagery: true, bounds: serializableBounds(resolvedConfig.bounds) }
  }

  if (type.includes('XYZ') || type.includes('WMTS') || type.includes('WMS')) {
    return { isImagery: true, bounds: serializableBounds(config.bounds) }
  }

  return { isImagery: false }
}

const layerFieldCache = new Map<string, Promise<ArcGisLayerMetadata>>()

function cachedLayerMetadata(url: string, layerId: number) {
  const key = `${url}/${layerId}`
  const cached = layerFieldCache.get(key)
  if (cached) return cached
  const request = loadArcGisJson<ArcGisLayerMetadata>(`${url}/${layerId}`)
  layerFieldCache.set(key, request)
  request.catch(() => layerFieldCache.delete(key))
  return request
}

function extendFeatureBounds(bounds: L.LatLngBounds, geometry?: MapServiceSearchGeometry) {
  const visit = (pair?: number[]) => {
    if (!pair || pair.length < 2) return
    const [longitude, latitude] = pair
    if (Number.isFinite(longitude) && Number.isFinite(latitude)) bounds.extend([latitude!, longitude!])
  }
  geometry?.rings?.forEach((ring) => ring.forEach(visit))
  geometry?.paths?.forEach((path) => path.forEach(visit))
  geometry?.points?.forEach(visit)
  if (Number.isFinite(geometry?.x) && Number.isFinite(geometry?.y)) bounds.extend([geometry!.y!, geometry!.x!])
}

function attributeRows(attributes?: Record<string, unknown>, aliases?: Record<string, string>): MapFeatureAttributeRow[] {
  return Object.entries(attributes || {})
    .map(([name, value]) => ({
      name,
      label: fieldLabel({ name, alias: aliases?.[name] }),
      value: value == null || String(value).trim() === '' ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value),
    }))
}

function featureLocation(feature: { geometry?: MapServiceSearchGeometry }, geometryType?: string): MapServiceCategoryLocation {
  const bounds = L.latLngBounds([])
  extendFeatureBounds(bounds, feature.geometry)
  return {
    bounds: bounds.isValid() ? bounds : undefined,
    geometryType,
    geometries: feature.geometry ? [feature.geometry] : [],
  }
}

async function queryArcGis(url: string, parameters: URLSearchParams): Promise<ArcGisQueryResponse> {
  parameters.set('f', 'json')
  let data: ArcGisQueryResponse & { error?: { message?: string } }
  try {
    const response = await fetch(url, { method: 'POST', body: parameters })
    if (!response.ok) throw new Error(`图层查询失败 (${response.status})`)
    data = await response.json() as typeof data
  } catch {
    // Some older ArcGIS services allow JSONP but do not enable CORS for POST.
    data = await loadArcGisJson<ArcGisQueryResponse>(`${url}?${parameters.toString()}`)
  }
  if (data.error) throw new Error(data.error.message || '图层查询条件不受服务支持')
  return data
}

async function queryAllFeatures(url: string, parameters: URLSearchParams): Promise<ArcGisQueryResponse> {
  // ID queries work on legacy MapServer versions without pagination and are not
  // subject to the feature transfer limit. Read every matching ID in small batches.
  const idParameters = new URLSearchParams(parameters)
  idParameters.delete('resultRecordCount')
  idParameters.delete('resultOffset')
  idParameters.delete('outFields')
  idParameters.set('returnIdsOnly', 'true')
  idParameters.set('returnGeometry', 'false')
  const index = await queryArcGis(url, idParameters)
  const ids = index.objectIds
  if (!ids) throw new Error('图层服务未返回完整要素索引')
  const features: NonNullable<ArcGisQueryResponse['features']> = []
  let fieldAliases: ArcGisQueryResponse['fieldAliases']
  const readBatch = async (batchIds: Array<number | string>): Promise<void> => {
    const batch = new URLSearchParams(parameters)
    batch.delete('resultRecordCount')
    batch.delete('resultOffset')
    batch.set('objectIds', batchIds.join(','))
    const result = await queryArcGis(url, batch)
    if (result.exceededTransferLimit) {
      if (batchIds.length <= 1) throw new Error('服务未能完整返回要素')
      const middle = Math.ceil(batchIds.length / 2)
      await readBatch(batchIds.slice(0, middle))
      await readBatch(batchIds.slice(middle))
      return
    }
    fieldAliases = result.fieldAliases || fieldAliases
    features.push(...(result.features || []))
  }
  for (let offset = 0; offset < ids.length; offset += 200) {
    await readBatch(ids.slice(offset, offset + 200))
  }
  return { features, fieldAliases }
}

function identifiedFeature(service: MapServiceItem, feature: NonNullable<ArcGisQueryResponse['features']>[number], metadata: ArcGisLayerMetadata, aliases?: Record<string, string>): IdentifiedMapFeature {
  const rows = attributeRows(feature.attributes, aliases)
  const type = hoverField(metadata)
  const category = categoryField(metadata)
  const oid = metadata.fields?.find(field => field.type === 'esriFieldTypeOID')?.name || 'OBJECTID'
  const oidValue = feature.attributes?.[oid]
  return {
    serviceId: String(service.id), serviceName: service.name,
    title: rows.find(row => row.value !== '—')?.value || service.name, rows,
    objectIdField: oid, objectId: typeof oidValue === 'number' || typeof oidValue === 'string' ? oidValue : undefined,
    typeLabel: type ? fieldLabel(type) : undefined,
    typeValue: type?.name && feature.attributes?.[type.name] != null ? String(feature.attributes[type.name]) : undefined,
    category: category?.name && feature.attributes?.[category.name] != null ? { field: category.name, label: fieldLabel(category), value: String(feature.attributes[category.name]) } : undefined,
    location: featureLocation(feature, service.arcGisGeometryType || metadata.geometryType),
  }
}

/** 点击地图时，向可见的矢量 MapServer 查询光标处的要素及全部属性。 */
export async function identifyVectorFeatures(
  service: MapServiceItem,
  envelope: { west: number; south: number; east: number; north: number },
  definitionExpression = '1=1',
): Promise<IdentifiedMapFeature[]> {
  if (!Number.isFinite(Number(service.arcGisLayerId))) return []
  const url = serviceRoot(service.serviceUrl)
  const layerId = Number(service.arcGisLayerId)
  const parameters = new URLSearchParams({
    where: definitionExpression || '1=1',
    geometry: JSON.stringify({
      xmin: envelope.west,
      ymin: envelope.south,
      xmax: envelope.east,
      ymax: envelope.north,
      spatialReference: { wkid: 4326 },
    }),
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: '*',
    returnGeometry: 'true',
    outSR: '4326',
    resultRecordCount: '200',
  })
  const response = await queryAllFeatures(`${url}/${layerId}/query`, parameters)
  const metadata = await cachedLayerMetadata(url, layerId)
  return (response.features || []).map(feature => identifiedFeature(service, feature, metadata, response.fieldAliases))
}

function searchableFieldNames(metadata: ArcGisLayerMetadata) {
  const preferred = ['GCMC', 'XMMC', 'JYZTMC_1', 'DLMC', 'DKLX', 'DKLXMC', 'DKMC', 'DKBM', 'DCBH', '地类名称', '地块名称', '地块类型', '变化类']
  const fields = (metadata.fields || []).filter((field) => {
    const name = field.name || ''
    if (!name || field.type === 'esriFieldTypeGeometry') return false
    if (field.type === 'esriFieldTypeBlob' || field.type === 'esriFieldTypeRaster') return false
    return /^[\w\u4e00-\u9fff]+$/.test(name)
  })
  const seen = new Set<string>()
  return [...preferred.flatMap((name) => fields.filter((field) => field.name?.toUpperCase() === name.toUpperCase())), ...fields]
    .filter((field) => {
      const name = field.name || ''
      if (seen.has(name)) return false
      seen.add(name)
      return true
    })
}

/** 在矢量图层的文本字段里查找人名、地块名、类型名等属性内容。 */
export async function searchVectorLayerText(service: MapServiceItem, keyword: string): Promise<IdentifiedMapFeature[]> {
  const text = keyword.trim()
  if (text.length < 1 || !Number.isFinite(Number(service.arcGisLayerId))) return []
  const url = serviceRoot(service.serviceUrl)
  const layerId = Number(service.arcGisLayerId)
  const metadata = await cachedLayerMetadata(url, layerId)
  const fields = searchableFieldNames(metadata)
  if (!fields.length) return []
  const escaped = text.replace(/'/g, "''")
  const textFields = fields.filter(field => !field.type || ['esriFieldTypeString', 'esriFieldTypeGUID', 'esriFieldTypeGlobalID'].includes(field.type))
  const scalarFields = fields.filter(field => !textFields.includes(field))
  const searchScalars = /^[\d.eE+:/\sT-]+$/.test(text)
  const clauses = textFields.map(field => `${field.name} LIKE '%${escaped}%'`)
  if (searchScalars) clauses.push(...scalarFields.map(field => `CAST(${field.name} AS VARCHAR(255)) LIKE '%${escaped}%'`))
  if (!clauses.length) return []
  const parameters = new URLSearchParams({
    where: `(${clauses.join(' OR ')})`,
    outFields: '*',
    returnGeometry: 'true',
    outSR: '4326',
    resultRecordCount: '200',
  })
  let response: ArcGisQueryResponse
  try {
    response = await queryAllFeatures(`${url}/${layerId}/query`, parameters)
  } catch {
    // Older databases cannot CAST every numeric/date field. Scan complete attributes
    // when an expression is unsupported, using ID batching rather than dropping fields.
    parameters.set('where', '1=1')
    response = await queryAllFeatures(`${url}/${layerId}/query`, parameters)
  }
  return (response.features || []).flatMap(feature => {
    const result = identifiedFeature(service, feature, metadata, response.fieldAliases)
    const matched = result.rows.find(row => row.value.toLowerCase().includes(text.toLowerCase()))
    if (!matched) return []
    return [{ ...result, title: matched.value, matchLabel: matched.label, matchFieldName: matched.name }]
  })
}
