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
  canPlayType?: (type: string) => string
  pollMs?: number
  timeoutMs?: number
}

/** 只从配置的 API 服务构造播放地址，避免将令牌发送到返回的外部地址。 */
export function transcodeVideoUrl(mediaId: string, returnedUrl: string): string {
  return authenticatedVideoUrl(mediaId, returnedUrl, 'transcode/file')
}
export function originalVideoUrl(mediaId: string, returnedUrl: string): string {
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
export function canPlayOriginalVideo(codec: string | null | undefined, probe?: (type: string) => string): boolean {
  const value = codec?.trim().toLowerCase()
  if (['h264', 'avc', 'avc1'].includes(value || '')) return true
  if (!['hevc', 'h265', 'hvc1', 'hev1'].includes(value || '')) return false
  const test = probe || (typeof document === 'undefined' ? () => '' : (type: string) => document.createElement('video').canPlayType(type))
  return ['hvc1.1.6.L120.B0', 'hev1.1.6.L120.B0', 'hvc1', 'hev1'].some(type => !!test(`video/mp4; codecs="${type}"`))
}
export async function prepareTranscodedVideo(media: { id: string; localFileUrl?: string; sourceCodec?: string; transcodeStatus?: string | number; transcodeFileUrl?: string }, signal: AbortSignal, onProgress: (progress: number) => void, force = false, options: VideoPreparationOptions = {}): Promise<string> {
  signal.throwIfAborted()
  if (!/^\d+$/.test(media.id)) throw new Error('视频素材编号无效。')
  let localFileUrl = media.localFileUrl, sourceCodec = media.sourceCodec
  const snapshot = (state: TranscodeStatus) => {
    if (state.localFileUrl) localFileUrl = state.localFileUrl
    if (state.sourceCodec) sourceCodec = state.sourceCodec
    const originalUrl = localFileUrl ? originalVideoUrl(media.id, localFileUrl) : undefined
    const raw = state.progress
    const progress = raw != null && String(raw).trim() !== '' && Number.isFinite(Number(raw)) && Number(raw) >= 0 && Number(raw) <= 100 ? Number(raw) : undefined
    options.onUpdate?.({ ...state, progress, localFileUrl, sourceCodec, originalUrl })
    return originalUrl
  }
  const select = (url: string, source: 'original' | 'transcoded') => { signal.throwIfAborted(); options.onSource?.(source); return url }
  const original = snapshot({ status: null })
  if (!force && String(media.transcodeStatus) === '1' && media.transcodeFileUrl) return select(transcodeVideoUrl(media.id, media.transcodeFileUrl), 'transcoded')
  if (!force && original && canPlayOriginalVideo(sourceCodec, options.canPlayType)) return select(original, 'original')
  const request = { mediaId: media.id }
  const deadline = Date.now() + (options.timeoutMs ?? 30 * 60_000)
  let result = await apiClient.post<never, TranscodeStatus>('/v1/uav/media/transcode', request, { signal })
  while (true) {
    signal.throwIfAborted()
    if (!result || typeof result !== 'object') throw new Error('后端未返回有效的视频处理状态。')
    const original = snapshot(result)
    if (result.status === 'SUCCEEDED') {
      if (result.transcodeFileUrl) return select(transcodeVideoUrl(media.id, result.transcodeFileUrl), 'transcoded')
      if (!force && original && canPlayOriginalVideo(sourceCodec, options.canPlayType)) return select(original, 'original')
      throw new Error('转码完成，但后端未返回播放地址。')
    }
    // Original playback remains available even if background transcoding failed.
    if (!force && original && canPlayOriginalVideo(sourceCodec, options.canPlayType)) return select(original, 'original')
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
