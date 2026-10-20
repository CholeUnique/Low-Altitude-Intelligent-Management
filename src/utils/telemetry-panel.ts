export interface TelemetryPanelBounds { left: number; top: number; width: number; height: number }
export interface TelemetryPanelSize { width: number; height: number }

/** object-fit: contain 下的实际视频画面，不将横/竖黑边算作画面。 */
export function containedVideoBounds(box: TelemetryPanelBounds, videoWidth: number, videoHeight: number): TelemetryPanelBounds {
  if (!(videoWidth > 0 && videoHeight > 0 && box.width > 0 && box.height > 0)
    || !Number.isFinite(videoWidth) || !Number.isFinite(videoHeight)) return box
  const scale = Math.min(box.width / videoWidth, box.height / videoHeight)
  const width = Math.min(box.width, videoWidth * scale), height = Math.min(box.height, videoHeight * scale)
  return { left: box.left + (box.width - width) / 2, top: box.top + (box.height - height) / 2, width, height }
}

export function fitTelemetryPanelSize(size: TelemetryPanelSize, bounds: TelemetryPanelBounds): TelemetryPanelSize {
  // 不设固定像素上限；最大尺寸仅由当前实际视频画面决定。
  const maxWidth = Math.max(1, bounds.width - 16)
  const maxHeight = Math.max(1, bounds.height - 16)
  return { width: Math.max(Math.min(300, maxWidth), Math.min(size.width, maxWidth)),
    height: Math.max(Math.min(250, maxHeight), Math.min(size.height, maxHeight)) }
}

export function placeTelemetryPanel(left: number, top: number, size: TelemetryPanelSize, bounds: TelemetryPanelBounds) {
  const insetX = Math.min(8, Math.max(0, (bounds.width - size.width) / 2))
  const insetY = Math.min(8, Math.max(0, (bounds.height - size.height) / 2))
  return { left: Math.max(bounds.left + insetX, Math.min(left, bounds.left + bounds.width - size.width - insetX)),
    top: Math.max(bounds.top + insetY, Math.min(top, bounds.top + bounds.height - size.height - insetY)) }
}

/** 左下角可向左扩展右上角停靠的小窗；右下角保持左上角不动。 */
export function resizeTelemetryPanel(origin: TelemetryPanelBounds, dx: number, dy: number, edge: 'left' | 'right', bounds: TelemetryPanelBounds) {
  const right = origin.left + origin.width
  const availableWidth = edge === 'left' ? right - bounds.left - 8 : bounds.left + bounds.width - 8 - origin.left
  const availableHeight = bounds.top + bounds.height - 8 - origin.top
  const limits = { left: 0, top: 0, width: availableWidth + 16, height: availableHeight + 16 }
  const size = fitTelemetryPanelSize({ width: origin.width + (edge === 'left' ? -dx : dx), height: origin.height + dy }, limits)
  const position = placeTelemetryPanel(edge === 'left' ? right - size.width : origin.left, origin.top, size, bounds)
  return { ...position, ...size }
}
