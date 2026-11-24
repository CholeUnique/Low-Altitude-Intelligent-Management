import { apiClient } from '@/api/client'

interface TranscodeStatus {
  status: 'RUNNING' | 'SUCCEEDED' | 'FAILED' | null
  progress?: number
  error?: string
  transcodeFileUrl?: string
}

/** 只从配置的 API 服务构造播放地址，避免将令牌发送到返回的外部地址。 */
export function transcodeVideoUrl(mediaId: string, returnedUrl: string): string {
  if (!/^\d+$/.test(mediaId)) throw new Error('视频素材编号无效。')
  const path = new URL(returnedUrl, window.location.origin).pathname
  if (path !== `/api/v1/uav/media/transcode/file/${mediaId}` && path !== `/v1/uav/media/transcode/file/${mediaId}`) throw new Error('后端返回的转码播放地址无效。')
  const base = new URL(apiClient.defaults.baseURL || '/api', window.location.origin)
  const url = new URL(`${base.pathname.replace(/\/$/, '')}/v1/uav/media/transcode/file/${mediaId}`, base.origin)
  const token = localStorage.getItem('access_token')
  if (token) url.searchParams.set('token', token)
  return url.href
}

export async function prepareTranscodedVideo(media: { id: string; transcodeStatus?: string | number; transcodeFileUrl?: string }, signal: AbortSignal, onProgress: (progress: number) => void, force = false): Promise<string> {
  if (!/^\d+$/.test(media.id)) throw new Error('视频素材编号无效。')
  if (!force && String(media.transcodeStatus) === '1' && media.transcodeFileUrl) return transcodeVideoUrl(media.id, media.transcodeFileUrl)
  const request = { mediaId: media.id }
  let result = await apiClient.post<never, TranscodeStatus>('/v1/uav/media/transcode', request, { signal })
  while (true) {
    if (signal.aborted) throw new DOMException('已取消', 'AbortError')
    if (result.status === 'SUCCEEDED') {
      if (!result.transcodeFileUrl) throw new Error('转码完成，但后端未返回播放地址。')
      return transcodeVideoUrl(media.id, result.transcodeFileUrl)
    }
    if (result.status === 'FAILED') throw new Error(result.error || '视频转码失败。')
    if (result.status !== 'RUNNING') throw new Error('后端返回了未知的转码状态。')
    onProgress(Math.max(0, Math.min(100, Number(result.progress) || 0)))
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { signal.removeEventListener('abort', cancel); resolve() }, 2000)
      function cancel() { clearTimeout(timer); reject(new DOMException('已取消', 'AbortError')) }
      signal.addEventListener('abort', cancel, { once: true })
      if (signal.aborted) cancel()
    })
    result = await apiClient.post<never, TranscodeStatus>('/v1/uav/media/transcode/status', request, { signal })
  }
}
