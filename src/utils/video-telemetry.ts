/** SRT 时间轴以视频起点为零，坐标保持 WGS84，不用拍摄日期推算时间。 */
export interface VideoTelemetryPoint {
  start: number
  end: number
  latitude: number
  longitude: number
  relativeAltitude?: number
  absoluteAltitude?: number
}

export const MAX_SRT_BYTES = 20 * 1024 * 1024

export function formatTelemetryCoordinates(point?: Pick<VideoTelemetryPoint, 'longitude' | 'latitude'>): string {
  if (!point) return '经纬度 —'
  return `${Math.abs(point.longitude).toFixed(6)}°${point.longitude < 0 ? 'W' : 'E'}, ${Math.abs(point.latitude).toFixed(6)}°${point.latitude < 0 ? 'S' : 'N'}`
}

function timestamp(value: string): number {
  const parts = /^(\d+):([0-5]\d):([0-5]\d)[,.](\d{3})$/.exec(value)
  return parts ? Number(parts[1]) * 3600 + Number(parts[2]) * 60 + Number(parts[3]) + Number(parts[4]) / 1000 : NaN
}

function field(text: string, name: string): number | undefined {
  const match = new RegExp(`\\b(?:${name})\\s*[:=]\\s*([+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+))(?=\\s|[\\],;)]|$)`, 'i').exec(text)
  return match ? Number(match[1]) : undefined
}

/** 单条遥测读取，供地图与完整 SRT 信息界面共用同一套定位校验规则。 */
export function videoTelemetryPoint(start: number, end: number, body: string): VideoTelemetryPoint | undefined {
  let latitude = field(body, 'latitude|lat')
  let longitude = field(body, 'longitude|longtitude|lon|lng')
  const gps = /\bGPS\s*[:=]?\s*\(\s*([+-]?[\d.]+)\s*,\s*([+-]?[\d.]+)(?:\s*,\s*([+-]?[\d.]+))?\s*\)/i.exec(body)
  if (latitude === undefined && longitude === undefined && gps) {
    const first = Number(gps[1]), second = Number(gps[2])
    if (Math.abs(first) > 90 && Math.abs(second) <= 90) { longitude = first; latitude = second }
    else if (Math.abs(second) > 90 && Math.abs(first) <= 90) { latitude = first; longitude = second }
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start
    || latitude === undefined || longitude === undefined || !Number.isFinite(latitude) || !Number.isFinite(longitude)
    || Math.abs(latitude) > 90 || Math.abs(longitude) > 180 || (latitude === 0 && longitude === 0)) return
  return { start, end, latitude, longitude, relativeAltitude: field(body, 'rel_alt|relative_altitude'), absoluteAltitude: field(body, 'abs_alt|absolute_altitude') }
}

export function parseVideoSrt(source: string): { points: VideoTelemetryPoint[]; skipped: number } {
  if (source.length > MAX_SRT_BYTES) throw new Error('SRT 文件过大，请选择 20 MB 以内的文件。')
  const text = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
  const timing = /^(\d+:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d+:\d{2}:\d{2}[,.]\d{3})[^\n]*\n/gm
  const cues = [...text.matchAll(timing)]
  if (cues.length > 200_000) throw new Error('SRT 记录过多，请分段后加载。')
  const points: VideoTelemetryPoint[] = []
  let skipped = 0
  cues.forEach((cue, index) => {
    const body = text.slice(cue.index! + cue[0].length, cues[index + 1]?.index ?? text.length).replace(/<[^>]*>/g, ' ')
    const start = timestamp(cue[1]!), end = timestamp(cue[2]!)
    const point = videoTelemetryPoint(start, end, body)
    if (point) points.push(point)
    else skipped++
  })
  points.sort((left, right) => left.start - right.start)
  if (!points.length) throw new Error('SRT 中没有有效的时间和无人机经纬度，请选择包含 GPS 遥测数据的原始 SRT。')
  return { points, skipped }
}

function telemetryIndex(points: readonly VideoTelemetryPoint[], time: number): number {
  if (!Number.isFinite(time)) return -1
  let low = 0, high = points.length - 1, found = -1
  while (low <= high) {
    const middle = (low + high) >>> 1
    if (points[middle]!.start <= time) { found = middle; low = middle + 1 } else high = middle - 1
  }
  return found
}

/** 二分查找当前字幕区间；首尾之外、定位缺口均不沿用旧位置。 */
export function telemetryAtTime(points: readonly VideoTelemetryPoint[], time: number): VideoTelemetryPoint | undefined {
  const point = points[telemetryIndex(points, time)]
  return point && time <= point.end ? point : undefined
}

/** 相邻有效采样之间按媒体时间线性插值，不跨定位缺口/长间隔/异常跳点。 */
export function interpolatedTelemetryAtTime(points: readonly VideoTelemetryPoint[], time: number): VideoTelemetryPoint | undefined {
  const index = telemetryIndex(points, time)
  const point = points[index], next = points[index + 1]
  if (!point || time > point.end) return
  const interval = next ? next.start - point.start : 0
  if (!next || interval <= 0 || interval > 2 || next.start - point.end > .05) return point
  const longitudeDelta = ((next.longitude - point.longitude + 540) % 360) - 180
  const radians = Math.PI / 180
  const dx = longitudeDelta * Math.cos((point.latitude + next.latitude) / 2 * radians)
  const distance = Math.hypot(dx, next.latitude - point.latitude) * radians * 6_371_000
  if (distance / interval > 100) return point
  const ratio = Math.max(0, Math.min(1, (time - point.start) / interval))
  if (ratio === 0) return point
  const altitude = (first?: number, second?: number) => first === undefined || second === undefined ? first : first + (second - first) * ratio
  const longitude = point.longitude + longitudeDelta * ratio
  return { ...point,
    latitude: point.latitude + (next.latitude - point.latitude) * ratio,
    longitude: longitude > 180 || longitude < -180 ? ((longitude + 540) % 360) - 180 : longitude,
    relativeAltitude: altitude(point.relativeAltitude, next.relativeAltitude),
    absoluteAltitude: altitude(point.absoluteAltitude, next.absoluteAltitude) }
}

/** 小窗始终保留在视频区域内，适用于拖动及全屏/窗口尺寸变化。 */
export function clampTelemetryPanel(left: number, top: number, width: number, height: number, parentWidth: number, parentHeight: number) {
  const insetX = Math.min(8, Math.max(0, (parentWidth - width) / 2))
  const insetY = Math.min(8, Math.max(0, (parentHeight - height) / 2))
  return { left: Math.max(insetX, Math.min(left, parentWidth - width - insetX)),
    top: Math.max(insetY, Math.min(top, parentHeight - height - insetY)) }
}

export async function decodeVideoSrt(file: Blob): Promise<string> {
  if (!file.size || file.size > MAX_SRT_BYTES) throw new Error('请选择非空且不超过 20 MB 的 SRT 文件。')
  const bytes = new Uint8Array(await file.arrayBuffer())
  const encoding = bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf-16le' : bytes[0] === 0xfe && bytes[1] === 0xff ? 'utf-16be' : 'utf-8'
  return new TextDecoder(encoding).decode(bytes)
}

/** 以媒体时钟驱动，倍速/拖动/暂停均不依赖累计墙钟。返回完整清理函数。 */
export function bindVideoTelemetryClock(video: HTMLVideoElement, update: (time: number) => void) {
  let frame: number | undefined
  let lastTick = -Infinity
  const sync = () => update(video.currentTime)
  const stop = () => { if (frame !== undefined) cancelAnimationFrame(frame); frame = undefined }
  const tick = (now: number) => {
    frame = undefined
    if (now - lastTick >= 1000 / 30 - .5) { sync(); lastTick = now }
    if (!video.paused && !video.ended) frame = requestAnimationFrame(tick)
  }
  const start = () => { sync(); if (frame === undefined && !video.paused && !video.ended) frame = requestAnimationFrame(tick) }
  const pause = () => { stop(); sync() }
  const events = { play: start, playing: start, pause, ended: pause, waiting: pause, timeupdate: sync, seeking: sync, seeked: sync, loadedmetadata: sync, ratechange: sync, emptied: sync }
  for (const [event, handler] of Object.entries(events)) video.addEventListener(event, handler)
  start()
  return () => { stop(); for (const [event, handler] of Object.entries(events)) video.removeEventListener(event, handler) }
}
