import type { Organization, Scene } from '@/types'
import { resolveWorkspaceSceneId } from '@/workspace/config/registry'

function normalizeSceneKey(value?: string) {
  return value?.trim().toLocaleLowerCase().replace(/[\s_()（）“”'"-]/g, '') || ''
}

/**
 * 将后端场景编码/名称归并为当前单位配置的场景。
 * 部门接口偶尔返回不同的编码格式，因此先用工作台别名归一，再比对编码、全称和简称。
 */
export function findOrganizationScene(organization: Organization, sceneCode?: string, sceneName?: string): Scene | undefined {
  const resolvedId = normalizeSceneKey(resolveWorkspaceSceneId(sceneCode || '', sceneName))
  const receivedKeys = new Set([
    resolvedId,
    normalizeSceneKey(sceneCode),
    normalizeSceneKey(sceneName),
  ].filter(Boolean))

  return organization.scenes.find((scene) => [
    normalizeSceneKey(scene.id),
    normalizeSceneKey(scene.name),
    normalizeSceneKey(scene.shortName),
  ].some((key) => receivedKeys.has(key)))
}

interface UnitScopedTask {
  sceneCode?: string
  sceneName?: string
  deptId?: string
  deptName?: string
}

/**
 * 后端部门筛选异常时的前端兜底：任务既要属于当前单位的场景，也要属于当前部门。
 * 缺少部门字段的旧记录仅按场景判断，避免误伤历史数据。
 */
export function isTaskVisibleForOrganization(
  organization: Organization,
  task: UnitScopedTask,
  activeDeptId?: string,
) {
  if (!findOrganizationScene(organization, task.sceneCode, task.sceneName)) return false

  const deptName = task.deptName?.trim()
  // 任务接口的 deptId 在部分版本中是数字主键或历史 ID，不能优先拿它与
  // 切换接口返回的部门 ID 做严格比较；有名称时以名称作为可靠的展示隔离依据。
  if (deptName && deptName !== '-') {
    return deptName.includes(organization.shortName)
    || deptName.includes(organization.name)
    || organization.name.includes(deptName)
  }
  return !activeDeptId || !task.deptId || task.deptId === activeDeptId
}
