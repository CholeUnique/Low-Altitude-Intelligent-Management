import rawPortalData from './portal-data.json'
import type {
  DashboardMapLayer,
  DronePatrolRoute,
  Organization,
  OrganizationId,
  PortalAlert,
  PortalCase,
  PortalData,
  PortalTask,
  Role,
  RoleId,
  Scene,
} from '@/types'

export const portalData = rawPortalData as PortalData

export function getOrganization(id: OrganizationId): Organization {
  return portalData.organizations.find((item) => item.id === id) ?? portalData.organizations[0]!
}

export function getRole(id: RoleId): Role {
  return portalData.roles.find((item) => item.id === id) ?? portalData.roles[0]!
}

export function getScene(organization: Organization, sceneId?: string): Scene | undefined {
  return organization.scenes.find((item) => item.id === sceneId)
}

export function getTasks(organizationId: OrganizationId, sceneId?: string): PortalTask[] {
  return portalData.tasks.filter((task) =>
    task.organizationId === organizationId && (!sceneId || task.sceneId === sceneId),
  )
}

export function getTask(taskId: string): PortalTask | undefined {
  return portalData.tasks.find((task) => task.id === taskId)
}

export function getAlerts(organizationId: OrganizationId, sceneId?: string): PortalAlert[] {
  return portalData.alerts.filter((alert) =>
    alert.organizationId === organizationId && (!sceneId || alert.sceneId === sceneId),
  )
}

export function getCases(organizationId: OrganizationId, sceneId?: string): PortalCase[] {
  return portalData.cases.filter((item) =>
    item.organizationId === organizationId && (!sceneId || item.sceneId === sceneId),
  )
}

export function getSceneProgress(organization: Organization) {
  return organization.scenes.map((scene) => {
    const tasks = getTasks(organization.id, scene.id)
    const completed = tasks.filter((task) => task.status === '已完成').length
    const averageProgress = tasks.length
      ? Math.round(tasks.reduce((sum, task) => sum + task.progress, 0) / tasks.length)
      : 0
    return {
      id: scene.id,
      name: scene.shortName,
      planned: Math.max(tasks.length * 32, 20),
      completed: Math.round(Math.max(tasks.length * 32, 20) * averageProgress / 100),
      rate: completed === tasks.length && tasks.length ? 100 : averageProgress,
    }
  })
}

const mapLayerColors = ['#23d7f0', '#ffb43c', '#8e7dff', '#38e0a8', '#ff6f86', '#4d9dff']

export function getDashboardMapLayers(organization: Organization, sceneId?: string): DashboardMapLayer[] {
  return organization.scenes
    .filter((scene) => !sceneId || scene.id === sceneId)
    .map((scene) => {
      const index = organization.scenes.findIndex((item) => item.id === scene.id)
      const tasks = getTasks(organization.id, scene.id)
      return {
        id: scene.id,
        name: scene.shortName,
        color: mapLayerColors[index % mapLayerColors.length]!,
        count: tasks.length,
        tasks: tasks.map((task) => {
          const lng = task.coordinates.reduce((sum, point) => sum + point[0], 0) / task.coordinates.length
          const lat = task.coordinates.reduce((sum, point) => sum + point[1], 0) / task.coordinates.length
          return {
            taskId: task.id,
            name: task.name,
            area: task.area,
            status: task.status,
            center: [lng, lat] as [number, number],
            polygon: task.coordinates,
          }
        }),
      }
    })
}

export function getDronePatrolRoutes(organizationId: OrganizationId, sceneId?: string): DronePatrolRoute[] {
  return getTasks(organizationId, sceneId)
    .filter((task) => task.status === '进行中' || task.status === '待复核')
    .slice(0, 4)
    .map((task, index) => {
      const polygon = task.coordinates
      const route = polygon.flatMap((point, pointIndex) => {
        const next = polygon[(pointIndex + 1) % polygon.length]!
        return [
          point,
          [(point[0] + next[0]) / 2, (point[1] + next[1]) / 2] as [number, number],
        ]
      })
      return {
        id: `route-${task.id}`,
        name: `${task.area}巡航路线`,
        droneId: `DR-${String(index + 17).padStart(3, '0')}`,
        status: '巡航中',
        progress: task.progress,
        coordinates: route,
      }
    })
}

export function addSessionTask(task: PortalTask) {
  portalData.tasks.unshift(task)
}
