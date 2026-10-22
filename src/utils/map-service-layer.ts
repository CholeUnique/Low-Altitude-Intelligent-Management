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
  spatialReference?: ArcGisSpatialReference
  fullExtent?: ArcGisExtent
  initialExtent?: ArcGisExtent
  extent?: ArcGisExtent
  singleFusedMapCache?: boolean
  minLOD?: number
  maxLOD?: number
  tileInfo?: {
    rows?: number
    cols?: number
    origin?: { x?: number; y?: number }
    spatialReference?: ArcGisSpatialReference
    lods?: Array<{ level?: number; resolution?: number }>
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
  setRenderer?: (renderer: Record<string, unknown>) => void
  setQueryFilter?: (expression: string) => void
}

export interface MapServiceLayerOptions {
  /** 无已配置范围时的业务请求边界，不作为服务发布范围返回。 */
  fallbackRequestBounds?: L.LatLngBounds
  /** 图层的准确业务覆盖范围；优先用于限制缓存瓦片请求。 */
  boundsOverride?: L.LatLngBounds
}

/** 行政边界使用真实服务几何，在地图上绘制双层描边，不依赖影像导出的样式。 */
export async function createAdministrativeBoundaryLayer(service: MapServiceItem, color = '#9AEEFE'): Promise<MapServiceLayerHandle> {
  const url = serviceRoot(service.serviceUrl)
  const layerId = Number(service.arcGisLayerId)
  const response = await queryAllFeatures(servicePath(url, `${layerId}/query`), new URLSearchParams({
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

interface ServiceRemarkConfig extends MapServiceLayerOptions {
  bounds?: L.LatLngBounds
  minZoom?: number
  maxZoom?: number
  tileWkid?: number
}

let jsonpSequence = 0
const tileMapMetadataCache = new Map<string, Promise<ServiceRemarkConfig>>()

function serviceRoot(serviceUrl: string) {
  return serviceUrl.trim().replace(/\/+$/, '')
}

/** 子路径必须插入到查询参数之前，避免 token/devAPIKey 被拼进路径。 */
function servicePath(url: string, path: string) {
  const [address = ''] = url.split('#', 1)
  const queryIndex = address.indexOf('?')
  const base = queryIndex < 0 ? address : address.slice(0, queryIndex)
  const query = queryIndex < 0 ? '' : address.slice(queryIndex)
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}${query}`
}

function serviceParameters(url: string, parameters: URLSearchParams, omit: string[] = []) {
  const [address = ''] = url.split('#', 1)
  const queryIndex = address.indexOf('?')
  const base = queryIndex < 0 ? address : address.slice(0, queryIndex)
  const query = new URLSearchParams(queryIndex < 0 ? '' : address.slice(queryIndex + 1))
  omit.forEach((key) => query.delete(key))
  parameters.forEach((value, key) => query.set(key, value))
  return `${base}?${query.toString()}`
}

function isTileRequestUrl(url: string) {
  return /\/arcgis\/tile\/tile(?:[/?#]|$)/i.test(url)
}

/** 泰州转发入口不是 MapServer：按提供方示例补齐 /tile/层级/行/列。 */
function taizhouForwarderTemplate(url: string) {
  let parsed: URL
  try { parsed = new URL(url) } catch { return }
  if (parsed.hostname !== 'jiangsu.tianditu.gov.cn') return
  const pathname = parsed.pathname.replace(/%7B/gi, '{').replace(/%7D/gi, '}')
  const match = pathname.match(/^(\/taizhou\/forwarder\/services\/[^/]+\/arcgis\/tile)(?:\/tile(?:\/(?:\d+|\{z\})\/(?:\d+|\{y\})\/(?:\d+|\{x\}))?)?\/?$/i)
  if (!match) return
  parsed.searchParams.delete('f')
  parsed.searchParams.delete('callback')
  const query = parsed.searchParams.toString()
  return `${parsed.origin}${match[1]}/tile/{z}/{y}/{x}${query ? `?${query}` : ''}`
}

function invalidMetadataError(url: string) {
  return new Error(isTileRequestUrl(url)
    ? '当前地址是瓦片接口，未返回 ArcGIS 元数据；请配置带 {z}/{x}/{y} 参数的完整瓦片地址或有效的 MapServer 服务地址'
    : '地图服务未返回有效的 JSON 数据，请检查服务地址和访问授权')
}

function serviceResponseError(status: number) {
  if ([401, 403, 498, 499].includes(status)) {
    return new Error(`地图服务拒绝访问（${status}），请检查密钥、服务授权及允许访问的来源`)
  }
  return new Error(`地图服务请求失败（${status}）`)
}

function validateArcGisPayload<T extends object>(payload: unknown, url: string): T {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw invalidMetadataError(url)
  const data = payload as { error?: { code?: number } | string; status?: number; code?: string | number }
  const code = Number(typeof data.error === 'object' ? data.error?.code : data.status ?? data.code)
  if (data.error || [401, 403, 498, 499].includes(code) || Number(data.status) >= 400) {
    throw Number.isFinite(code) && code > 0 ? serviceResponseError(code) : new Error('地图服务返回错误，请检查服务地址和访问授权')
  }
  return payload as T
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

function loadArcGisJsonp<T extends object>(url: string) {
  const callbackName = `__mapServiceMetadata_${Date.now()}_${++jsonpSequence}`
  return new Promise<T>((resolve, reject) => {
    const script = document.createElement('script')
    const callbacks = window as unknown as Record<string, (payload: unknown) => void>
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
      try {
        finish(validateArcGisPayload<T>(payload, url))
      } catch (error) {
        finish(undefined, error instanceof Error ? error : invalidMetadataError(url))
      }
    }
    script.onerror = () => finish(undefined, new Error('无法访问地图服务元数据'))
    timeoutId = window.setTimeout(() => finish(undefined, new Error('读取地图服务元数据超时')), 10000)
    const parameters = new URLSearchParams({ f: 'json', callback: callbackName })
    script.src = serviceParameters(url, parameters)
    document.head.appendChild(script)
  })
}

async function loadArcGisJson<T extends object>(url: string): Promise<T> {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), 8000)
  let response: Response
  try {
    // 泰州等转发服务允许 CORS，但不一定支持 callback，且可能用 text/plain 返回 JSON。
    response = await fetch(serviceParameters(url, new URLSearchParams({ f: 'json' }), ['callback']), { signal: controller.signal })
  } catch (error) {
    window.clearTimeout(timeoutId)
    if (controller.signal.aborted) throw new Error('读取地图服务数据超时，请稍后重试')
    if (error instanceof TypeError) return loadArcGisJsonp<T>(url)
    throw error
  }
  try {
    if (!response.ok) throw serviceResponseError(response.status)
    const text = await response.text()
    let payload: unknown
    try {
      payload = JSON.parse(text)
    } catch {
      throw invalidMetadataError(url)
    }
    return validateArcGisPayload<T>(payload, url)
  } catch (error) {
    if (controller.signal.aborted) throw new Error('读取地图服务数据超时，请稍后重试')
    throw error
  } finally {
    window.clearTimeout(timeoutId)
  }
}

async function loadArcGisMetadata(url: string) {
  const metadata = await loadArcGisJson<ArcGisMapServiceMetadata>(url)
  if (!metadata.tileInfo && !Array.isArray(metadata.layers) && !metadata.fullExtent && !metadata.initialExtent && !metadata.extent) {
    throw invalidMetadataError(url)
  }
  return metadata
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
  boundsOverride?: L.LatLngBounds,
) {
  if (boundsOverride?.isValid()) return boundsOverride
  const serviceBounds = extentBounds(metadata.fullExtent) || extentBounds(metadata.initialExtent) || extentBounds(metadata.extent)
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
    const rawBounds = record.bounds ?? record.fullExtent ?? record.extent ?? record.initialExtent ?? record
    const tileInfo = record.tileInfo as { lods?: Array<{ level?: unknown }>; spatialReference?: ArcGisSpatialReference } | undefined
    const levels = (Array.isArray(tileInfo?.lods) ? tileInfo.lods : [])
      .flatMap((lod) => lod.level == null ? [] : [finiteNumber(lod.level)])
      .filter((level): level is number => level !== undefined && Number.isInteger(level) && level >= 0)
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
      minZoom: finiteNumber(record.minZoom) ?? (levels.length ? Math.min(...levels) : undefined),
      maxZoom: finiteNumber(record.maxZoom) ?? (levels.length ? Math.max(...levels) : undefined),
      tileWkid: finiteNumber(record.tileWkid) ?? tileInfo?.spatialReference?.latestWkid ?? tileInfo?.spatialReference?.wkid,
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

interface RenderConsumer { resolve: (blob: Blob) => void; reject: (reason: Error) => void; cleanup: () => void }
interface RenderJob { key: string; url: string; parameters: URLSearchParams; controller: AbortController; started: boolean; consumers: Map<symbol, RenderConsumer> }
const renderJobs = new Map<string, RenderJob>()
const renderQueue: RenderJob[] = []
const renderCache = new Map<string, { blob: Blob; expires: number }>()
let activeRenders = 0, renderCacheBytes = 0
function drainRenderQueue() {
  while (activeRenders < 6 && renderQueue.length) {
    const job = renderQueue.shift()!
    if (!job.consumers.size || job.controller.signal.aborted) continue
    job.started = true; activeRenders++
    void fetch(job.url, {method:'POST',body:job.parameters,signal:job.controller.signal})
      .then(async response => {
        if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) throw new Error('地图渲染请求失败')
        const blob = await response.blob()
        if (job.controller.signal.aborted) return
        if (blob.size <= 4 * 1024 * 1024) {
          const previous = renderCache.get(job.key)
          if (previous) renderCacheBytes -= previous.blob.size
          renderCache.delete(job.key)
          renderCache.set(job.key, {blob,expires:Date.now()+180_000}); renderCacheBytes += blob.size
          while (renderCacheBytes > 32 * 1024 * 1024 || renderCache.size > 96) {
            const key = renderCache.keys().next().value!
            renderCacheBytes -= renderCache.get(key)!.blob.size; renderCache.delete(key)
          }
        }
        if (renderJobs.get(job.key) === job) renderJobs.delete(job.key)
        job.consumers.forEach(consumer => { consumer.cleanup(); consumer.resolve(blob) })
      })
      .catch(reason => {
        if (renderJobs.get(job.key) === job) renderJobs.delete(job.key)
        job.consumers.forEach(consumer => { consumer.cleanup(); consumer.reject(reason) })
      })
      .finally(() => {
        job.consumers.clear()
        if (renderJobs.get(job.key) === job) renderJobs.delete(job.key)
        activeRenders--; drainRenderQueue()
      })
  }
}
/** 动态导出 POST 不能依赖普通图片的 HTTP 缓存；共用有限队列、请求去重及有界内存缓存。 */
export function loadMapRenderImage(url: string, parameters: URLSearchParams, signal: AbortSignal): Promise<Blob> {
  if (signal.aborted) return Promise.reject(new DOMException('已取消地图渲染', 'AbortError'))
  const semantic = new URLSearchParams(parameters)
  semantic.delete('_filterRevision') // renderer / definitionExpression 已完整包含实际样式与筛选。
  const key = `${url}?${semantic}`
  const cached = renderCache.get(key)
  if (cached && cached.expires > Date.now()) {
    renderCache.delete(key); renderCache.set(key,cached)
    return Promise.resolve(cached.blob)
  }
  if (cached) { renderCacheBytes -= cached.blob.size; renderCache.delete(key) }
  let job = renderJobs.get(key)
  if (!job) {
    job = {key,url,parameters:new URLSearchParams(parameters),controller:new AbortController(),started:false,consumers:new Map()}
    renderJobs.set(key,job); renderQueue.push(job)
  }
  const shared = job
  return new Promise<Blob>((resolve,reject) => {
    const id = Symbol()
    const cancel = () => {
      shared.consumers.delete(id); signal.removeEventListener('abort',cancel)
      reject(new DOMException('已取消地图渲染', 'AbortError'))
      if (!shared.consumers.size) {
        shared.controller.abort()
        if (renderJobs.get(key) === shared) renderJobs.delete(key)
        if (!shared.started) { const index = renderQueue.indexOf(shared); if (index >= 0) renderQueue.splice(index,1) }
      }
    }
    shared.consumers.set(id,{resolve,reject,cleanup:()=>signal.removeEventListener('abort',cancel)})
    signal.addEventListener('abort',cancel,{once:true})
    queueMicrotask(drainRenderQueue)
  })
}

class ArcGisExportLayer extends L.GridLayer {
  declare options: L.GridLayerOptions
  private standardRenderer?: Record<string, unknown>
  private definitionExpression = '1=1'
  private filterRevision = 0
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
      // 动态导出用较大的瓦片，减少每个矢量图层的服务端渲染次数。
      tileSize: 512,
      noWrap: true,
      keepBuffer: 2,
      updateWhenIdle: true,
      // Transparent vector tiles from two zoom levels must not be painted together.
      updateWhenZooming: false,
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
    if (this.standardRenderer) return this.standardRenderer
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
    if (this.vectorLayerId !== undefined) {
      this.on('loading', this.retainPreviousLevel, this)
      this.on('load', this.commitReadyLevel, this)
    }
    super.onAdd(map)
    return this
  }

  override onRemove(map: L.Map) {
    this.renderRequests.forEach(controller => controller.abort())
    this.renderRequests.clear()
    if (this.vectorLayerId !== undefined) {
      this.off('loading', this.retainPreviousLevel, this)
      this.off('load', this.commitReadyLevel, this)
    }
    super.onRemove(map)
    return this
  }

  private retainPreviousLevel() {
    // 旧级别继续使用 Leaflet 的地理缩放变换；只隐藏未完成的新级别。
    const state = this as unknown as { _levels: Record<string, { el: HTMLElement }>; _tileZoom: number }
    const levels = Object.entries(state._levels || {})
    if (levels.some(([zoom, level]) => Number(zoom) !== state._tileZoom && level.el.style.opacity !== '0')) {
      const current = state._levels[state._tileZoom]
      if (current) current.el.style.opacity = '0'
    }
  }

  private commitReadyLevel() {
    if (this.isLoading()) return
    const state = this as unknown as { _levels: Record<string, { el: HTMLElement }>; _tileZoom: number; _tiles: Record<string, { coords: L.Coords; el: HTMLElement; loaded?: number; active: boolean }> }
    // 整级原子切换时，取消单张瓦片的淡入，避免旧级别已隐藏、新级别仍透明。
    Object.values(state._tiles || {}).forEach(tile => {
      if (tile.coords.z === state._tileZoom && tile.loaded) { tile.el.style.opacity = '1'; tile.active = true }
    })
    Object.entries(state._levels || {}).forEach(([zoom, level]) => {
      level.el.style.opacity = Number(zoom) === state._tileZoom ? '1' : '0'
    })
    this._pruneTiles()
  }

  _pruneTiles() {
    // Leaflet 默认逐张淘汰父瓦片；整级替换完成前必须保留旧级别，否则仍会闪空。
    const state = this as unknown as { _levels?: Record<string, { el: HTMLElement }>; _tileZoom: number }
    if (this.vectorLayerId !== undefined && this.isLoading()
      && Object.entries(state._levels || {}).some(([zoom, level]) => Number(zoom) !== state._tileZoom && level.el.style.opacity !== '0')) return
    ;(L.GridLayer.prototype as unknown as { _pruneTiles: () => void })._pruneTiles.call(this)
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
    const endpoint = servicePath(this.url, this.imageServer ? 'exportImage' : 'export')
    // 所有动态导出共享并发与缓存；长分类符号同时避开 GET URL 长度限制。
    const controller = new AbortController()
    this.renderRequests.set(tile, controller)
    void loadMapRenderImage(endpoint, parameters, controller.signal)
      .then(blob => {
        if (!controller.signal.aborted) tile.src = URL.createObjectURL(blob)
      })
      .catch(reason => {
        if (controller.signal.aborted) return
        // 兼容仅允许图片直读、不允许 CORS 的旧服务；短请求仍可直接显示。
        if (reason instanceof TypeError && parameters.toString().length <= 1800) tile.src = serviceParameters(endpoint, parameters)
        else tile.onerror?.(new Event('error'))
      })
      .finally(() => this.renderRequests.delete(tile))
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
    layer.options.bounds = this.options.bounds
    layer.definitionExpression = expression
    layer.polygonFillAlpha = this.polygonFillAlpha
    layer.strokeColor = [...this.strokeColor]
    layer.fillColor = [...this.fillColor]
    layer.categoryFieldName = this.categoryFieldName
    layer.categoryEntries = this.categoryEntries.map((entry) => ({ ...entry }))
    layer.filterRevision = this.filterRevision + 1
    layer.standardRenderer = this.standardRenderer
    return layer
  }

  setStandardRenderer(renderer: Record<string, unknown>) {
    this.standardRenderer = renderer
    this.filterRevision += 1
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
        const response = await queryAllFeatures(servicePath(this.serviceUrl, `${this.layerId}/query`), parameters)
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

  setStandardRenderer(renderer: Record<string, unknown>) {
    if (!(this.imageLayer instanceof ArcGisExportLayer)) return
    this.imageLayer.setStandardRenderer(renderer)
    if (this._map) this.setDefinitionExpression(this.definitionExpression, true)
  }

  setDefinitionExpression(expression: string, force = false) {
    if (!force && expression === this.definitionExpression) return
    this.definitionExpression = expression
    const swapSequence = ++this.filterSwapSequence
    if (this.pendingImageLayer) {
      // 不可 off() 清空全部事件：Leaflet 的 remove 监听器负责解绑地图事件。
      // 清空后旧层仍收到 zoom/viewreset，_map 已为空，异常会打断其他图层更新。
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
    serviceParameters(servicePath(serviceUrl, `${layerId}/query`), parameters),
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
    serviceParameters(servicePath(serviceUrl, `${layerId}/query`), idParameters),
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
        serviceParameters(servicePath(serviceUrl, `${layerId}/query`), parameters),
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
      serviceParameters(servicePath(serviceUrl, `${layerId}/query`), parameters),
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
    serviceParameters(servicePath(serviceUrl, `${layerId}/query`), idParameters),
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
        serviceParameters(servicePath(serviceUrl, `${layerId}/query`), parameters),
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
      serviceParameters(servicePath(serviceUrl, `${layerId}/query`), parameters),
    ))
  }

  return {
    values: [...valueSet].sort((left, right) => left.localeCompare(right, 'zh-CN')),
    hasEmptyValue,
  }
}

function geographicTileSamples(coords: { x: number; y: number; z: number }, tileSize = 256) {
  const worldSize = tileSize * 2 ** coords.z
  const sourceY = (pixelY: number) => {
    const latitude = Math.atan(Math.sinh(Math.PI * (1 - 2 * pixelY / worldSize))) * 180 / Math.PI
    return (90 - latitude) / 360 * worldSize
  }
  const samples = Array.from({ length: tileSize }, (_, row) => ({
    top: sourceY(coords.y * tileSize + row),
    bottom: sourceY(coords.y * tileSize + row + 1),
  }))
  const firstRow = Math.floor(samples[0]!.top / tileSize)
  const lastRow = Math.floor((samples[tileSize - 1]!.bottom - 1e-8) / tileSize)
  return { samples, rows: Array.from({ length: lastRow - firstRow + 1 }, (_, index) => firstRow + index) }
}

interface GeographicTileRequest {
  promise: Promise<HTMLImageElement | undefined>
  cancel: () => void
  start: () => void
  started: boolean
  consumers: Map<HTMLElement, L.Coords>
}

/** 经纬度缓存的行号不能当作墨卡托行号使用；将源瓦片逐行投影到现有地图。 */
class TaizhouGeographicTileLayer extends L.GridLayer {
  private images = new Map<string, HTMLImageElement>()
  private missingTiles = new Map<string, number>()
  private requests = new Map<string, GeographicTileRequest>()
  private tileSources = new WeakMap<HTMLElement, Set<string>>()
  protected renderedTiles = new Map<string, HTMLCanvasElement>()
  private projectionPlans = new Map<string, ReturnType<typeof geographicTileSamples>>()
  private activeRequests = 0
  private drainScheduled = false
  private stopping = false
  protected unloadedTiles = new WeakSet<HTMLElement>()
  protected coverageBounds?: L.LatLngBounds
  protected tileLabel = '泰州天地图'

  constructor(private readonly template: string, config: ServiceRemarkConfig) {
    super({
      pane: MAP_SERVICE_IMAGERY_PANE,
      tileSize: 256,
      bounds: config.bounds ?? config.fallbackRequestBounds,
      minZoom: config.minZoom ?? 0,
      minNativeZoom: config.minZoom ?? 1,
      maxNativeZoom: config.maxZoom ?? 18,
      maxZoom: config.maxZoom ?? 22,
      noWrap: true,
      keepBuffer: 1,
      updateWhenIdle: true,
      updateWhenZooming: false,
    })
    this.coverageBounds = config.bounds ?? config.fallbackRequestBounds
    this.on('tileunload', (event: L.TileEvent) => {
      this.unloadedTiles.add(event.tile)
      this.releaseSources(event.tile)
    })
  }

  protected releaseSources(tile: HTMLElement) {
    for (const key of this.tileSources.get(tile) || []) {
      const request = this.requests.get(key)
      if (!request) continue
      request.consumers.delete(tile)
      if (!request.consumers.size) request.cancel()
    }
    this.tileSources.delete(tile)
  }

  private scheduleRequests() {
    if (this.drainScheduled || this.stopping) return
    this.drainScheduled = true
    queueMicrotask(() => {
      this.drainScheduled = false
      if (this.stopping || !this._map) return
      const map = this._map
      const center = typeof map.getCenter === 'function' ? map.getCenter() : undefined
      const priority = (request: GeographicTileRequest) => Math.min(...[...request.consumers.values()].map(coords => {
        if (!center) return 0
        const point = map.project(center, coords.z)
        return (coords.x + 0.5 - point.x / 256) ** 2 + (coords.y + 0.5 - point.y / 256) ** 2
      }))
      // 每轮按最新视角重新排序；共享源瓦片仍被其他画布使用时不能取消。
      const queued = [...this.requests.values()].filter(request => !request.started && request.consumers.size)
      queued.sort((a, b) => priority(a) - priority(b))
      for (const request of queued) {
        if (this.activeRequests >= 6) break
        request.started = true
        this.activeRequests += 1
        request.start()
      }
    })
  }

  protected sourceTileIntersects(level: string | number, row: number, column: number) {
    if (this.coverageBounds) {
      const span = 360 / 2 ** Number(level)
      const west = column * span - 180
      const north = 90 - row * span
      if (west >= this.coverageBounds.getEast() || west + span <= this.coverageBounds.getWest()
        || north <= this.coverageBounds.getSouth() || north - span >= this.coverageBounds.getNorth()) return false
    }
    return true
  }

  protected tileUrl(level: string | number, row: number, column: number) {
    return this.template.replace('{z}', String(level)).replace('{y}', String(row)).replace('{x}', String(column))
  }

  protected sourceImage(level: string | number, row: number, column: number, tile: HTMLElement, coords: L.Coords): Promise<HTMLImageElement | undefined> {
    if (!this.sourceTileIntersects(level, row, column)) return Promise.resolve(undefined)
    const key = `${level}/${row}/${column}`
    const missingUntil = this.missingTiles.get(key)
    if (missingUntil && missingUntil > Date.now()) return Promise.resolve(undefined)
    this.missingTiles.delete(key)
    const cached = this.images.get(key)
    if (cached) {
      this.images.delete(key)
      this.images.set(key, cached)
      return Promise.resolve(cached)
    }
    const sources = this.tileSources.get(tile) || new Set<string>()
    sources.add(key)
    this.tileSources.set(tile, sources)
    const pending = this.requests.get(key)
    if (pending) {
      pending.consumers.set(tile, coords)
      return pending.promise
    }
    const image = new Image()
    const controller = new AbortController()
    let objectUrl = ''
    let settled = false
    let cancel = () => {}
    let useDirectImage = () => {}
    let showFetchedImage = (_blob: Blob) => {}
    let finishMissing = () => {}
    let finishError = (_error: Error) => {}
    let start = () => {}
    const url = this.tileUrl(level, row, column)
    const promise = new Promise<HTMLImageElement | undefined>((resolve, reject) => {
      let timeout: number | undefined
      const finish = (error?: Error, missing = false, cancelled = false) => {
        if (settled) return
        settled = true
        window.clearTimeout(timeout)
        controller.abort()
        image.onload = null
        image.onerror = null
        if (objectUrl) URL.revokeObjectURL(objectUrl)
        if (this.requests.get(key)?.started) this.activeRequests -= 1
        this.requests.delete(key)
        this.scheduleRequests()
        if (cancelled) {
          image.src = ''
          resolve(undefined)
          return
        }
        if (error) {
          image.src = ''
          reject(error)
          return
        }
        if (missing) {
          // 只缓存已经确认不存在的瓦片，不把授权拒绝、断网或超时缓存成空白。
          this.missingTiles.set(key, Date.now() + 180000)
          while (this.missingTiles.size > 1024) this.missingTiles.delete(this.missingTiles.keys().next().value!)
          resolve(undefined)
          return
        }
        this.images.set(key, image)
        while (this.images.size > 64) this.images.delete(this.images.keys().next().value!)
        resolve(image)
      }
      cancel = () => finish(undefined, false, true)
      finishMissing = () => finish(undefined, true)
      finishError = error => finish(error)
      image.onload = () => finish()
      image.onerror = () => finish(new Error(`${this.tileLabel}返回内容无法显示为图片`))
      showFetchedImage = blob => {
        if (settled) return
        objectUrl = URL.createObjectURL(blob)
        image.src = objectUrl
      }
      useDirectImage = () => {
        if (settled) return
        image.onerror = () => finish(new Error(`${this.tileLabel}瓦片读取失败，网络或跨域限制使浏览器无法确认状态`))
        image.src = url
      }
      start = () => {
        // 等待并发槽位不计入网络超时。
        timeout = window.setTimeout(() => finish(new Error(`${this.tileLabel}瓦片读取超时`)), 15000)
        void (async () => {
          let response: Response
          try {
            response = await fetch(url, { signal: controller.signal })
          } catch (error) {
            if (settled) return
            if (error instanceof TypeError) { useDirectImage(); return }
            finishError(error instanceof Error ? error : new Error(`${this.tileLabel}瓦片请求失败`))
            return
          }
          if (settled) return
          if (response.status === 404 || response.status === 204) { finishMissing(); return }
          if (!response.ok) { finishError(serviceResponseError(response.status)); return }
          const blob = await response.blob()
          showFetchedImage(blob)
        })().catch(error => { if (!settled) finishError(error instanceof Error ? error : new Error('地图瓦片加载失败')) })
      }
    })
    this.requests.set(key, { promise, cancel, start, started: false, consumers: new Map([[tile, coords]]) })
    // 先读取 HTTP 状态区分正常的范围外空白和真正的访问失败；旧服务不允许 CORS 时保留图片直连。
    this.scheduleRequests()
    return promise
  }

  override createTile(coords: L.Coords, done: L.DoneCallback) {
    const tile = document.createElement('canvas')
    tile.width = tile.height = 256
    const context = tile.getContext('2d')
    if (!context) {
      queueMicrotask(() => done(new Error('浏览器无法绘制地图瓦片'), tile))
      return tile
    }
    const renderKey = `${coords.z}/${coords.x}/${coords.y}`
    const rendered = this.renderedTiles.get(renderKey)
    if (rendered) {
      this.renderedTiles.delete(renderKey)
      this.renderedTiles.set(renderKey, rendered)
      context.drawImage(rendered, 0, 0)
      queueMicrotask(() => { if (!this.unloadedTiles.has(tile) && this._map) done(undefined, tile) })
      return tile
    }
    const planKey = `${coords.z}/${coords.y}`
    const plan = this.projectionPlans.get(planKey) || geographicTileSamples(coords)
    this.projectionPlans.delete(planKey)
    this.projectionPlans.set(planKey, plan)
    while (this.projectionPlans.size > 64) this.projectionPlans.delete(this.projectionPlans.keys().next().value!)
    const { samples, rows } = plan
    void Promise.allSettled(rows.map(async row => ({ row, image: await this.sourceImage(coords.z, row, coords.x, tile, coords) })))
      .then(results => {
        if (this.unloadedTiles.has(tile) || !this._map) return
        let painted = false
        let failure: Error | undefined
        for (const result of results) {
          if (result.status === 'rejected') {
            failure ||= result.reason instanceof Error ? result.reason : new Error('地图瓦片加载失败')
            continue
          }
          const { row, image } = result.value
          if (!image) continue
          painted = true
          const imageWidth = image.naturalWidth || 256
          const imageHeight = image.naturalHeight || 256
          samples.forEach(({ top, bottom }, destinationRow) => {
            const start = Math.max(top, row * 256)
            const end = Math.min(bottom, (row + 1) * 256)
            if (end <= start) return
            context.drawImage(image,
              0, (start - row * 256) * imageHeight / 256, imageWidth, (end - start) * imageHeight / 256,
              0, destinationRow + (start - top) / (bottom - top), 256, (end - start) / (bottom - top))
          })
        }
        // 部分源瓦片有效时仍显示已绘制内容，避免一个缺块拖掉整张画布。
        if (failure && painted) this.fire('tileerror', { error: failure, tile, coords })
        // 只复用完整成功的重投影结果；空白、缺块及错误仍按源瓦片缓存规则重试。
        if (!failure && results.every(result => result.status === 'fulfilled' && result.value.image)) {
          this.renderedTiles.set(renderKey, tile)
          while (this.renderedTiles.size > 32) this.renderedTiles.delete(this.renderedTiles.keys().next().value!)
        }
        done(painted ? undefined : failure, tile)
      })
      .catch(error => {
        if (!this.unloadedTiles.has(tile) && this._map) done(error instanceof Error ? error : new Error('地图瓦片加载失败'), tile)
      })
      .finally(() => this.releaseSources(tile))
    return tile
  }

  override onAdd(map: L.Map) {
    this.stopping = false
    return super.onAdd(map)
  }

  override onRemove(map: L.Map) {
    this.stopping = true
    this.requests.forEach(request => request.cancel())
    this.requests.clear()
    this.images.clear()
    this.missingTiles.clear()
    this.renderedTiles.clear()
    this.projectionPlans.clear()
    return super.onRemove(map)
  }
}

interface TileMatrix {
  id: string
  resolution: number
  origin: [number, number]
  tileWidth: number
  tileHeight: number
  width?: number
  height?: number
  limits?: { minRow: number; maxRow: number; minCol: number; maxCol: number }
}

function projectionWkid(crs: string | number) {
  if (/CRS:?84$/i.test(String(crs))) return 4326
  const wkid = Number(String(crs).match(/(\d+)\/?$/)?.[1])
  const normalized = [102100, 102113, 900913].includes(wkid) ? 3857 : wkid
  if (![4326, 4490, 3857, 4528, 4549].includes(normalized)) throw new Error(`暂不支持地图服务坐标系：${crs}`)
  return normalized
}

function projectCoordinate(lng: number, lat: number, wkid: number): [number, number] {
  if ([4326, 4490].includes(wkid)) return [lng, lat]
  if (wkid === 3857) return [lng * 20037508.342789244 / 180, Math.log(Math.tan(Math.PI / 4 + Math.max(-85.05112878, Math.min(85.05112878, lat)) * Math.PI / 360)) * 6378137]
  return proj4('EPSG:4326', `EPSG:${wkid}`, [lng, lat]) as [number, number]
}

function unprojectCoordinate(x: number, y: number, wkid: number): [number, number] {
  if ([4326, 4490].includes(wkid)) return [x, y]
  if (wkid === 3857) return [x * 180 / 20037508.342789244, Math.atan(Math.sinh(y / 6378137)) * 180 / Math.PI]
  return proj4(`EPSG:${wkid}`, 'EPSG:4326', [x, y]) as [number, number]
}

function mapPixelCoordinate(coords: L.Coords, x: number, y: number): [number, number] {
  const world = 256 * 2 ** coords.z
  return [(coords.x * 256 + x) / world * 360 - 180, Math.atan(Math.sinh(Math.PI * (1 - 2 * (coords.y * 256 + y) / world))) * 180 / Math.PI]
}

/** 根据真实矩阵重投影，复用现有的限流、取消、图片及画布缓存。 */
class MatrixTileLayer extends TaizhouGeographicTileLayer {
  protected override tileLabel = '地图服务'
  private byId: Map<string, TileMatrix>

  constructor(private matrices: TileMatrix[], private wkid: number, private address: (matrix: string, row: number, col: number) => string, config: ServiceRemarkConfig) {
    const largest = Math.max(...matrices.map(matrix => matrix.resolution))
    const metresPerUnit = [4326, 4490].includes(wkid) ? 111319.49079327358 : 1
    // 不在只有高精度缓存的服务上缩到全国后请求成千上万张源瓦片。
    const minZoom = Math.max(0, Math.floor(Math.log2(156543.03392804097 / (largest * metresPerUnit))) - 1)
    super('', { ...config, minZoom, maxZoom: 22 })
    const options = this.options as L.GridLayerOptions
    options.minNativeZoom = undefined
    options.maxNativeZoom = undefined
    this.byId = new Map(matrices.map(matrix => [matrix.id, matrix]))
  }

  protected override tileUrl(level: string | number, row: number, col: number) {
    return this.address(String(level), row, col)
  }

  protected override sourceTileIntersects(level: string | number, row: number, col: number) {
    const matrix = this.byId.get(String(level))
    if (!matrix || row < 0 || col < 0 || (matrix.width !== undefined && col >= matrix.width) || (matrix.height !== undefined && row >= matrix.height)) return false
    const limits = matrix.limits
    if (limits && (row < limits.minRow || row > limits.maxRow || col < limits.minCol || col > limits.maxCol)) return false
    if (!this.coverageBounds) return true
    const corners = [0, .5, 1].flatMap(dx => [0, .5, 1].map(dy => unprojectCoordinate(
      matrix.origin[0] + (col + dx) * matrix.tileWidth * matrix.resolution,
      matrix.origin[1] - (row + dy) * matrix.tileHeight * matrix.resolution, this.wkid)))
    const west = Math.min(...corners.map(p => p[0]))
    const east = Math.max(...corners.map(p => p[0]))
    const south = Math.min(...corners.map(p => p[1]))
    const north = Math.max(...corners.map(p => p[1]))
    // ArcGIS fullExtent 是矩形包络；只用“有一点相交”会在影像边缘把
    // 实际覆盖范围之外的边缘瓦片也发出去。以瓦片中心作为覆盖判定，
    // 过滤纯粹由矩形边缘重叠造成的请求；局部空洞返回的 404 则作为空白瓦片。
    const centerLng = (west + east) / 2
    const centerLat = (south + north) / 2
    return centerLng >= this.coverageBounds.getWest() && centerLng <= this.coverageBounds.getEast()
      && centerLat >= this.coverageBounds.getSouth() && centerLat <= this.coverageBounds.getNorth()
  }

  private plan(coords: L.Coords) {
    const project = (x: number, y: number) => projectCoordinate(...mapPixelCoordinate(coords, x, y), this.wkid)
    const center = project(128, 128), right = project(129, 128), bottom = project(128, 129)
    const desired = Math.max(Math.hypot(right[0] - center[0], right[1] - center[1]), Math.hypot(bottom[0] - center[0], bottom[1] - center[1]))
    const matrix = this.matrices.reduce((best, item) => Math.abs(Math.log(item.resolution / desired)) < Math.abs(Math.log(best.resolution / desired)) ? item : best)
    const points = Array.from({ length: 17 }, (_, y) => Array.from({ length: 17 }, (_, x) => {
      const point = project(x * 16, y * 16)
      return [(point[0] - matrix.origin[0]) / matrix.resolution, (matrix.origin[1] - point[1]) / matrix.resolution] as [number, number]
    }))
    const tiles = new Map<string, { row: number; col: number }>()
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const corners = [points[y]![x]!, points[y]![x + 1]!, points[y + 1]![x]!, points[y + 1]![x + 1]!]
      if (!corners.flat().every(Number.isFinite)) throw new Error('切片坐标转换失败，请检查坐标系及切片矩阵')
      const minCol = Math.floor(Math.min(...corners.map(p => p[0])) / matrix.tileWidth)
      const maxCol = Math.floor((Math.max(...corners.map(p => p[0])) - 1e-7) / matrix.tileWidth)
      const minRow = Math.floor(Math.min(...corners.map(p => p[1])) / matrix.tileHeight)
      const maxRow = Math.floor((Math.max(...corners.map(p => p[1])) - 1e-7) / matrix.tileHeight)
      if ((maxCol - minCol + 1) * (maxRow - minRow + 1) > 64) throw new Error('当前比例尺超出切片矩阵可用范围')
      for (let row = minRow; row <= maxRow; row++) for (let col = minCol; col <= maxCol; col++) {
        if (this.sourceTileIntersects(matrix.id, row, col)) tiles.set(`${row}/${col}`, { row, col })
      }
      if (tiles.size > 64) throw new Error('当前比例尺超出切片矩阵可用范围')
    }
    return { matrix, points, tiles: [...tiles.values()] }
  }

  override createTile(coords: L.Coords, done: L.DoneCallback) {
    const tile = document.createElement('canvas')
    tile.width = tile.height = 256
    const context = tile.getContext('2d'), key = `${coords.z}/${coords.x}/${coords.y}`
    if (!context) { queueMicrotask(() => done(new Error('浏览器无法绘制地图瓦片'), tile)); return tile }
    const cached = this.renderedTiles.get(key)
    if (cached) {
      this.renderedTiles.delete(key); this.renderedTiles.set(key, cached)
      context.drawImage(cached, 0, 0)
      queueMicrotask(() => { if (this._map && !this.unloadedTiles.has(tile)) done(undefined, tile) })
      return tile
    }
    void Promise.resolve().then(async () => {
      if (!this._map || this.unloadedTiles.has(tile)) return
      const { matrix, points, tiles } = this.plan(coords)
      const results = await Promise.allSettled(tiles.map(async source => ({ ...source, image: await this.sourceImage(matrix.id, source.row, source.col, tile, coords) })))
      if (!this._map || this.unloadedTiles.has(tile)) return
      let painted = false, failure: Error | undefined
      for (const result of results) {
        if (result.status === 'rejected') { failure ||= result.reason instanceof Error ? result.reason : new Error('地图瓦片读取失败'); continue }
        const { image, row, col } = result.value
        if (!image) continue
        painted = true
        for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
          const a = points[y]![x]!, b = points[y]![x + 1]!, c = points[y + 1]![x]!, d = points[y + 1]![x + 1]!
          drawTileTriangle(context, image, [a, b, c], [[x * 16, y * 16], [(x + 1) * 16, y * 16], [x * 16, (y + 1) * 16]], matrix, row, col)
          drawTileTriangle(context, image, [b, d, c], [[(x + 1) * 16, y * 16], [(x + 1) * 16, (y + 1) * 16], [x * 16, (y + 1) * 16]], matrix, row, col)
        }
      }
      if (failure && painted) this.fire('tileerror', { error: failure, tile, coords })
      if (painted && !failure && results.every(result => result.status === 'fulfilled' && result.value.image)) {
        this.renderedTiles.set(key, tile)
        while (this.renderedTiles.size > 32) this.renderedTiles.delete(this.renderedTiles.keys().next().value!)
      }
      done(painted ? undefined : failure, tile)
    }).catch(error => { if (this._map && !this.unloadedTiles.has(tile)) done(error instanceof Error ? error : new Error('地图瓦片绘制失败'), tile) })
      .finally(() => this.releaseSources(tile))
    return tile
  }
}

/** Keep the fast native Web Mercator renderer while filtering edge/cache-miss tiles. */
class CoverageAwareArcGisTileLayer extends L.TileLayer {
  constructor(
    private template: string,
    private coverageBounds: L.LatLngBounds | undefined,
    options: L.TileLayerOptions,
  ) {
    super(template, options)
  }

  _isValidTile(coords: L.Coords) {
    const internals = L.TileLayer.prototype as unknown as {
      _isValidTile: (this: L.TileLayer, tileCoords: L.Coords) => boolean
      _tileCoordsToBounds: (this: L.TileLayer, tileCoords: L.Coords) => L.LatLngBounds
    }
    if (!internals._isValidTile.call(this, coords)) return false
    if (!this.coverageBounds) return true
    return this.coverageBounds.contains(internals._tileCoordsToBounds.call(this, coords).getCenter())
  }

  override createTile(coords: L.Coords, done: L.DoneCallback) {
    const tile = document.createElement('canvas')
    const size = this.getTileSize()
    tile.width = size.x
    tile.height = size.y
    const context = tile.getContext('2d')
    if (!context) {
      queueMicrotask(() => done(new Error('浏览器无法绘制地图瓦片'), tile))
      return tile
    }
    const url = this.template.replace('{z}', String(coords.z)).replace('{y}', String(coords.y)).replace('{x}', String(coords.x))
    let completed = false
    const finish = (error?: Error) => {
      if (completed) return
      completed = true
      done(error, tile)
    }
    const image = new Image()
    let objectUrl = ''
    const draw = () => {
      try {
        context.drawImage(image, 0, 0, tile.width, tile.height)
        finish()
      } catch {
        finish(new Error('地图服务影像绘制失败'))
      } finally {
        if (objectUrl) URL.revokeObjectURL(objectUrl)
      }
    }
    image.onload = draw
    image.onerror = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      finish(new Error('地图服务瓦片读取失败，网络或跨域限制使浏览器无法显示'))
    }
    void fetch(url).then(async (response) => {
      if (completed) return
      // ArcGIS 缓存范围边界外、或影像覆盖空洞的 404 是透明空白，不是图层故障。
      if (response.status === 404 || response.status === 204) {
        finish()
        return
      }
      if (!response.ok) {
        finish(serviceResponseError(response.status))
        return
      }
      objectUrl = URL.createObjectURL(await response.blob())
      image.src = objectUrl
    }).catch((error) => {
      if (completed) return
      if (error instanceof TypeError) {
        // Preserve support for older ArcGIS hosts that do not permit CORS fetches.
        image.src = url
        return
      }
      finish(error instanceof Error ? error : new Error('地图瓦片请求失败'))
    })
    return tile
  }
}

function drawTileTriangle(context: CanvasRenderingContext2D, image: HTMLImageElement, source: [number, number][], destination: [number, number][], matrix: TileMatrix, row: number, col: number) {
  const [p, q, r] = source as [[number, number], [number, number], [number, number]]
  const [a, b, c] = destination as [[number, number], [number, number], [number, number]]
  const sx = col * matrix.tileWidth, sy = row * matrix.tileHeight
  if (Math.max(p[0], q[0], r[0]) <= sx || Math.min(p[0], q[0], r[0]) >= sx + matrix.tileWidth
    || Math.max(p[1], q[1], r[1]) <= sy || Math.min(p[1], q[1], r[1]) >= sy + matrix.tileHeight) return
  const ux = q[0] - p[0], uy = q[1] - p[1], vx = r[0] - p[0], vy = r[1] - p[1], det = ux * vy - uy * vx
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return
  const xx = ((b[0] - a[0]) * vy - (c[0] - a[0]) * uy) / det
  const xy = ((c[0] - a[0]) * ux - (b[0] - a[0]) * vx) / det
  const yx = ((b[1] - a[1]) * vy - (c[1] - a[1]) * uy) / det
  const yy = ((c[1] - a[1]) * ux - (b[1] - a[1]) * vx) / det
  context.save(); context.beginPath(); context.moveTo(...a); context.lineTo(...b); context.lineTo(...c); context.closePath(); context.clip()
  context.transform(xx, yx, xy, yy, a[0] - xx * p[0] - xy * p[1], a[1] - yx * p[0] - yy * p[1])
  context.drawImage(image, 0, 0, image.naturalWidth || matrix.tileWidth, image.naturalHeight || matrix.tileHeight, sx, sy, matrix.tileWidth, matrix.tileHeight)
  context.restore()
}

function createTaizhouForwarderLayer(template: string, config: ServiceRemarkConfig): MapServiceLayerHandle {
  // 提供方的 12/657/3412 示例符合经纬度矩阵；若提供墨卡托服务可用 tileWkid:3857 覆盖。
  const wkid = config.tileWkid ?? 4490
  if ([3857, 102100, 102113].includes(wkid)) return { layer: createTemplateLayer(template, false, config), bounds: config.bounds }
  if (![4326, 4490].includes(wkid)) throw new Error(`暂不支持该天地图切片坐标系：${wkid}`)
  return { layer: new TaizhouGeographicTileLayer(template, config), bounds: config.bounds }
}

function createTemplateLayer(url: string, tms = false, config: ServiceRemarkConfig = {}) {
  if (!hasTileTemplate(url)) throw new Error('瓦片服务地址缺少 {z}/{x}/{y} 模板参数')
  return L.tileLayer(url, {
    pane: MAP_SERVICE_IMAGERY_PANE,
    bounds: config.bounds ?? config.fallbackRequestBounds,
    tms,
    minNativeZoom: config.minZoom,
    maxNativeZoom: config.maxZoom,
    maxZoom: Math.max(config.maxZoom || 22, 22),
    noWrap: true,
    keepBuffer: 3,
  })
}

function ogcParameter(url: string, name: string) {
  try {
    const parameters = new URL(url, window.location?.href).searchParams
    for (const [key, value] of parameters) if (key.toUpperCase() === name.toUpperCase()) return value
  } catch { /* 单个无效地址不应阻断整个服务列表展开。 */ }
}

function ogcProtocol(service: MapServiceItem): 'WMS' | 'WMTS' | undefined {
  const type = normalizedType(service.type), url = service.serviceUrl
  const protocol = ogcParameter(url, 'SERVICE')?.toUpperCase()
  if (protocol === 'WMTS' || type.includes('WMTS') || /\/(?:wmts|WMTSServer)(?:[/?]|$)/i.test(url)) return 'WMTS'
  if (protocol === 'WMS' || type.includes('WMS') || /\/(?:wms|WMSServer)(?:[/?]|$)/i.test(url)) return 'WMS'
  if (type === 'GEOSERVER' && !protocol) return 'WMS'
}

const ogcControlParameters = new Set(['SERVICE', 'REQUEST', 'VERSION', 'LAYERS', 'LAYER', 'STYLES', 'STYLE', 'FORMAT', 'TRANSPARENT', 'SRS', 'CRS', 'BBOX', 'WIDTH', 'HEIGHT', 'TILEMATRIXSET', 'TILEMATRIX', 'TILEROW', 'TILECOL'])

function ogcBaseUrl(url: string) {
  const parsed = new URL(url, window.location?.href)
  for (const key of [...parsed.searchParams.keys()]) if (ogcControlParameters.has(key.toUpperCase())) parsed.searchParams.delete(key)
  parsed.hash = ''
  return parsed.toString()
}

function ogcRequestUrl(url: string, parameters: URLSearchParams) {
  const parsed = new URL(url), names = new Set([...parameters.keys()].map(key => key.toUpperCase()))
  for (const key of [...parsed.searchParams.keys()]) if (names.has(key.toUpperCase())) parsed.searchParams.delete(key)
  return serviceParameters(parsed.toString(), parameters)
}

function xmlChildren(node: Element | Document, name: string): Element[] {
  return [...node.children].filter(child => child.localName === name)
}

function xmlDescendants(node: Element | Document, name: string): Element[] {
  return [...node.getElementsByTagName('*')].filter(child => child.localName === name)
}

function xmlText(node: Element | Document, name: string) {
  return xmlChildren(node, name)[0]?.textContent?.trim() || ''
}

function xmlNumber(node: Element, name: string) {
  const text = xmlText(node, name)
  return text ? finiteNumber(text) : undefined
}

const ogcCapabilitiesCache = new Map<string, { expires: number; request: Promise<Document> }>()

async function loadOgcCapabilities(url: string, protocol: 'WMS' | 'WMTS') {
  const query = new URLSearchParams({ SERVICE: protocol, REQUEST: 'GetCapabilities' })
  const version = ogcParameter(url, 'VERSION')
  if (version) query.set('VERSION', version)
  const address = serviceParameters(ogcBaseUrl(url), query)
  const cached = ogcCapabilitiesCache.get(address)
  if (cached && cached.expires > Date.now()) return cached.request
  const request = (async () => {
    const controller = new AbortController(), timeout = window.setTimeout(() => controller.abort(), 8000)
    try {
      const response = await fetch(address, { signal: controller.signal })
      if (!response.ok) throw serviceResponseError(response.status)
      const xml = new DOMParser().parseFromString(await response.text(), 'application/xml')
      if (xmlDescendants(xml, 'parsererror').length) throw new Error(`${protocol} 服务描述不是有效的 XML`)
      const error = xmlDescendants(xml, 'ServiceException')[0] || xmlDescendants(xml, 'ExceptionText')[0]
      if (error) throw new Error(`${protocol} 服务拒绝请求：${error.textContent?.trim().slice(0, 180)}`)
      if (!['Capabilities', 'WMS_Capabilities', 'WMT_MS_Capabilities'].includes(xml.documentElement.localName)) throw new Error(`${protocol} 未返回有效的 GetCapabilities 服务描述`)
      return xml
    } catch (error) {
      if (controller.signal.aborted) throw new Error(`${protocol} 服务描述读取超时`)
      if (error instanceof TypeError) throw new Error(`${protocol} 服务描述无法跨域读取，请启用 CORS 或配置同源代理`)
      throw error
    } finally { window.clearTimeout(timeout) }
  })()
  ogcCapabilitiesCache.set(address, { expires: Date.now() + 60000, request })
  while (ogcCapabilitiesCache.size > 32) ogcCapabilitiesCache.delete(ogcCapabilitiesCache.keys().next().value!)
  request.catch(() => { if (ogcCapabilitiesCache.get(address)?.request === request) ogcCapabilitiesCache.delete(address) })
  return request
}

function wgsBounds(values: number[]) {
  const [west, south, east, north] = values
  if (values.length !== 4 || !values.every(Number.isFinite) || west! >= east! || south! >= north! || west! < -180 || east! > 180 || south! < -90 || north! > 90) return
  return L.latLngBounds([south!, west!], [north!, east!])
}

function geographicXmlBounds(node: Element) {
  const geographic = xmlChildren(node, 'EX_GeographicBoundingBox')[0]
  if (geographic) return wgsBounds(['westBoundLongitude', 'southBoundLatitude', 'eastBoundLongitude', 'northBoundLatitude'].map(name => xmlNumber(geographic, name) ?? NaN))
  const latLon = xmlChildren(node, 'LatLonBoundingBox')[0]
  if (latLon) return wgsBounds(['minx', 'miny', 'maxx', 'maxy'].map(name => latLon.getAttribute(name)?.trim() ? Number(latLon.getAttribute(name)) : NaN))
  const box = xmlChildren(node, 'WGS84BoundingBox')[0]
  if (box) return wgsBounds(`${xmlText(box, 'LowerCorner')} ${xmlText(box, 'UpperCorner')}`.trim().split(/\s+/).map(Number))
}

interface WmsDefinition {
  endpoint: string
  layers: string
  version: string
  crs: string
  wkid: number
  styles: string
  format: string
  transparent: string
  bounds?: L.LatLngBounds
}

async function resolveWms(url: string, config: ServiceRemarkConfig): Promise<WmsDefinition> {
  const requested = ogcParameter(url, 'LAYERS')?.split(',').map(name => name.trim()).filter(Boolean)
  let xml: Document | undefined
  try { xml = await loadOgcCapabilities(url, 'WMS') } catch (error) {
    // 显式提供图层时保留仅允许图片跨域、禁止 XML 跨域的旧服务接入能力。
    if (!requested?.length || (error instanceof Error && /拒绝访问|拒绝请求/.test(error.message))) throw error
  }
  const entries: Array<{ name: string; leaf: boolean; crs: string[]; bounds?: L.LatLngBounds }> = []
  const visit = (node: Element, inheritedCrs: string[] = [], inheritedBounds?: L.LatLngBounds) => {
    const crs = [...new Set([...inheritedCrs, ...[...xmlChildren(node, 'CRS'), ...xmlChildren(node, 'SRS')].flatMap(element => element.textContent?.trim().split(/\s+/) || [])])]
    const bounds = geographicXmlBounds(node) || inheritedBounds
    const children = xmlChildren(node, 'Layer'), name = xmlText(node, 'Name')
    if (name) entries.push({ name, leaf: !children.length, crs, bounds })
    children.forEach(child => visit(child, crs, bounds))
  }
  if (xml) xmlDescendants(xml, 'Capability').flatMap(node => xmlChildren(node, 'Layer')).forEach(node => visit(node))
  const leaves = entries.filter(entry => entry.leaf)
  if (!requested?.length && leaves.length !== 1) throw new Error(`WMS 包含${leaves.length}个可用图层，请在地址中指定 layers=图层名${leaves.length ? `（如 ${leaves.slice(0, 5).map(layer => layer.name).join('、')}）` : ''}`)
  const names = requested?.length ? requested : [leaves[0]!.name]
  const selected = names.map(name => entries.find(entry => entry.name === name))
  if (xml && selected.some(entry => !entry)) throw new Error('WMS 中不存在所选图层，请检查 layers 参数')
  const advertised = selected[0]?.crs.filter(crs => selected.every(entry => entry?.crs.includes(crs))) || []
  let crs = ogcParameter(url, 'CRS') || ogcParameter(url, 'SRS')
  if (!crs) crs = ['EPSG:3857', 'EPSG:900913', 'CRS:84', 'EPSG:4326', 'EPSG:4490'].find(code => advertised.some(item => item.toUpperCase() === code)) || advertised.find(code => { try { projectionWkid(code); return true } catch { return false } })
  if (!crs && advertised.length) throw new Error('WMS 未声明前端支持的坐标系')
  crs ||= 'EPSG:3857'
  const wkid = projectionWkid(crs)
  if (advertised.length && !advertised.some(item => item.toUpperCase() === crs!.toUpperCase())) throw new Error(`WMS 图层不支持配置的坐标系 ${crs}`)
  const version = ogcParameter(url, 'VERSION') || xml?.documentElement.getAttribute('version') || '1.1.1'
  if (!['1.1.0', '1.1.1', '1.3.0'].includes(version)) throw new Error(`暂不支持 WMS 版本 ${version}`)
  const availableBounds = selected.flatMap(entry => entry?.bounds ? [entry.bounds] : [])
  const bounds = availableBounds.length === selected.length ? L.latLngBounds(availableBounds.flatMap(bound => [bound.getSouthWest(), bound.getNorthEast()])) : undefined
  const mapOperation = xml && xmlDescendants(xml, 'Request').flatMap(node => xmlChildren(node, 'GetMap'))[0]
  const formats = mapOperation ? xmlChildren(mapOperation, 'Format').map(node => node.textContent?.trim() || '') : []
  const format = ogcParameter(url, 'FORMAT') || (formats.includes('image/png') ? 'image/png' : formats.find(value => /^image\/(?:jpeg|jpg|gif|webp)$/i.test(value))) || (formats.length ? '' : 'image/png')
  if (!format || (formats.length && !formats.includes(format))) throw new Error('WMS 未提供所选图片格式')
  return { endpoint: ogcBaseUrl(url), layers: names.join(','), version, crs, wkid,
    styles: ogcParameter(url, 'STYLES') || '', format,
    transparent: ogcParameter(url, 'TRANSPARENT') || 'true', bounds: config.bounds || bounds }
}

/** 显式生成唯一一组 WMS 参数；正确处理 1.3 的经纬度轴序，不修改全局 CRS。 */
class OgcWmsTileLayer extends L.TileLayer {
  constructor(private definition: WmsDefinition, config: ServiceRemarkConfig) {
    super(definition.endpoint, { pane: MAP_SERVICE_IMAGERY_PANE, bounds: definition.bounds ?? config.fallbackRequestBounds,
      minZoom: config.minZoom, maxZoom: config.maxZoom ?? 22, noWrap: true, keepBuffer: 1 })
  }

  override getTileUrl(coords: L.Coords) {
    const size = this.getTileSize()
    const nw = this._map.unproject(L.point(coords.x * size.x, coords.y * size.y), coords.z)
    const se = this._map.unproject(L.point((coords.x + 1) * size.x, (coords.y + 1) * size.y), coords.z)
    const definition = this.definition
    const corners = [projectCoordinate(nw.lng, nw.lat, definition.wkid), projectCoordinate(se.lng, nw.lat, definition.wkid),
      projectCoordinate(nw.lng, se.lat, definition.wkid), projectCoordinate(se.lng, se.lat, definition.wkid)]
    const a = [Math.min(...corners.map(point => point[0])), Math.min(...corners.map(point => point[1]))]
    const b = [Math.max(...corners.map(point => point[0])), Math.max(...corners.map(point => point[1]))]
    const latFirst = definition.version === '1.3.0' && [4326, 4490].includes(definition.wkid) && !/CRS:?84$/i.test(definition.crs)
    const parameters = new URLSearchParams({ SERVICE: 'WMS', REQUEST: 'GetMap', VERSION: definition.version,
      LAYERS: definition.layers, STYLES: definition.styles, FORMAT: definition.format, TRANSPARENT: definition.transparent,
      WIDTH: String(size.x), HEIGHT: String(size.y), BBOX: (latFirst ? [a[1], a[0], b[1], b[0]] : [...a, ...b]).join(',') })
    parameters.set(definition.version === '1.3.0' ? 'CRS' : 'SRS', definition.crs)
    return serviceParameters(definition.endpoint, parameters)
  }
}

function operationEndpoint(xml: Document, operation: string, sourceUrl: string) {
  const operationNode = xmlDescendants(xml, 'Operation').find(node => node.getAttribute('name') === operation)
  const get = operationNode && xmlDescendants(operationNode, 'Get')[0]
  const href = get?.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || get?.getAttribute('href')
  const endpoint = new URL(href || ogcBaseUrl(sourceUrl), sourceUrl)
  if (!['http:', 'https:'].includes(endpoint.protocol)) throw new Error('地图服务声明了无效的请求地址')
  const original = new URL(ogcBaseUrl(sourceUrl))
  // 不把当前服务的 token/key 自动转发到服务描述中的其他域名。
  if (original.origin === endpoint.origin) original.searchParams.forEach((value, key) => { if (!endpoint.searchParams.has(key)) endpoint.searchParams.set(key, value) })
  return ogcBaseUrl(endpoint.toString())
}

interface WmtsDefinition { matrices: TileMatrix[]; wkid: number; address: (matrix: string, row: number, col: number) => string; bounds?: L.LatLngBounds }

async function resolveWmts(url: string, config: ServiceRemarkConfig): Promise<WmtsDefinition> {
  const xml = await loadOgcCapabilities(url, 'WMTS')
  const contents = xmlDescendants(xml, 'Contents')[0]
  if (!contents) throw new Error('WMTS 服务描述中缺少 Contents')
  const layers = xmlChildren(contents, 'Layer'), requestedLayer = ogcParameter(url, 'LAYER') || ogcParameter(url, 'LAYERS')
  const layer = requestedLayer ? layers.find(node => xmlText(node, 'Identifier') === requestedLayer) : layers.length === 1 ? layers[0] : undefined
  if (!layer) throw new Error('WMTS 包含多个图层或指定图层不存在，请在地址中配置 LAYER=图层标识')
  const layerId = xmlText(layer, 'Identifier'), links = xmlChildren(layer, 'TileMatrixSetLink')
  const sets = xmlChildren(contents, 'TileMatrixSet'), requestedSet = ogcParameter(url, 'TILEMATRIXSET')
  const candidates = links.flatMap(link => {
    const id = xmlText(link, 'TileMatrixSet'), node = sets.find(set => xmlText(set, 'Identifier') === id)
    if (!node || (requestedSet && id !== requestedSet)) return []
    try { return [{ id, node, link, wkid: projectionWkid(xmlText(node, 'SupportedCRS')) }] } catch { return [] }
  }).sort((a, b) => Number(b.wkid === 3857) - Number(a.wkid === 3857))
  const selected = candidates[0]
  if (!selected) throw new Error('WMTS 没有匹配且受支持的 TileMatrixSet，请检查矩阵集和坐标系')
  const metresPerUnit = [4326, 4490].includes(selected.wkid) ? 111319.49079327358 : 1
  const declaredCrs = xmlText(selected.node, 'SupportedCRS')
  const limits = xmlDescendants(selected.link, 'TileMatrixLimits')
  const matrices: TileMatrix[] = xmlChildren(selected.node, 'TileMatrix').flatMap(node => {
    const id = xmlText(node, 'Identifier'), scale = xmlNumber(node, 'ScaleDenominator')
    const corner = xmlText(node, 'TopLeftCorner').split(/\s+/).map(Number)
    const tileWidth = xmlNumber(node, 'TileWidth'), tileHeight = xmlNumber(node, 'TileHeight'), width = xmlNumber(node, 'MatrixWidth'), height = xmlNumber(node, 'MatrixHeight')
    if (!id || !scale || scale <= 0 || corner.length !== 2 || !corner.every(Number.isFinite)
      || ![tileWidth, tileHeight, width, height].every(value => value !== undefined && Number.isInteger(value) && value > 0)) return []
    const swap = [4326, 4490].includes(selected.wkid) && !/CRS:?84$/i.test(declaredCrs) && Math.abs(corner[0]!) <= 90
    const limit = limits.find(item => xmlText(item, 'TileMatrix') === id)
    if (limits.length && !limit) return []
    const range = limit ? { minRow: xmlNumber(limit, 'MinTileRow')!, maxRow: xmlNumber(limit, 'MaxTileRow')!, minCol: xmlNumber(limit, 'MinTileCol')!, maxCol: xmlNumber(limit, 'MaxTileCol')! } : undefined
    if (range && (!Object.values(range).every(Number.isInteger) || range.minRow < 0 || range.minCol < 0 || range.maxRow < range.minRow || range.maxCol < range.minCol || range.maxRow >= height! || range.maxCol >= width!)) throw new Error('WMTS TileMatrixSetLimits 无效')
    return [{ id, resolution: scale * .00028 / metresPerUnit, origin: (swap ? [corner[1]!, corner[0]!] : [corner[0]!, corner[1]!]) as [number, number], tileWidth: tileWidth!, tileHeight: tileHeight!, width: width!, height: height!, limits: range }]
  }).sort((a, b) => b.resolution - a.resolution)
  if (!matrices.length) throw new Error('WMTS 没有有效的可用切片矩阵')
  const styles = xmlChildren(layer, 'Style'), requestedStyle = ogcParameter(url, 'STYLE')
  const styleNode = requestedStyle ? styles.find(node => xmlText(node, 'Identifier') === requestedStyle) : styles.find(node => ['true', '1'].includes(node.getAttribute('isDefault') || '')) || styles[0]
  if (requestedStyle && !styleNode) throw new Error('WMTS 中不存在配置的 STYLE')
  const style = styleNode ? xmlText(styleNode, 'Identifier') : ''
  const formats = xmlChildren(layer, 'Format').map(node => node.textContent?.trim() || '')
  const format = ogcParameter(url, 'FORMAT') || formats.find(value => value === 'image/png') || formats.find(value => value.startsWith('image/'))
  if (!format || !formats.includes(format)) throw new Error('WMTS 未提供所选图片格式，矢量瓦片需专用渲染器')
  const dimensions = xmlChildren(layer, 'Dimension').map(node => {
    const id = xmlText(node, 'Identifier'), values = xmlChildren(node, 'Value')
    const value = ogcParameter(url, id) || xmlText(node, 'Default') || (values.length === 1 ? values[0]!.textContent?.trim() : '')
    if (!id || !value) throw new Error(`WMTS 维度 ${id} 缺少默认值，请在地址中配置该参数`)
    return [id, value] as const
  })
  const endpoint = operationEndpoint(xml, 'GetTile', url)
  const resource = xmlChildren(layer, 'ResourceURL').find(node => node.getAttribute('resourceType') === 'tile' && node.getAttribute('format') === format)?.getAttribute('template')
  let resourceTemplate: string | undefined
  if (resource) {
    const target = new URL(resource, url), original = new URL(ogcBaseUrl(url))
    if (!['http:', 'https:'].includes(target.protocol)) throw new Error('WMTS ResourceURL 地址无效')
    if (target.origin === original.origin) original.searchParams.forEach((value, key) => { if (![...target.searchParams.keys()].some(name => name.toUpperCase() === key.toUpperCase())) target.searchParams.set(key, value) })
    resourceTemplate = target.toString().replace(/%7B/gi, '{').replace(/%7D/gi, '}')
  }
  const address = (matrix: string, row: number, col: number) => {
    if (resourceTemplate) {
      const replacements: Record<string, string> = { layer: layerId, style, format, tilematrixset: selected.id, tilematrix: matrix, tilerow: String(row), tilecol: String(col),
        ...Object.fromEntries(dimensions.map(([key, value]) => [key.toLowerCase(), value])) }
      return resourceTemplate.replace(/\{([^{}]+)\}/g, (_match, key: string) => {
        const value = replacements[key.toLowerCase()]
        if (value === undefined || value === '') throw new Error(`WMTS ResourceURL 缺少参数 ${key}`)
        return encodeURIComponent(value)
      })
    }
    return ogcRequestUrl(endpoint, new URLSearchParams({
      SERVICE: 'WMTS', REQUEST: 'GetTile', VERSION: '1.0.0', LAYER: layerId, STYLE: style, FORMAT: format,
      TILEMATRIXSET: selected.id, TILEMATRIX: matrix, TILEROW: String(row), TILECOL: String(col), ...Object.fromEntries(dimensions),
    }))
  }
  address(matrices[0]!.id, 0, 0)
  return { matrices, wkid: selected.wkid, address, bounds: config.bounds || geographicXmlBounds(layer) }
}

class AdvertisedTileLayer extends L.TileLayer {
  private byZoom: Map<number, TileMatrix>
  constructor(matrices: TileMatrix[], private address: WmtsDefinition['address'], config: ServiceRemarkConfig) {
    const pairs = matrices.map(matrix => [Math.round(Math.log2(156543.03392804097 / matrix.resolution)), matrix] as const)
    const levels = pairs.map(([level]) => level)
    super('', { pane: MAP_SERVICE_IMAGERY_PANE, bounds: config.bounds ?? config.fallbackRequestBounds,
      minNativeZoom: Math.min(...levels), maxNativeZoom: Math.max(...levels), maxZoom: 22, noWrap: true, keepBuffer: 1 })
    this.byZoom = new Map(pairs)
  }
  override getTileUrl(coords: L.Coords) {
    const matrix = this.byZoom.get(coords.z), range = matrix?.limits
    if (!matrix || coords.x < 0 || coords.y < 0 || (matrix.width !== undefined && coords.x >= matrix.width) || (matrix.height !== undefined && coords.y >= matrix.height)
      || (range && (coords.x < range.minCol || coords.x > range.maxCol || coords.y < range.minRow || coords.y > range.maxRow))) return 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='
    return this.address(matrix.id, coords.y, coords.x)
  }
}

async function createOgcLayer(service: MapServiceItem, protocol: 'WMS' | 'WMTS', config: ServiceRemarkConfig): Promise<MapServiceLayerHandle> {
  if (protocol === 'WMS') {
    const definition = await resolveWms(service.serviceUrl, config)
    return { layer: new OgcWmsTileLayer(definition, config), bounds: definition.bounds }
  }
  let definition: WmtsDefinition
  try { definition = await resolveWmts(service.serviceUrl, config) } catch (error) {
    if (legacyWmtsTemplateAllowed(service.serviceUrl, config, error)) return { layer: createTemplateLayer(leafletWmtsTemplate(service.serviceUrl), false, config), bounds: config.bounds }
    throw error
  }
  const standard = definition.wkid === 3857 && definition.matrices.every((matrix, index, matrices) => {
    const level = Math.round(Math.log2(156543.03392804097 / matrix.resolution))
    return matrix.tileWidth === 256 && matrix.tileHeight === 256 && level >= 0
      && Math.abs(matrix.origin[0] + 20037508.342789244) < .001 && Math.abs(matrix.origin[1] - 20037508.342789244) < .001
      && Math.abs(matrix.resolution / (156543.03392804097 / 2 ** level) - 1) < 1e-7
      && (index === 0 || Math.round(Math.log2(156543.03392804097 / matrices[index - 1]!.resolution)) + 1 === level)
  })
  const resolved = { ...config, bounds: definition.bounds }
  return { layer: standard ? new AdvertisedTileLayer(definition.matrices, definition.address, resolved)
    : new MatrixTileLayer(definition.matrices, definition.wkid, definition.address, resolved), bounds: definition.bounds }
}

function legacyWmtsTemplateAllowed(url: string, config: ServiceRemarkConfig, error: unknown) {
  const explicitCrs = ogcParameter(url, 'CRS') || ogcParameter(url, 'SRS') || ogcParameter(url, 'TILEMATRIXSET') || ''
  return hasTileTemplate(leafletWmtsTemplate(url)) && (!config.tileWkid || [3857, 102100, 102113].includes(config.tileWkid))
    && !/4326|4490/.test(explicitCrs) && error instanceof Error && /无法跨域读取|读取超时/.test(error.message)
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
  if (bounds?.isValid()) imageLayer.options.bounds = bounds
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
  let queryDefinition = '1=1'
  const applyFilter = () => {
    const parts = [categoryDefinition, attributeDefinition, queryDefinition]
    vectorLayer.setDefinitionExpression(parts.includes('1=0') ? '1=0' : parts.filter(part => part !== '1=1').map(part => `(${part})`).join(' AND ') || '1=1')
  }
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
    setRenderer: renderer => vectorLayer.setStandardRenderer(renderer),
    setQueryFilter: expression => { queryDefinition = expression || '1=1'; applyFilter() },
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
  boundsOverride?: L.LatLngBounds,
): Promise<MapServiceLayerHandle> {
  const metadata = await loadArcGisMetadata(url)
  const bounds = arcGisBounds(metadata, config, !imageServer, boundsOverride)
  if (metadata.singleFusedMapCache) {
    const info = metadata.tileInfo
    const minLOD = config.minZoom ?? (metadata.minLOD != null && metadata.minLOD >= 0 ? metadata.minLOD : undefined)
    const maxLOD = config.maxZoom ?? (metadata.maxLOD != null && metadata.maxLOD >= 0 ? metadata.maxLOD : undefined)
    const lods = (info?.lods || []).filter(lod => lod.level != null && Number.isInteger(lod.level)
      && (minLOD === undefined || lod.level >= minLOD) && (maxLOD === undefined || lod.level <= maxLOD))
    {
      const spatialReference = info?.spatialReference || metadata.spatialReference
      const code = spatialReference?.latestWkid || spatialReference?.wkid || config.tileWkid
      if (!code) throw new Error('缓存服务未提供切片坐标系，请补充 tileInfo.spatialReference')
      const wkid = projectionWkid(code)
      const origin = info?.origin
      if (!Number.isFinite(origin?.x) || !Number.isFinite(origin?.y)) throw new Error('缓存服务未提供有效切片原点')
      const tileWidth = info?.cols ?? 256, tileHeight = info?.rows ?? 256
      if (![tileWidth, tileHeight].every(value => Number.isInteger(value) && value > 0 && value <= 4096)) throw new Error('缓存服务切片尺寸无效')
      const matrices: TileMatrix[] = lods.flatMap(lod => Number.isFinite(lod.resolution) && lod.resolution! > 0 ? [{
        id: String(lod.level), resolution: lod.resolution!, origin: [origin!.x!, origin!.y!] as [number, number],
        tileWidth, tileHeight,
      }] : [])
      if (!matrices.length) throw new Error('缓存服务没有有效的可用切片级别与分辨率')
      const standard = wkid === 3857 && matrices.every((matrix, index) => matrix.tileWidth === 256 && matrix.tileHeight === 256
        && Math.abs(matrix.origin[0] + 20037508.342789244) < .001 && Math.abs(matrix.origin[1] - 20037508.342789244) < .001
        && Math.abs(matrix.resolution / (156543.03392804097 / 2 ** Number(matrix.id)) - 1) < 1e-7
        && (index === 0 || Number(matrix.id) === Number(matrices[index - 1]!.id) + 1))
      if (standard) {
        const levels = matrices.map(matrix => Number(matrix.id))
        const requestBounds = bounds ?? config.fallbackRequestBounds
        return {
          layer: new CoverageAwareArcGisTileLayer(servicePath(url, 'tile/{z}/{y}/{x}'), requestBounds, {
            pane: MAP_SERVICE_IMAGERY_PANE,
            bounds: requestBounds,
            minNativeZoom: minLOD ?? Math.min(...levels),
            maxNativeZoom: maxLOD ?? Math.max(...levels),
            maxZoom: Math.max(config.maxZoom || 22, 22),
            noWrap: true,
            keepBuffer: 3,
          }), bounds,
        }
      }
      // Nonstandard matrices use the reprojection renderer, which filters
      // against the service extent and treats empty cache cells as transparent.
      return {
        layer: new MatrixTileLayer(matrices, wkid, (level, row, col) => servicePath(url, `tile/${encodeURIComponent(level)}/${row}/${col}`), { ...config, bounds }), bounds,
      }
    }
  }
  if (!imageServer) {
    if (selectedLayerId !== undefined) {
      const layerMetadata = await loadArcGisJson<ArcGisLayerMetadata>(servicePath(url, String(selectedLayerId)))
      if (selectedGeometryType && !layerMetadata.geometryType) layerMetadata.geometryType = selectedGeometryType
      if (layerMetadata.geometryType) return createArcGisVectorHandle(url, selectedLayerId, layerMetadata, bounds, color)
    }
    for (const definition of (metadata.layers || []).slice(0, 12)) {
      if (!Number.isFinite(Number(definition.id))) continue
      const layerId = Number(definition.id)
      const layerMetadata = await loadArcGisJson<ArcGisLayerMetadata>(servicePath(url, String(layerId)))
      if (layerMetadata.geometryType !== 'esriGeometryPolygon') continue
      return createArcGisVectorHandle(url, layerId, layerMetadata, bounds, color)
    }
  }
  const layer = new ArcGisExportLayer(url, imageServer)
  if (bounds?.isValid()) layer.options.bounds = bounds
  return { layer, bounds }
}

export async function createMapServiceLayer(service: MapServiceItem, color?: string, options: MapServiceLayerOptions = {}): Promise<MapServiceLayerHandle> {
  const url = serviceRoot(service.serviceUrl)
  const type = normalizedType(service.type)
  const config: ServiceRemarkConfig = {
    ...parseServiceRemark(service.remark),
    fallbackRequestBounds: options.fallbackRequestBounds?.isValid() ? options.fallbackRequestBounds : undefined,
  }
  const forwarderTemplate = taizhouForwarderTemplate(url)
  if (forwarderTemplate) return createTaizhouForwarderLayer(forwarderTemplate, config)
  const protocol = ogcProtocol(service)
  if (protocol) return createOgcLayer(service, protocol, config)

  // 已配置瓦片模板时直接加载，兼容后台将转发瓦片误标为 MapServer 的情况。
  const template = leafletWmtsTemplate(url)
  if (hasTileTemplate(template)) {
    const tms = type.includes('TMS')
    const resolvedConfig = tms ? await tmsConfig(template, config) : config
    return { layer: createTemplateLayer(template, tms, resolvedConfig), bounds: resolvedConfig.bounds }
  }

  if (type.includes('TMS')) {
    const resolvedConfig = await tmsConfig(url, config)
    return { layer: createTemplateLayer(url, true, resolvedConfig), bounds: resolvedConfig.bounds }
  }
  if (type.includes('XYZ')) return { layer: createTemplateLayer(url, false, config), bounds: config.bounds }
  if (type.includes('ARCGIS_IMAGESERVER') || /\/ImageServer(?:\?|$)/i.test(url)) {
    return createArcGisLayer(url, true, config, undefined, undefined, undefined, options.boundsOverride)
  }
  if (type.includes('ARCGIS_MAPSERVER') || type === 'ARCGIS' || /\/MapServer(?:\?|$)/i.test(url)) {
    return createArcGisLayer(url, false, config, service.arcGisLayerId, service.arcGisGeometryType, color, options.boundsOverride)
  }
  throw new Error(`暂不支持地图服务类型：${service.type || '未知'}`)
}

/**
 * 将动态 ArcGIS MapServer 中的矢量子图层展开为独立的图层管理条目。
 * 缓存影像、ImageServer 以及没有多个矢量子图层的服务保持原有名称和条目数量。
 */
export async function expandMapServiceSublayers(service: MapServiceItem, strict = false): Promise<MapServiceItem[]> {
  const url = serviceRoot(service.serviceUrl)
  const type = normalizedType(service.type)
  if (taizhouForwarderTemplate(url) || ogcProtocol(service) || hasTileTemplate(leafletWmtsTemplate(url)) || isTileRequestUrl(url)) return [service]
  if (!(type.includes('ARCGIS_MAPSERVER') || type === 'ARCGIS' || /\/MapServer(?:\?|$)/i.test(url))) return [service]

  try {
    const metadata = await loadArcGisMetadata(url)
    if (metadata.singleFusedMapCache) return [service]
    const definitions = metadata.layers || []
    const expanded: Array<{ id: number; name: string; geometryType: string } | undefined> = new Array(definitions.length)
    let cursor = 0
    await Promise.all(Array.from({ length: Math.min(3, definitions.length) }, async () => {
      while (cursor < definitions.length) {
        const index = cursor++
        const definition = definitions[index]!
        const layerId = Number(definition.id)
        if (!Number.isFinite(layerId)) continue
        try {
          const read = () => loadArcGisJson<ArcGisLayerMetadata>(servicePath(url, String(layerId)))
          const layerMetadata = await read().catch(() => read())
          if (layerMetadata.geometryType) expanded[index] = { id: layerId, name: definition.name || `子图层${layerId}`, geometryType: layerMetadata.geometryType }
        } catch { /* 保留其他可用子图层，不把单个失败扩散到整个服务。 */ }
      }
    }))
    const layers = expanded.filter((layer): layer is { id: number; name: string; geometryType: string } => Boolean(layer))

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
  } catch (reason) {
    if (strict) throw reason
    return [service]
  }
}

/** 预检只读取服务定义及轻量查询；不下载完整要素或自动显示图层。 */
export async function probeMapService(service: MapServiceItem): Promise<void> {
  const url = serviceRoot(service.serviceUrl)
  if (service.arcGisGeometryType && service.arcGisLayerId !== undefined) {
    const response = await loadArcGisJson<{ count?: number }>(serviceParameters(servicePath(url, `${service.arcGisLayerId}/query`), new URLSearchParams({
      where: '1=1', returnCountOnly: 'true', f: 'json',
    })))
    if (!Number.isFinite(response.count) || response.count! < 0) throw new Error('图层服务未返回有效的要素统计')
    return
  }
  // Capabilities、ArcGIS 元数据、TMS 描述等会在创建句柄时校验；句柄不加入地图。
  const handle = await createMapServiceLayer(service)
  const layer = handle.layer
  let sample: string | undefined
  if (layer instanceof ArcGisExportLayer && handle.bounds?.isValid()) {
    sample = serviceParameters(servicePath(url, /ImageServer/i.test(url) || /IMAGESERVER/.test(normalizedType(service.type)) ? 'exportImage' : 'export'), new URLSearchParams({
      bbox: handle.bounds.toBBoxString(), bboxSR: '4326', imageSR: '3857', size: '32,32', format: 'png32', transparent: 'true', f: 'image',
    }))
  }
  // 模板瓦片服务可能没有元数据接口，使用其覆盖范围内的一张样本瓦片验证。
  if (layer instanceof L.TileLayer && hasTileTemplate(leafletWmtsTemplate(url)) && handle.bounds?.isValid()) {
    const center = handle.bounds.getCenter()
    const zoom = Math.max(layer.options.minZoom || 0, layer.options.minNativeZoom || 0, Math.min(layer.options.maxNativeZoom || 12, 12))
    const point = L.CRS.EPSG3857.latLngToPoint(center, zoom).divideBy(256).floor()
    sample = leafletWmtsTemplate(url).replace('{s}', '0').replace('{z}', String(zoom)).replace('{x}', String(point.x)).replace('{y}', String(normalizedType(service.type).includes('TMS') ? 2 ** zoom - 1 - point.y : point.y))
  }
  if (sample) {
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), 8000)
    try {
      const response = await fetch(sample, { signal: controller.signal })
      // 稀疏缓存的中心瓦片可能不存在；404/204 表示该位置无数据，不能据此隐藏整个服务。
      if (response.status === 404 || response.status === 204) return
      if (!response.ok) throw serviceResponseError(response.status)
      if (!response.headers.get('content-type')?.startsWith('image/')) throw new Error('服务未返回有效的影像响应')
      return
    } catch (reason) {
      if (controller.signal.aborted) throw new Error('样本瓦片读取超时')
      if (!(reason instanceof TypeError)) throw reason
      // 不允许 CORS 读取的影像，仍可通过浏览器图片请求验证。
    } finally { window.clearTimeout(timer) }
    await new Promise<void>((resolve, reject) => {
      const image = new Image()
      const timer = window.setTimeout(() => finish(new Error('样本瓦片读取超时')), 8000)
      const finish = (reason?: Error) => { window.clearTimeout(timer); image.onload = null; image.onerror = null; if (reason) reject(reason); else resolve() }
      image.onload = () => finish()
      image.onerror = () => finish(new Error('样本瓦片不可用'))
      image.src = sample
    })
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
  if (taizhouForwarderTemplate(url)) return { isImagery: true, bounds: serializableBounds(config.bounds) }
  const protocol = ogcProtocol(service)
  if (protocol) {
    try {
      const definition = protocol === 'WMS' ? await resolveWms(url, config) : await resolveWmts(url, config)
      return { isImagery: true, bounds: serializableBounds(definition.bounds) }
    } catch (error) {
      if (protocol === 'WMTS' && legacyWmtsTemplateAllowed(url, config, error)) return { isImagery: true, bounds: serializableBounds(config.bounds) }
      throw error
    }
  }

  if (hasTileTemplate(leafletWmtsTemplate(url))) {
    const resolvedConfig = type.includes('TMS') ? await tmsConfig(leafletWmtsTemplate(url), config) : config
    return { isImagery: true, bounds: serializableBounds(resolvedConfig.bounds) }
  }

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
      const layerMetadata = await loadArcGisJson<ArcGisLayerMetadata>(servicePath(url, String(Number(definition.id))))
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
  const request = loadArcGisJson<ArcGisLayerMetadata>(servicePath(url, String(layerId)))
  layerFieldCache.set(key, request)
  request.catch(() => layerFieldCache.delete(key))
  return request
}

export async function getMapServiceLayerMetadata(service: MapServiceItem) {
  if (service.arcGisLayerId === undefined) throw new Error('服务没有可查询的矢量子图层')
  return cachedLayerMetadata(serviceRoot(service.serviceUrl), service.arcGisLayerId)
}

/** 专题按字段读取完整结果，复用 ID 分批机制，不受旧服务 1000 条上限影响。 */
export async function queryMapServiceFeatures(service: MapServiceItem, fields: string[], where = '1=1', geometry = false) {
  const metadata = await getMapServiceLayerMetadata(service)
  const knownFields = new Set((metadata.fields || []).map(field => field.name))
  if (fields.some(field => !knownFields.has(field))) throw new Error('所选字段不存在于当前图层')
  const parameters = new URLSearchParams({ where, outFields: fields.join(','), returnGeometry: String(geometry), outSR: '4326' })
  const result = await queryAllFeatures(servicePath(serviceRoot(service.serviceUrl), `${service.arcGisLayerId}/query`), parameters)
  return { features: result.features || [], objectIdField: metadata.fields?.find(field => field.type === 'esriFieldTypeOID')?.name || 'OBJECTID' }
}

export async function queryMapServiceSpatialIds(service: MapServiceItem, geometries: MapServiceSearchGeometry[]) {
  const ids = new Set<string | number>()
  for (const geometry of geometries) {
    const result = await queryArcGis(servicePath(serviceRoot(service.serviceUrl), `${service.arcGisLayerId}/query`), new URLSearchParams({
      where: '1=1', returnIdsOnly: 'true', returnGeometry: 'false', geometry: JSON.stringify(geometry),
      geometryType: 'esriGeometryPolygon', inSR: '4326', spatialRel: 'esriSpatialRelIntersects',
    }))
    if (!result.objectIds) throw new Error('服务未返回空间查询结果')
    result.objectIds.forEach(id => ids.add(id))
  }
  return [...ids]
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
  let response: Response
  try {
    response = await fetch(url, { method: 'POST', body: parameters })
  } catch {
    // Some older ArcGIS services allow JSONP but do not enable CORS for POST.
    return loadArcGisJson<ArcGisQueryResponse>(serviceParameters(url, parameters))
  }
  if ([405, 501].includes(response.status)) return loadArcGisJson<ArcGisQueryResponse>(serviceParameters(url, parameters))
  if (!response.ok) throw serviceResponseError(response.status)
  const data = await response.json() as ArcGisQueryResponse & { error?: { code?: number; message?: string } }
  if (data.error?.code && [401, 403, 498, 499].includes(data.error.code)) throw serviceResponseError(data.error.code)
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
  const response = await queryAllFeatures(servicePath(url, `${layerId}/query`), parameters)
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
    response = await queryAllFeatures(servicePath(url, `${layerId}/query`), parameters)
  } catch {
    // Older databases cannot CAST every numeric/date field. Scan complete attributes
    // when an expression is unsupported, using ID batching rather than dropping fields.
    parameters.set('where', '1=1')
    response = await queryAllFeatures(servicePath(url, `${layerId}/query`), parameters)
  }
  return (response.features || []).flatMap(feature => {
    const result = identifiedFeature(service, feature, metadata, response.fieldAliases)
    const matched = result.rows.find(row => row.value.toLowerCase().includes(text.toLowerCase()))
    if (!matched) return []
    return [{ ...result, title: matched.value, matchLabel: matched.label, matchFieldName: matched.name }]
  })
}
