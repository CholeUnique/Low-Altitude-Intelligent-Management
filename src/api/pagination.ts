/** 聚合只读分页，避免工作台与本地筛选静默遗漏后续页。 */
export async function collectPages<T>(read: (pageNum: number, pageSize: number) => Promise<{ records: T[]; total: number }>): Promise<T[]> {
  const records: T[] = []
  for (let pageNum = 1; ; pageNum++) {
    const page = await read(pageNum, 200)
    records.push(...page.records)
    if (!page.records.length || records.length >= page.total) return records
  }
}
