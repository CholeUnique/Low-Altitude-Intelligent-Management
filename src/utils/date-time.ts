/** 后端无时区的 LocalDateTime 已是北京时间；带时区的时间戳则转换到北京。 */
export function formatBeijingDateTime(value?: string | number | null): string {
  if (value == null || value === '') return '-'
  const raw = String(value).trim()
  const local = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.\d+)?$/.exec(raw)
  if (local) return `${local[1]} ${local[2]}`
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return raw.replace('T', ' ')
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date)
  const pick = (type: string) => parts.find((part) => part.type === type)?.value || ''
  return `${pick('year')}-${pick('month')}-${pick('day')} ${pick('hour')}:${pick('minute')}:${pick('second')}`
}
