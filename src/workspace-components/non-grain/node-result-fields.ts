const schemas: Record<string, Array<[string, string]>> = {
  'department-confirmation': [['opinion', '审核意见']],
  'on-site-verification': [['landUse', '实际耕地用途'], ['checkTime', '核查时间'], ['checker', '核查人员'], ['description', '备注 / 描述'], ['attachment', '核查凭证附件'], ['result', '核查结论']],
  'rectification-disposal': [['description', '整改说明'], ['attachment', '整改成果附件'], ['result', '整改结论']],
  'drone-review': [['description', '核实描述'], ['attachment', '核实凭证附件'], ['result', '复核结论']],
}
export function nodeResultFields(nodeKey: string, data: unknown) {
  const record = data && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : {}
  const conclusionLabels: Record<string, string> = { NO_PROBLEM: '无问题', PROBLEM: '有问题', DONE: '整改完成', FORWARD: '下发', REJECT: '驳回' }
  return (schemas[nodeKey] || []).map(([key, label]) => {
    const value = record[key]
    return { label, value: value == null || value === '' ? '暂无数据' : key === 'result' ? conclusionLabels[String(value)] || '暂无结论说明' : typeof value === 'object' ? JSON.stringify(value) : String(value) }
  })
}
