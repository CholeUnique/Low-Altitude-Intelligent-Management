import type { GovernanceTaskComparisonImage } from '@/api/governance-task'

/** 使用任务返回的期次顺序；没有关联影像时不套用其他任务的固定影像。 */
export function taskImageryService(images: GovernanceTaskComparisonImage[] = [], period: 'history' | 'current' = 'current') {
  const services = images.flatMap(image => image.mapService && Number(image.mapService.status) === 1 ? [image.mapService] : [])
  return period === 'history' ? services[0] : services[services.length - 1]
}
