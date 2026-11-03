/** 图层没有类型字段时，去掉工程名称末尾的编号以归并同类设施。 */
export function facilityCategoryFromName(name: string): string {
  const value = name.trim()
  if (!value || value === '未命名工程') return '未分类'
  const category = value.replace(/\s*[-－—_＃#]+\s*\d+\s*$/u, '').trim()
  return category || '未分类'
}
