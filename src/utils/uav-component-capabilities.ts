export interface UavComponentCapability {
  available?: boolean
  targetId?: string
  reason?: string
}
export interface UavComponentCapabilities {
  waylineEdit?: UavComponentCapability
  cockpit?: UavComponentCapability
  trajectoryPlayback?: UavComponentCapability
}

export function parseComponentCapabilities(value: unknown): UavComponentCapabilities | undefined {
  if (!value || typeof value !== 'object') return undefined
  const source = value as Record<string, unknown>
  const result: UavComponentCapabilities = {}
  for (const key of ['waylineEdit', 'cockpit', 'trajectoryPlayback'] as const) {
    const raw = source[key]
    if (!raw || typeof raw !== 'object') continue
    const item = raw as Record<string, unknown>
    result[key] = {
      available: typeof item.available === 'boolean' ? item.available : undefined,
      targetId: typeof item.targetId === 'string' || (typeof item.targetId === 'number' && Number.isSafeInteger(item.targetId))
        ? String(item.targetId).trim() : undefined,
      reason: typeof item.reason === 'string' ? item.reason.trim() : undefined,
    }
  }
  return result
}

/** 可用性只采信后端能力字段；业务记录 ID 和任务 status 不替代组件目标 ID。 */
export function componentSelectionState(capability: UavComponentCapability | undefined) {
  const targetId = capability?.targetId
  const validTarget = Boolean(targetId && /^\d+$/.test(targetId) && /[1-9]/.test(targetId))
  const available = capability?.available === true && validTarget
  return {
    availability: available ? 'available' as const : 'unavailable' as const,
    targetId: available ? targetId : undefined,
    unavailableReason: available ? undefined : capability?.reason || (
      capability?.available === undefined ? '后端未提供组件可用信息，请刷新后重试'
        : capability.available && !validTarget ? '后端未提供有效的组件目标 ID'
          : '当前记录暂不可打开该组件'),
  }
}
