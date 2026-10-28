import { apiClient } from './client'

export interface MetadataType {
  id: string
  code: string
  name: string
  description?: string
  maxLevel: number
  sort: number
  status: number
  preset?: number
  createTime?: string
  updateTime?: string
}

export interface MetadataItem {
  id: string
  typeId: string
  parentId?: string
  code: string
  name: string
  level: number
  sort: number
  status: number
  remark?: string
  createTime?: string
  updateTime?: string
}

export interface MetadataTreeNode {
  id: string
  code: string
  name: string
  level: number
  sort: number
  status: number
  children?: MetadataTreeNode[]
}

export interface MetadataOption {
  id: string
  code: string
  name: string
  children?: MetadataOption[]
}

export interface SceneAbnormalTypeMeta {
  sceneCode: string
  typeCode: string
  typeExists: boolean
  items: MetadataItem[]
  effectiveOptions: Array<{ code: string; name: string }>
}

export interface SceneAbnormalTypeInput {
  sceneCode: string
  code: string
  name: string
  sort?: number
  remark?: string
}

export interface MetadataTypeInput {
  code: string
  name: string
  description?: string
  maxLevel?: number
  sort?: number
  status?: number
}

export interface MetadataItemInput {
  typeId: string
  parentId?: string
  code: string
  name: string
  sort?: number
  remark?: string
}

function withoutEmpty<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== '' && item !== undefined)) as T
}

export function getMetadataTypes(query: { keyword?: string; status?: number | '' } = {}) {
  return apiClient.post<never, MetadataType[]>('/v1/metadata/type/list', withoutEmpty(query))
}

export function getMetadataTypeDetail(id: string) {
  return apiClient.post<never, MetadataType>('/v1/metadata/type/detail', { id })
}

export function addMetadataType(input: MetadataTypeInput) {
  return apiClient.post<never, MetadataType>('/v1/metadata/type/add', input)
}

export function updateMetadataType(input: Partial<MetadataTypeInput> & { id: string }) {
  return apiClient.post<never, void>('/v1/metadata/type/update', input)
}

export function updateMetadataTypeStatus(id: string, status: number) {
  return apiClient.post<never, void>('/v1/metadata/type/status', { id, status })
}

export function deleteMetadataType(id: string) {
  return apiClient.post<never, void>('/v1/metadata/type/delete', { id })
}

export function getMetadataItems(query: { typeCode: string; parentId?: string; keyword?: string; status?: number | '' }) {
  return apiClient.post<never, MetadataItem[]>('/v1/metadata/item/list', withoutEmpty(query))
}

export function getMetadataTree(typeCode: string, onlyEnable = false) {
  return apiClient.post<never, MetadataTreeNode[]>('/v1/metadata/tree', { typeCode, onlyEnable })
}

export function getMetadataOptions(typeCode: string) {
  return apiClient.post<never, MetadataOption[]>('/v1/metadata/options', { typeCode, onlyEnable: true })
}

export function getMetadataItemDetail(id: string) {
  return apiClient.post<never, MetadataItem>('/v1/metadata/item/detail', { id })
}

export function addMetadataItem(input: MetadataItemInput) {
  return apiClient.post<never, MetadataItem>('/v1/metadata/item/add', input)
}

export function updateMetadataItem(input: Pick<MetadataItemInput, 'code' | 'name' | 'sort' | 'remark'> & { id: string }) {
  return apiClient.post<never, void>('/v1/metadata/item/update', input)
}

export function updateMetadataItemStatus(id: string, status: number) {
  return apiClient.post<never, void>('/v1/metadata/item/status', { id, status })
}

export function deleteMetadataItem(id: string) {
  return apiClient.post<never, void>('/v1/metadata/item/delete', { id })
}

/** 场景异常类型专用接口。类型池由后端按 sceneCode 自动创建并校验部门管理员权限。 */
export function getSceneAbnormalTypes(sceneCode: string) {
  return apiClient.post<never, SceneAbnormalTypeMeta>('/v1/metadata/abnormal-type/list', { sceneCode })
}

export function addSceneAbnormalType(input: SceneAbnormalTypeInput) {
  return apiClient.post<never, { code: string; name: string }>('/v1/metadata/abnormal-type/item/add', input)
}

export function updateSceneAbnormalType(input: Pick<MetadataItemInput, 'name' | 'sort' | 'remark'> & { id: string }) {
  return apiClient.post<never, void>('/v1/metadata/abnormal-type/item/update', input)
}

export function updateSceneAbnormalTypeStatus(id: string, status: number) {
  return apiClient.post<never, void>('/v1/metadata/abnormal-type/item/status', { id, status })
}

export function deleteSceneAbnormalType(id: string) {
  return apiClient.post<never, void>('/v1/metadata/abnormal-type/item/delete', { id })
}
