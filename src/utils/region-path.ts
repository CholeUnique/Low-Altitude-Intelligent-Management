import type { MetadataOption } from '@/api/metadata'

/** 只展示字典中实际存在的层级，不根据编码猜测省市。 */
export function regionPaths(nodes: MetadataOption[]): Map<string, string> {
  const paths = new Map<string, string>()
  const visit = (items: MetadataOption[], parents: string[]) => {
    for (const item of items) {
      const path = item.name ? [...parents, item.name] : parents
      if (item.code && path.length) paths.set(String(item.code), path.join(' / '))
      if (item.children?.length) visit(item.children, path)
    }
  }
  visit(nodes, [])
  return paths
}
