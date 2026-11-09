export interface AlgorithmCatalogEntry {
  id: string
  family: string
  capability: string
  category: string
  scene: string
  tags: readonly string[]
}

export interface CapabilityGroup {
  title: string
  items: string[]
}

// These are capabilities described by existing catalog entries, not new algorithms.
const additionalCapabilities: Record<string, readonly string[]> = {
  'sp-overlay': ['相交分析'],
  'sp-range': ['包含判断'],
  'sp-clip': ['相交分析', '提取'],
}

export function matchesAlgorithmCapability(model: AlgorithmCatalogEntry, capability: string) {
  return !capability
    || model.capability === capability
    || model.category === capability
    || (model.family === 'ai' && model.scene === capability)
    || model.tags.includes(capability)
    || (additionalCapabilities[model.id]?.includes(capability) ?? false)
}

export function availableCapabilityGroups(models: readonly AlgorithmCatalogEntry[], groups: readonly CapabilityGroup[]) {
  return groups.map(group => ({
    ...group,
    items: group.items.filter(item => models.some(model => matchesAlgorithmCapability(model, item))),
  })).filter(group => group.items.length > 0)
}
