export function resolveWorkspaceNodeKey(
  workflow: { key: string; status: string }[] | undefined,
  nodeKeys: string[],
) {
  if (!nodeKeys.length) return ''
  if (!workflow?.length) return nodeKeys[0]!
  const active = workflow.find((item) => item.status === 'active' && nodeKeys.includes(item.key))
  if (active) return active.key
  const done = [...workflow].reverse().find((item) => item.status === 'done' && nodeKeys.includes(item.key))
  return done?.key ?? nodeKeys[0]!
}

export function getWorkflowNodeStatus(
  workflow: { key: string; status: string }[] | undefined,
  key: string,
) {
  return workflow?.find((item) => item.key === key)?.status ?? 'pending'
}

/** 已完成节点与当前节点可进入，后续 pending 节点锁定。 */
export function isWorkspaceNodeAccessible(
  workflow: { key: string; status: string }[] | undefined,
  key: string,
  nodeKeys: string[],
) {
  if (!nodeKeys.includes(key)) return false
  if (!workflow?.length) return key === nodeKeys[0]
  const status = getWorkflowNodeStatus(workflow, key)
  return status === 'done' || status === 'active'
}
