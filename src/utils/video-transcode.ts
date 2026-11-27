import { apiClient } from '@/api/client'

export interface TranscodeStatus {
  status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | null
  progress?: number
  error?: string
  transcodeFileUrl?: string
  localFileUrl?: string | null
  sourceCodec?: string | null
}
export interface VideoPreparationState extends TranscodeStatus { originalUrl?: string }
interface VideoPreparationOptions {
  onUpdate?: (state: VideoPreparationState) => void
  onSource?: (source: 'original' | 'transcoded') => void
  pollMs?: number
  timeoutMs?: number
}

/** 只从配置的 API 服务构造播放地址，避免将令牌发送到返回的外部地址。 */
export function transcodeVideoUrl(mediaId: string, returnedUrl: string): string {
  return authenticatedVideoUrl(mediaId, returnedUrl, 'transcode/file')
}
export function originalVideoUrl(mediaId: string, returnedUrl = `/api/v1/uav/media/file/${mediaId}`): string {
  return authenticatedVideoUrl(mediaId, returnedUrl, 'file')
}
function authenticatedVideoUrl(mediaId: string, returnedUrl: string, kind: 'file' | 'transcode/file'): string {
  if (!/^\d+$/.test(mediaId)) throw new Error('视频素材编号无效。')
  const path = new URL(returnedUrl, window.location.origin).pathname
  if (path !== `/api/v1/uav/media/${kind}/${mediaId}` && path !== `/v1/uav/media/${kind}/${mediaId}`) throw new Error('后端返回的视频文件地址无效。')
  const base = new URL(apiClient.defaults.baseURL || '/api', window.location.origin)
  const url = new URL(`${base.pathname.replace(/\/$/, '')}/v1/uav/media/${kind}/${mediaId}`, base.origin)
  const token = localStorage.getItem('access_token')
  if (token) url.searchParams.set('token', token)
  return url.href
}
async function checkOriginalVideo(url: string, signal: AbortSignal): Promise<void> {
  // 只请求一个字节来区分视频流与 HTTP 200 的业务错误 JSON。
  // 即使服务器忽略 Range，也在收到响应头后取消流，不能将整部视频读成 Blob。
  const controller = new AbortController()
  const cancel = () => controller.abort(signal.reason)
  signal.addEventListener('abort', cancel, { once: true })
  if (signal.aborted) cancel()
  const timer = setTimeout(() => controller.abort(new Error('原视频文件接口响应超时，请稍后重试。')), 15_000)
  let response: Response | undefined
  try {
    response = await fetch(url, { headers: { Range: 'bytes=0-0' }, signal: controller.signal, cache: 'no-store' })
    const type = response.headers.get('content-type') || ''
    if (type.includes('json')) {
      const payload = await response.json() as { code?: string | number; msg?: string }
      throw new Error(`原视频读取失败${payload.code != null ? `（${payload.code}）` : ''}：${payload.msg || '接口未返回视频文件。'}`)
    }
    if (!response.ok) throw new Error(`原视频读取失败（HTTP ${response.status}）。`)
    if (type.includes('text/') || type.includes('xml')) throw new Error('原视频接口未返回视频流，请检查文件服务。')
  } finally {
    await response?.body?.cancel().catch(() => {})
    clearTimeout(timer)
    signal.removeEventListener('abort', cancel)
  }
}
export async function prepareTranscodedVideo(media: { id: string; localFileUrl?: string; sourceCodec?: string; transcodeStatus?: string | number; transcodeFileUrl?: string }, signal: AbortSignal, onProgress: (progress: number) => void, force = false, options: VideoPreparationOptions = {}): Promise<string> {
  signal.throwIfAborted()
  if (!/^\d+$/.test(media.id)) throw new Error('视频素材编号无效。')
  let localFileUrl = media.localFileUrl, sourceCodec = media.sourceCodec
  const snapshot = (state: TranscodeStatus) => {
    if (state.localFileUrl) localFileUrl = state.localFileUrl
    if (state.sourceCodec) sourceCodec = state.sourceCodec
    const originalUrl = originalVideoUrl(media.id)
    const raw = state.progress
    const progress = raw != null && String(raw).trim() !== '' && Number.isFinite(Number(raw)) && Number(raw) >= 0 && Number(raw) <= 100 ? Number(raw) : undefined
    options.onUpdate?.({ ...state, progress, localFileUrl, sourceCodec, originalUrl })
    return originalUrl
  }
  const select = (url: string, source: 'original' | 'transcoded') => { signal.throwIfAborted(); options.onSource?.(source); return url }
  const original = snapshot({ status: null })
  // 原片接口按素材 ID 直接读取，浏览器自己发 GET / Range 请求。
  // 不依赖 localFileUrl、编码探测或转码任务；实际播放失败后才准备兼容版。
  if (!force) {
    await checkOriginalVideo(original, signal)
    return select(original, 'original')
  }
  const request = { mediaId: media.id }
  const deadline = Date.now() + (options.timeoutMs ?? 30 * 60_000)
  let result = await apiClient.post<never, TranscodeStatus>('/v1/uav/media/transcode', request, { signal })
  while (true) {
    signal.throwIfAborted()
    if (!result || typeof result !== 'object') throw new Error('后端未返回有效的视频处理状态。')
    snapshot(result)
    if (result.status === 'SUCCEEDED') {
      if (result.transcodeFileUrl) return select(transcodeVideoUrl(media.id, result.transcodeFileUrl), 'transcoded')
      throw new Error('转码完成，但后端未返回播放地址。')
    }
    if (result.status === 'FAILED') throw new Error(result.error || '视频转码失败。')
    if (!['PENDING', 'RUNNING'].includes(result.status || '')) throw new Error('后端返回了未知的转码状态。')
    if (result.progress != null && Number.isFinite(Number(result.progress)) && String(result.progress).trim() !== '' && Number(result.progress) >= 0 && Number(result.progress) <= 100) onProgress(Number(result.progress))
    signal.throwIfAborted()
    if (Date.now() >= deadline) throw new Error('后端视频处理长时间未完成，可下载原片，或稍后重试查询转码结果。')
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { signal.removeEventListener('abort', cancel); resolve() }, options.pollMs ?? 2000)
      function cancel() { clearTimeout(timer); reject(new DOMException('已取消', 'AbortError')) }
      signal.addEventListener('abort', cancel, { once: true })
      if (signal.aborted) cancel()
    })
    result = await apiClient.post<never, TranscodeStatus>('/v1/uav/media/transcode/status', request, { signal })
  }
}
