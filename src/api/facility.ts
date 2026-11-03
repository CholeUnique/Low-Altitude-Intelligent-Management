import { apiClient } from './client'

export interface FacilityRecord {
  id: string | number
  facilityNo?: string | null
  name?: string | null
  regionName?: string | null
  villageName?: string | null
  projectName?: string | null
  facilityType?: string | null
  typeName?: string | null
  bizStatus?: string | null
  bizStatusName?: string | null
  updateTime?: string | null
}
export interface FacilityOption { id: string | number; code: string; name: string; children?: FacilityOption[] }
export interface FacilityStatistics {
  totalCount: number
  normalCount: number
  abnormalCount: number
  checkingCount: number
  discardedCount: number
}
export interface FacilityPage { records: FacilityRecord[]; total: number; pageNum: number; pageSize: number }
export interface FacilityQuery { deptId: string; pageNum: number; pageSize: number; keyword?: string; facilityType?: string; bizStatus?: string }

export const getFacilityPage = (query: FacilityQuery) => apiClient.post<never, FacilityPage>('/v1/biz/facility/page', query)
export const getFacilityStatistics = (deptId: string) => apiClient.post<never, FacilityStatistics>('/v1/biz/facility/statistics/overall', { deptId })
export const getFacilityTypes = () => apiClient.post<never, FacilityOption[]>('/v1/biz/facility/type/options', {})
export interface FacilityImportQuery { deptId: string; serviceId: string | number; layerIds: number[]; nameField?: string; projectNameField?: string; villageField?: string; typeField?: string }
export interface FacilityImportReport {
  deptId: string | number; inserted: number; updated: number; skipped: number; typeUnrecognized: number
  layers: { layerId: number; layerName: string; fetched: number; inserted: number; updated: number; skipped: number; unrecognizedTypes: { featureId: string; rawType: string }[] }[]
  suspectDuplicates: { facilityNoA: string; nameA: string; sourceA: string; facilityNoB: string; nameB: string; sourceB: string; reason: string }[]
}
export const previewFacilityImport = (query: FacilityImportQuery) => apiClient.post<never, FacilityImportReport>('/v1/biz/facility/import/layers/preview', query, { timeout: 120000 })
export const importFacilityLayers = (query: FacilityImportQuery) => apiClient.post<never, FacilityImportReport>('/v1/biz/facility/import/layers', query, { timeout: 120000 })
export const getFacilityGeoJson = (query: { deptId: string; minLng?: number; minLat?: number; maxLng?: number; maxLat?: number; bizStatus?: string }) => apiClient.post<never, GeoJSON.FeatureCollection>('/v1/biz/facility/geojson', query)
