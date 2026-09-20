import { apiClient, isMockMode } from './client'

export interface GovernanceResultFile {
  id: string
  fileName: string
  fileRole?: string
  fileRoleDesc?: string
  fileExt?: string
  fileSize?: number
  createTime?: string
}

export interface GovernanceResult {
  id: string
  bizTaskId: string
  sceneCode: string
  resultType: string
  collectTime?: string
  operator?: string
  fileCount: number
  parseStatus?: number
  parseStatusDesc: string
  createTime?: string
  files: GovernanceResultFile[]
  process?: {
    parseRetryCount?: number
    parseErrorMsg?: string
    parseTime?: string
    parsedRef?: string
    keyInfoJson?: string
    uploadBy?: string
  } | null
}

export interface GovernanceResultPageQuery {
  pageNum: number
  pageSize: number
  bizTaskId?: string
  sceneCode?: string
  resultType?: string
  parseStatus?: number
  startTime?: string
  endTime?: string
}

export interface GovernanceResultPage {
  records: GovernanceResult[]
  total: number
  pageNum: number
  pageSize: number
}

export interface TaskEvidenceImage {
  id: string
  fileName: string
  mediaType: 'photo' | 'video' | string
  imageUrl?: string
  originalUrl?: string
  thumbnailUrl?: string
  longitude?: number
  latitude?: number
  relativeAltitude?: number
  absoluteAltitude?: number
  shootTime?: string
  downloadStatus?: number
  fileCleaned?: number
}

interface BizResultFileDto {
  id?: string | number
  fileName?: string
  fileRole?: string
  fileRoleDesc?: string
  fileExt?: string
  fileSize?: number
  createTime?: string
}

interface BizResultDto {
  id: string | number
  bizTaskId?: string | number
  sceneCode?: string
  resultType?: string
  collectTime?: string
  operator?: string
  fileCount?: number
  parseStatus?: number
  parseStatusDesc?: string
  createTime?: string
  files?: BizResultFileDto[]
  process?: {
    parseRetryCount?: number
    parseErrorMsg?: string
    parseTime?: string
    parsedRef?: string
    keyInfoJson?: string
    uploadBy?: string | number
  } | null
}

interface BizImageDto {
  mediaId?: string | number
  fileName?: string
  mediaType?: string
  imageUrl?: string
  originalUrl?: string
  thumbnailUrl?: string
  lng?: number
  lat?: number
  relativeAltitude?: number
  absoluteAltitude?: number
  shootTime?: string
  downloadStatus?: number
  fileCleaned?: number
}

function toResultFile(item: BizResultFileDto): GovernanceResultFile {
  return {
    id: item.id === undefined ? '' : String(item.id),
    fileName: item.fileName || '未命名文件',
    fileRole: item.fileRole,
    fileRoleDesc: item.fileRoleDesc,
    fileExt: item.fileExt,
    fileSize: item.fileSize,
    createTime: item.createTime,
  }
}

function toGovernanceResult(item: BizResultDto): GovernanceResult {
  return {
    id: String(item.id),
    bizTaskId: item.bizTaskId === undefined ? '' : String(item.bizTaskId),
    sceneCode: item.sceneCode || '',
    resultType: item.resultType || '未分类成果',
    collectTime: item.collectTime,
    operator: item.operator,
    fileCount: item.fileCount || 0,
    parseStatus: item.parseStatus,
    parseStatusDesc: item.parseStatusDesc || '未知状态',
    createTime: item.createTime,
    files: (item.files || []).map(toResultFile),
    process: item.process ? {
      parseRetryCount: item.process.parseRetryCount,
      parseErrorMsg: item.process.parseErrorMsg,
      parseTime: item.process.parseTime,
      parsedRef: item.process.parsedRef,
      keyInfoJson: item.process.keyInfoJson,
      uploadBy: item.process.uploadBy === undefined ? undefined : String(item.process.uploadBy),
    } : null,
  }
}

function toEvidenceImage(item: BizImageDto): TaskEvidenceImage {
  return {
    id: item.mediaId === undefined ? '' : String(item.mediaId),
    fileName: item.fileName || '未命名影像',
    mediaType: item.mediaType || 'photo',
    imageUrl: item.imageUrl,
    originalUrl: item.originalUrl,
    thumbnailUrl: item.thumbnailUrl,
    longitude: item.lng,
    latitude: item.lat,
    relativeAltitude: item.relativeAltitude,
    absoluteAltitude: item.absoluteAltitude,
    shootTime: item.shootTime,
    downloadStatus: item.downloadStatus,
    fileCleaned: item.fileCleaned,
  }
}

export async function getGovernanceResultPage(query: GovernanceResultPageQuery): Promise<GovernanceResultPage> {
  if (isMockMode()) return { records: [], total: 0, pageNum: query.pageNum, pageSize: query.pageSize }
  const page = await apiClient.post<never, {
    records?: BizResultDto[]
    total?: number | string
    pageNum?: number
    pageSize?: number
  }>('/v1/biz/result/page', query)
  return {
    records: (page.records || []).map(toGovernanceResult),
    total: Number(page.total || 0),
    pageNum: page.pageNum || query.pageNum,
    pageSize: page.pageSize || query.pageSize,
  }
}

export async function getGovernanceResultDetail(resultId: string): Promise<GovernanceResult> {
  const data = await apiClient.post<never, BizResultDto>('/v1/biz/result/detail', { id: resultId })
  return toGovernanceResult(data)
}

/**
 * R12 影像接口读取的是任务关联飞行任务的 UAV 素材，不等同于成果上传文件。
 */
export async function getTaskEvidenceImages(bizTaskId: string): Promise<TaskEvidenceImage[]> {
  if (isMockMode()) return []
  const data = await apiClient.post<never, BizImageDto[]>('/v1/biz/result/image/list', {
    bizTaskId,
    onlyWithLocation: false,
  })
  return (data || []).map(toEvidenceImage)
}
