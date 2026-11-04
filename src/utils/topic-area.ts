// Spatial API areaSqm/summary fields and the documented parcel area fields use m².
// Convert only for presentation; API requests, source attributes and exports keep their units.
export const squareMetresToMu = (value: number) => value * 0.0015
export const muToSquareMetres = (value: number) => value / 0.0015

function numeric(value: unknown): number | undefined {
  if (typeof value !== 'number' && typeof value !== 'string') return
  if (typeof value === 'string' && !value.trim()) return
  const number = Number(typeof value === 'string' ? value.replace(/[,，]/g, '') : value)
  return Number.isFinite(number) ? number : undefined
}

export function formatMu(value: unknown): string {
  const number = numeric(value)
  if (number === undefined) return '—'
  if (number > 0 && number < .0001) return '<0.0001'
  return number.toLocaleString('zh-CN', {maximumFractionDigits: Math.abs(number) < 1 ? 4 : 2})
}

export function formatSquareMetresAsMu(value: unknown): string {
  const number = numeric(value)
  return number === undefined ? '—' : formatMu(squareMetresToMu(number))
}

function unitFactor(unit: string): number | undefined {
  switch (unit.trim().toLowerCase().replace(/\s/g, '')) {
    case '亩': case 'mu': return 1
    case '㎡': case 'm²': case 'm2': case '平方米': return .0015
    case '公顷': case 'ha': case 'hm²': case 'hm2': case '㏊': return 15
    case '平方公里': case '平方千米': case 'km²': case 'km2': case '㎢': return 1500
  }
}

export function topicAreaMetric<T extends {value: string; unit: string}>(item: T): T {
  const factor = unitFactor(item.unit)
  if (factor === undefined) return item
  const value = numeric(item.value)
  return {...item, value: factor === 1 ? item.value : formatMu(value === undefined ? undefined : value * factor), unit: '亩'}
}

// Units specified by the uploaded attribute tables, rather than inferred from magnitude.
const squareMetreFields = new Set(['MJ','LZGM','TBMJ','KCMJ','TBDLMJ','YJJBNTTBMJ','YJJBNTMJ','AREASQM'])
export function topicAreaAttribute(name: string, label: string, value: unknown): {label: string; value: string} | undefined {
  const explicit = label.match(/[（(]\s*(亩|mu|㎡|m²|m2|平方米|公顷|ha|hm²|hm2|平方公里|平方千米|km²|km2)\s*[）)]$/i)
  const key = name.toUpperCase()
  const factor = explicit ? unitFactor(explicit[1]!) : key === 'AREAMU' ? 1 : squareMetreFields.has(key) ? .0015 : undefined
  if (factor === undefined) return
  const number = numeric(value)
  return {label: `${explicit ? label.slice(0, explicit.index).trim() : label}（亩）`, value: formatMu(number === undefined ? undefined : number * factor)}
}
