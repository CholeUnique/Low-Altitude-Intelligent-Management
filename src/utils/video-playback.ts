/** 画面单击切换播放；原生控制条仍由浏览器处理，不重复切换。 */
export async function toggleVideoSurfacePlayback(event: MouseEvent): Promise<boolean> {
  const video = event.currentTarget as HTMLVideoElement | null
  if (!video || event.defaultPrevented || event.button !== 0 || event.target !== video) return false
  const bounds = video.getBoundingClientRect()
  // 控制条的事件可能被重定向到 video，保留底部控制区域的默认交互。
  if (video.controls && event.detail > 0 && event.clientY >= bounds.bottom - Math.min(56, bounds.height / 4)) return false
  event.preventDefault()
  if (video.paused || video.ended) await video.play()
  else video.pause()
  return true
}
