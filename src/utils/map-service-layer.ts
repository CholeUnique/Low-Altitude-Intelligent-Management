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
  geometryType?: string
  displayField?: string
  fields?: Array<{ name?: string; alias?: string }>
}

interface ArcGisQueryResponse {
  features?: Array<{ attributes?: Record<string, unknown> }>
  objectIds?: Array<number | string>
}

export interface MapServiceCategoryFilter {
  fieldLabel: string
  values: string[]
  setVisibleValues: (values: string[]) => void
}

export interface MapServiceLayerHandle {
  layer: L.Layer
  bounds?: L.LatLngBounds
  categoryFilter?: MapServiceCategoryFilter
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

class ArcGisExportLayer extends L.GridLayer {
  private definitionExpression = '1=1'
  private filterRevision = 0

  constructor(
    private readonly url: string,
    private readonly imageServer = false,
    private readonly vectorLayerId?: number,
    private readonly vectorGeometryType = 'esriGeometryPolygon',
  ) {
    super({
      pane: vectorLayerId === undefined ? MAP_SERVICE_IMAGERY_PANE : MAP_SERVICE_VECTOR_PANE,
      tileSize: 256,
      noWrap: true,
      keepBuffer: 3,
      updateWhenIdle: false,
    })
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
      const symbol = this.vectorGeometryType === 'esriGeometryPoint'
        ? {
            type: 'esriSMS', style: 'esriSMSCircle', color: [255, 208, 0, 230], size: 9,
            outline: { type: 'esriSLS', style: 'esriSLSSolid', color: [255, 0, 0, 255], width: 1.5 },
          }
        : this.vectorGeometryType === 'esriGeometryPolyline'
          ? { type: 'esriSLS', style: 'esriSLSSolid', color: [255, 0, 0, 255], width: 2.5 }
          : {
              type: 'esriSFS', style: 'esriSFSSolid', color: [255, 0, 0, 51],
              outline: { type: 'esriSLS', style: 'esriSLSSolid', color: [255, 0, 0, 255], width: 2 },
            }
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
          renderer: {
            type: 'simple',
            symbol,
          },
        },
      }]))
    }
    tile.alt = ''
    tile.setAttribute('role', 'presentation')
    tile.onload = () => done(undefined, tile)
    tile.onerror = () => done(new Error('地图服务影像加载失败'), tile)
    tile.src = `${this.url}/${this.imageServer ? 'exportImage' : 'export'}?${parameters.toString()}`
    return tile
  }

  setDefinitionExpression(expression: string) {
    this.definitionExpression = expression
    this.filterRevision += 1
    this.redraw()
  }

  createFilteredCopy(expression: string) {
    const layer = new ArcGisExportLayer(this.url, this.imageServer, this.vectorLayerId, this.vectorGeometryType)
    layer.definitionExpression = expression
    layer.filterRevision = this.filterRevision + 1
    return layer
  }
}

function categoryField(fields: ArcGisLayerMetadata['fields']) {
  const candidates = ['DLMC', '地类名称', '变化类']
  return candidates.flatMap((candidate) => (fields || []).filter((field) =>
    field.name?.toUpperCase() === candidate.toUpperCase() || field.alias?.toUpperCase() === candidate.toUpperCase()))[0]
}

function hoverField(metadata: ArcGisLayerMetadata) {
  const fields = metadata.fields || []
  const preferredNames = [metadata.displayField, 'GCMC', 'XMMC', 'DKBM', 'DCBH', 'DLMC', '地类名称', '变化类']
    .filter((name): name is string => Boolean(name))
  return preferredNames.flatMap((candidate) => fields.filter((field) =>
    field.name?.toUpperCase() === candidate.toUpperCase() || field.alias?.toUpperCase() === candidate.toUpperCase()))[0]
}

function fieldLabel(field?: { name?: string; alias?: string }) {
  const name = field?.name || ''
  const labels: Record<string, string> = {
    GCMC: '工程名称', XMMC: '项目名称', DKBM: '地块编码', DCBH: '地块编号',
    DLMC: '地类名称', '变化类': '变化类型',
  }
  return labels[name] || field?.alias || name || '名称'
}

class ArcGisVectorLayer extends L.LayerGroup {
  private hoverTimer?: number
  private requestSequence = 0
  private filterSwapSequence = 0
  private pendingImageLayer?: ArcGisExportLayer
  private readonly tooltip = L.tooltip({
    direction: 'top',
    offset: [0, -12],
    opacity: 1,
    className: 'jiulong-feature-tooltip',
  })
  private definitionExpression = '1=1'
  private imageLayer: L.Layer

  constructor(
    imageLayer: L.Layer,
    private readonly serviceUrl: string,
    private readonly layerId: number,
    private readonly fieldName?: string,
    private readonly fieldLabel = '地类名称',
  ) {
    super([imageLayer])
    this.imageLayer = imageLayer
  }

  override onAdd(map: L.Map) {
    super.onAdd(map)
    map.on('mousemove', this.handleMouseMove, this)
    map.on('mouseout', this.closeVectorTooltip, this)
    return this
  }

  override onRemove(map: L.Map) {
    map.off('mousemove', this.handleMouseMove, this)
    map.off('mouseout', this.closeVectorTooltip, this)
    this.closeVectorTooltip()
    super.onRemove(map)
    return this
  }

  private closeVectorTooltip() {
    this.requestSequence += 1
    if (this.hoverTimer !== undefined) window.clearTimeout(this.hoverTimer)
    this.hoverTimer = undefined
    this._map?.closeTooltip(this.tooltip)
  }

  private handleMouseMove(event: L.LeafletMouseEvent) {
    if (!this.fieldName) return
    const fieldName = this.fieldName
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
        where: this.definitionExpression,
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
        outFields: fieldName,
        returnGeometry: 'false',
      })
      try {
        const response = await loadArcGisJson<ArcGisQueryResponse>(`${this.serviceUrl}/${this.layerId}/query?${parameters.toString()}`)
        if (sequence !== this.requestSequence) return
        const rawValue = response.features?.[0]?.attributes?.[fieldName]
        if (rawValue == null || String(rawValue).trim() === '') {
          this._map?.closeTooltip(this.tooltip)
          return
        }
        const content = document.createElement('div')
        const label = document.createElement('span')
        const value = document.createElement('strong')
        label.textContent = `${this.fieldLabel}：`
        value.textContent = String(rawValue)
        content.append(label, value)
        this.tooltip.setLatLng(event.latlng).setContent(content)
        this._map?.openTooltip(this.tooltip)
      } catch {
        if (sequence === this.requestSequence) this._map?.closeTooltip(this.tooltip)
      }
    }, 140)
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

function categoryExpression(fieldName: string, allValues: string[], visibleValues: string[]) {
  if (visibleValues.length === allValues.length) return '1=1'
  if (!visibleValues.length) return '1=0'
  const visibleSet = new Set(visibleValues)
  const hiddenValues = allValues.filter((value) => !visibleSet.has(value))

  // 旧版 ArcGIS Server 的 dynamicLayers 对 IN/NOT IN 长列表兼容性较差，
  // 使用值更少的一侧生成基础比较表达式，避免取消一个类型后整层返回透明图。
  if (hiddenValues.length < visibleValues.length) {
    return hiddenValues.map((value) => `${fieldName} <> ${sqlLiteral(value)}`).join(' AND ')
  }
  return `(${visibleValues.map((value) => `${fieldName} = ${sqlLiteral(value)}`).join(' OR ')})`
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
  const appendValues = (response: ArcGisQueryResponse) => {
    for (const feature of response.features || []) {
      const value = feature.attributes?.[fieldName]
      if (value != null && String(value).trim()) valueSet.add(String(value).trim())
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

  return [...valueSet].sort((left, right) => left.localeCompare(right, 'zh-CN'))
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
): Promise<MapServiceLayerHandle> {
  const tooltipField = hoverField(layerMetadata)
  const tooltipLabel = fieldLabel(tooltipField)
  const filterField = categoryField(layerMetadata.fields)
  const filterLabel = fieldLabel(filterField)
  const imageLayer = new ArcGisExportLayer(url, false, layerId, layerMetadata.geometryType)
  const vectorLayer = new ArcGisVectorLayer(imageLayer, url, layerId, tooltipField?.name, tooltipLabel)
  let categoryFilter: MapServiceCategoryFilter | undefined
  if (filterField?.name) {
    try {
      const values = await queryCategoryValues(url, layerId, filterField.name)
      if (values.length) {
        categoryFilter = {
          fieldLabel: filterLabel,
          values,
          setVisibleValues: (visibleValues) => vectorLayer.setDefinitionExpression(
            categoryExpression(filterField.name!, values, visibleValues),
          ),
        }
      }
    } catch {
      // 分类查询失败不影响矢量图层本身显示。
    }
  }
  return { layer: vectorLayer, bounds, categoryFilter }
}

async function createArcGisLayer(
  url: string,
  imageServer: boolean,
  config: ServiceRemarkConfig,
  selectedLayerId?: number,
  selectedGeometryType?: string,
): Promise<MapServiceLayerHandle> {
  const metadata = await loadArcGisMetadata(url)
  const bounds = config.bounds || extentBounds(metadata.fullExtent || metadata.initialExtent)
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
      if (layerMetadata.geometryType) return createArcGisVectorHandle(url, selectedLayerId, layerMetadata, bounds)
    }
    for (const definition of (metadata.layers || []).slice(0, 12)) {
      if (!Number.isFinite(Number(definition.id))) continue
      const layerId = Number(definition.id)
      const layerMetadata = await loadArcGisJson<ArcGisLayerMetadata>(`${url}/${layerId}`)
      if (layerMetadata.geometryType !== 'esriGeometryPolygon') continue
      return createArcGisVectorHandle(url, layerId, layerMetadata, bounds)
    }
  }
  return { layer: new ArcGisExportLayer(url, imageServer), bounds }
}

export async function createMapServiceLayer(service: MapServiceItem): Promise<MapServiceLayerHandle> {
  const url = serviceRoot(service.serviceUrl)
  const type = normalizedType(service.type)
  const config = parseServiceRemark(service.remark)

  if (type.includes('TMS')) return { layer: createTemplateLayer(url, true, config), bounds: config.bounds }
  if (type.includes('XYZ')) return { layer: createTemplateLayer(url, false, config), bounds: config.bounds }
  if (type.includes('WMTS')) return { layer: createTemplateLayer(leafletWmtsTemplate(url), false, config), bounds: config.bounds }
  if (type.includes('WMS')) return { layer: createWmsLayer(url, config), bounds: config.bounds }
  if (type.includes('ARCGIS_IMAGESERVER') || /\/ImageServer(?:\?|$)/i.test(url)) {
    return createArcGisLayer(url, true, config)
  }
  if (type.includes('ARCGIS_MAPSERVER') || type === 'ARCGIS' || /\/MapServer(?:\?|$)/i.test(url)) {
    return createArcGisLayer(url, false, config, service.arcGisLayerId, service.arcGisGeometryType)
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
      name: `${service.name}-${layer.name}`,
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
    return { isImagery: true, bounds: serializableBounds(config.bounds || extentBounds(metadata.fullExtent || metadata.initialExtent)) }
  }

  if (type.includes('ARCGIS_MAPSERVER') || type === 'ARCGIS' || /\/MapServer(?:\?|$)/i.test(url)) {
    const metadata = await loadArcGisMetadata(url)
    // 缓存切片 MapServer 在子图层元数据中也可能带 geometryType，但前端实际
    // 获取的是已经渲染好的影像瓦片，不能因此把它误判为矢量服务。
    if (metadata.singleFusedMapCache) {
      return { isImagery: true, bounds: serializableBounds(config.bounds || extentBounds(metadata.fullExtent || metadata.initialExtent)) }
    }
    for (const definition of (metadata.layers || []).slice(0, 12)) {
      if (!Number.isFinite(Number(definition.id))) continue
      const layerMetadata = await loadArcGisJson<ArcGisLayerMetadata>(`${url}/${Number(definition.id)}`)
      if (layerMetadata.geometryType) return { isImagery: false }
    }
    return { isImagery: true, bounds: serializableBounds(config.bounds || extentBounds(metadata.fullExtent || metadata.initialExtent)) }
  }

  if (type.includes('TMS') || type.includes('XYZ') || type.includes('WMTS') || type.includes('WMS')) {
    return { isImagery: true, bounds: serializableBounds(config.bounds) }
  }

  return { isImagery: false }
}
