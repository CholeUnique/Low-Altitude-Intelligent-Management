import { MAX_SRT_BYTES, videoTelemetryPoint, type VideoTelemetryPoint } from './video-telemetry'

export interface SrtField { name: string; value: string }
export interface SrtRecord {
  ordinal: number
  sequence: string
  timeRange: string
  start: number
  end: number
  validTime: boolean
  text: string
  raw: string
  fields: SrtField[]
  point?: VideoTelemetryPoint
  relativeAltitude?: number
  recordedAt: string
}
export interface SrtDocument { records: SrtRecord[]; fields: string[]; duration: number; gpsCount: number; validTimeCount: number; altitudeMin?: number; altitudeMax?: number }

function time(value: string) {
  const match = /^(\d+):([0-5]\d):([0-5]\d)[,.](\d{3})$/.exec(value)
  return match ? Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4]) / 1000 : NaN
}

export function srtField(record: SrtRecord, names: string): string {
  const aliases = names.toLowerCase().split('|')
  return record.fields.find(item => aliases.includes(item.name.toLowerCase()))?.value || '—'
}

/** 保留所有字幕记录和原文；没有 GPS、未知字段和无效时间的记录不被悄悄删除。 */
export function inspectSrt(source: string): SrtDocument {
  if (source.length > MAX_SRT_BYTES) throw new Error('SRT 文件过大，请选择 20 MB 以内的文件。')
  const normalized = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
  const pattern = /^(?:(\d+)[ \t]*\n)?(\d+:\d{2}:\d{2}[,.]\d{3})[ \t]*-->[ \t]*(\d+:\d{2}:\d{2}[,.]\d{3})[^\n]*\n/gm
  const matches = [...normalized.matchAll(pattern)]
  if (matches.length > 200_000) throw new Error('SRT 超过 20 万条记录，请分段后查看。')
  const fields = new Set<string>()
  let gpsCount = 0, validTimeCount = 0, first = Infinity, last = -Infinity, altitudeMin = Infinity, altitudeMax = -Infinity
  const records = matches.map((match, index): SrtRecord => {
    const raw = normalized.slice(match.index!, matches[index + 1]?.index ?? normalized.length).trim()
    const text = normalized.slice(match.index! + match[0].length, matches[index + 1]?.index ?? normalized.length).replace(/<[^>]*>/g, '').trim()
    const start = time(match[2]!), end = time(match[3]!)
    const validTime = Number.isFinite(start) && Number.isFinite(end) && end > start
    const parsedFields: SrtField[] = []
    for (const item of text.matchAll(/(?:^|[\s\[\],])([A-Za-z_][\w.-]*)\s*[:=]\s*([^\[\]\n]*?)(?=\s+[A-Za-z_][\w.-]*\s*[:=]|[\[\]\n]|$)/g)) {
      parsedFields.push({ name: item[1]!, value: item[2]!.trim().replace(/[,;]\s*$/, '') })
      fields.add(item[1]!)
    }
    for (const item of text.matchAll(/\b([A-Za-z_][\w.]*)\s*\(([^()]*)\)/g)) {
      parsedFields.push({ name: item[1]!, value: item[2]!.trim() }); fields.add(item[1]!)
    }
    const altitudeValue = parsedFields.find(item => /^(rel_alt|relative_altitude)$/i.test(item.name))?.value
    const altitudeNumber = altitudeValue?.match(/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:\s*m)?$/i) ? Number.parseFloat(altitudeValue) : undefined
    const altitude = altitudeNumber !== undefined && Number.isFinite(altitudeNumber) ? altitudeNumber : undefined
    const point = videoTelemetryPoint(start, end, text)
    if (point) gpsCount++
    if (validTime) { validTimeCount++; first = Math.min(first, start); last = Math.max(last, end) }
    if (altitude !== undefined && Number.isFinite(altitude)) { altitudeMin = Math.min(altitudeMin, altitude); altitudeMax = Math.max(altitudeMax, altitude) }
    return { ordinal: index, sequence: match[1] || String(index + 1), timeRange: `${match[2]} → ${match[3]}`, start, end, validTime, text, raw, fields: parsedFields, point, relativeAltitude: altitude,
      recordedAt: text.match(/\b\d{4}[-/]\d{2}[-/]\d{2}[ T]\d{2}:\d{2}:\d{2}(?:[,.]\d{3})?/)?.[0] || '' }
  })
  return { records, fields: [...fields], duration: validTimeCount ? last - first : 0, gpsCount, validTimeCount,
    altitudeMin: Number.isFinite(altitudeMin) ? altitudeMin : undefined, altitudeMax: Number.isFinite(altitudeMax) ? altitudeMax : undefined }
}

export function formatSrtTime(seconds: number, milliseconds = false): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—'
  const value = Math.round(seconds * 1000)
  const hours = Math.floor(value / 3600000), minutes = Math.floor(value / 60000) % 60, wholeSeconds = Math.floor(value / 1000) % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(wholeSeconds).padStart(2, '0')}${milliseconds ? `.${String(value % 1000).padStart(3, '0')}` : ''}`
}

/** 高度趋势仅抽稀绘制，所有记录依然可在明细/原文中访问；缺失高度处断开。 */
export function srtAltitudePath(document: SrtDocument): string {
  if (document.altitudeMin === undefined || document.altitudeMax === undefined) return ''
  const span = Math.max(.01, document.altitudeMax - document.altitudeMin)
  const step = Math.max(1, Math.ceil(document.records.length / 500))
  const first = document.records.reduce((minimum, item) => item.validTime ? Math.min(minimum, item.start) : minimum, Infinity)
  let drawing = false, path = ''
  document.records.forEach((item, index) => {
    if (!item.validTime || item.relativeAltitude === undefined) { drawing = false; return }
    if (index % step && drawing && index !== document.records.length - 1) return
    const x = 12 + Math.max(0, Math.min(1, (item.start - first) / Math.max(.001, document.duration))) * 776
    const y = 110 - (item.relativeAltitude - document.altitudeMin!) / span * 90
    path += `${drawing ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)} `
    drawing = true
  })
  return path
}
