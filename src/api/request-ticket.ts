import { apiClient, isMockMode } from '@/api/client'

export interface RequestTicketTypeOption {
  id: string
  name: string
}

export interface RequestTicket {
  id: string
  name: string
  number?: string
  type?: string
  description?: string
  priority?: number
  status?: number
  requester?: string
  contactPerson?: string
  contactNumber?: string
  frequency?: string
  startTime?: string
  endTime?: string
  createTime?: string
  createByName?: string
  resultTypes?: string[]
  scope?: { type: string; coordinates: number[][][] }
}

export interface RequestTicketPageQuery {
  pageNum: number
  pageSize: number
  name?: string
  type?: string
  priority?: number
  status?: number
}

export interface AddRequestTicketPayload {
  name: string
  type: string
  description?: string
  resultTypes?: string[]
  requester?: string
  contactPerson?: string
  contactNumber?: string
  startTime?: number
  endTime?: number
  frequency?: string
  priority?: number
}

function optionalNumber(value: unknown) {
  if (value === undefined || value === null || value === '') return undefined
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

function toTicket(item: Record<string, unknown>): RequestTicket {
  return {
    id: String(item.id ?? ''),
    name: String(item.name ?? '--'),
    number: item.number == null ? undefined : String(item.number),
    type: item.type == null ? undefined : String(item.type),
    description: item.description == null ? undefined : String(item.description),
    priority: optionalNumber(item.priority),
    status: optionalNumber(item.status),
    requester: item.requester == null ? undefined : String(item.requester),
    contactPerson: (item.contact_person ?? item.contactPerson) == null ? undefined : String(item.contact_person ?? item.contactPerson),
    contactNumber: (item.contact_number ?? item.contactNumber) == null ? undefined : String(item.contact_number ?? item.contactNumber),
    frequency: item.frequency == null ? undefined : String(item.frequency),
    startTime: (item.start_time ?? item.startTime) == null ? undefined : String(item.start_time ?? item.startTime),
    endTime: (item.end_time ?? item.endTime) == null ? undefined : String(item.end_time ?? item.endTime),
    createTime: (item.create_time ?? item.createTime) == null ? undefined : String(item.create_time ?? item.createTime),
    createByName: (item.create_by_name ?? item.createByName) == null ? undefined : String(item.create_by_name ?? item.createByName),
    resultTypes: Array.isArray(item.result_types ?? item.resultTypes) ? (item.result_types ?? item.resultTypes) as string[] : [],
    scope: item.scope && typeof item.scope === 'object' ? item.scope as RequestTicket['scope'] : undefined,
  }
}

export async function getRequestTicketTypes(): Promise<RequestTicketTypeOption[]> {
  if (isMockMode()) return []
  const data = await apiClient.post<never, Array<Record<string, unknown>>>('/v1/uav/request-ticket/type/options', {})
  return (data || []).filter((item) => item.is_deleted !== true).map((item) => ({
    id: String(item.id ?? item.name ?? ''),
    name: String(item.name ?? ''),
  })).filter((item) => item.name)
}

export async function getRequestTicketPage(query: RequestTicketPageQuery) {
  if (isMockMode()) return { records: [] as RequestTicket[], total: 0, pageNum: query.pageNum, pageSize: query.pageSize }
  const data = await apiClient.post<never, { records?: Array<Record<string, unknown>>; total?: number; pageNum?: number; pageSize?: number }>('/v1/uav/request-ticket/page', query)
  return {
    records: (data.records || []).map(toTicket),
    total: Number(data.total || 0),
    pageNum: Number(data.pageNum || query.pageNum),
    pageSize: Number(data.pageSize || query.pageSize),
  }
}

export async function getRequestTicketDetail(id: string): Promise<RequestTicket> {
  const data = await apiClient.post<never, Record<string, unknown>>('/v1/uav/request-ticket/detail', { id })
  return toTicket(data || {})
}

export async function addRequestTicket(payload: AddRequestTicketPayload): Promise<string> {
  const id = await apiClient.post<never, string | number>('/v1/uav/request-ticket/add', payload)
  return String(id)
}

export async function deleteRequestTicket(id: string): Promise<void> {
  await apiClient.post('/v1/uav/request-ticket/delete', { id })
}
