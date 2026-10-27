export function getPlatformBrand(organizationId?: string) {
  return organizationId === 'agriculture-rural'
    ? { title: '耕地数字化监管平台', subtitle: 'CULTIVATED LAND DIGITAL SUPERVISION PLATFORM' }
    : { title: '海陵区自然资源综合监管平台', subtitle: 'COMPREHENSIVE SUPERVISION · GIS COMMAND CENTER' }
}
