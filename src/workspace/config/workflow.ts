import type {
  NonGrainWorkflowActor,
  NonGrainWorkflowNode,
  NonGrainWorkflowNodeKey,
  NonGrainWorkflowNodeStatus,
} from '@/types'

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

export type NonGrainWorkflowTransition =
  | { type: 'skip-rectification-to-archive'; occurredAt?: string }
  | { type: 'return-review-to-rectification'; occurredAt?: string; reason?: string }

export function getNonGrainWorkflowNodeStatus(
  workflow: readonly NonGrainWorkflowNode[] | undefined,
  key: NonGrainWorkflowNodeKey,
): NonGrainWorkflowNodeStatus {
  return workflow?.find((node) => node.key === key)?.status ?? 'pending'
}

export function isNonGrainWorkflowNodeViewableStatus(status: NonGrainWorkflowNodeStatus) {
  return status === 'completed' || status === 'active' || status === 'returned'
}

export function isNonGrainWorkflowNodeOperableStatus(status: NonGrainWorkflowNodeStatus) {
  return status === 'active' || status === 'returned'
}

export function canViewNonGrainWorkflowNode(node: Pick<NonGrainWorkflowNode, 'status'>) {
  return isNonGrainWorkflowNodeViewableStatus(node.status)
}

export function canOperateNonGrainWorkflowNode(
  node: Pick<NonGrainWorkflowNode, 'status' | 'ownerRole' | 'ownerUserId'>,
  actor: NonGrainWorkflowActor | undefined,
) {
  if (!actor || !isNonGrainWorkflowNodeOperableStatus(node.status)) return false
  if (node.ownerUserId) return node.ownerUserId === actor.userId
  return actor.roles.includes(node.ownerRole)
}

/** 返回空字符串表示节点可正常查看；提示只区分未开始和操作权限不足。 */
export function getNonGrainWorkflowNodeHint(
  node: Pick<NonGrainWorkflowNode, 'status' | 'ownerRole' | 'ownerUserId'>,
  actor?: NonGrainWorkflowActor,
) {
  if (!canViewNonGrainWorkflowNode(node)) return '还未进行'
  if (isNonGrainWorkflowNodeOperableStatus(node.status) && !canOperateNonGrainWorkflowNode(node, actor)) {
    return '没有工作权限'
  }
  return ''
}

function cloneNonGrainWorkflow(workflow: readonly NonGrainWorkflowNode[]) {
  return workflow.map((node) => ({ ...node }))
}

/**
 * 现场核查确认无需整改时直接进入结案：完成节点 4，跳过节点 5、6，激活节点 7。
 * 不满足迁移前置状态时原样克隆，保证该函数无副作用。
 */
export function skipNonGrainRectificationToArchive(
  workflow: readonly NonGrainWorkflowNode[],
  occurredAt?: string,
) {
  const current = workflow.find((node) => node.key === 'on-site-verification')
  if (!current || !isNonGrainWorkflowNodeOperableStatus(current.status)) {
    return cloneNonGrainWorkflow(workflow)
  }
  return workflow.map((node): NonGrainWorkflowNode => {
    if (node.key === 'on-site-verification') {
      return { ...node, status: 'completed', completedAt: occurredAt ?? node.completedAt, updatedAt: occurredAt ?? node.updatedAt }
    }
    if (node.key === 'rectification-disposal' || node.key === 'drone-review') {
      return { ...node, status: 'skipped', updatedAt: occurredAt ?? node.updatedAt }
    }
    if (node.key === 'case-archive') {
      return { ...node, status: 'active', startedAt: occurredAt ?? node.startedAt, updatedAt: occurredAt ?? node.updatedAt }
    }
    return { ...node }
  })
}

/**
 * 无人机复核不通过时退回整改：节点 5 标记 returned，节点 6、7 恢复待进行。
 */
export function returnNonGrainReviewToRectification(
  workflow: readonly NonGrainWorkflowNode[],
  reason?: string,
  occurredAt?: string,
) {
  const current = workflow.find((node) => node.key === 'drone-review')
  if (!current || !isNonGrainWorkflowNodeOperableStatus(current.status)) {
    return cloneNonGrainWorkflow(workflow)
  }
  return workflow.map((node): NonGrainWorkflowNode => {
    if (node.key === 'rectification-disposal') {
      return {
        ...node,
        status: 'returned',
        startedAt: node.startedAt ?? occurredAt,
        updatedAt: occurredAt ?? node.updatedAt,
        returnReason: reason,
        completedAt: undefined,
      }
    }
    if (node.key === 'drone-review' || node.key === 'case-archive') {
      return {
        ...node,
        status: 'pending',
        startedAt: undefined,
        completedAt: undefined,
        updatedAt: occurredAt ?? node.updatedAt,
        returnReason: undefined,
      }
    }
    return { ...node }
  })
}

export function transitionNonGrainWorkflow(
  workflow: readonly NonGrainWorkflowNode[],
  transition: NonGrainWorkflowTransition,
) {
  if (transition.type === 'skip-rectification-to-archive') {
    return skipNonGrainRectificationToArchive(workflow, transition.occurredAt)
  }
  return returnNonGrainReviewToRectification(
    workflow,
    transition.reason,
    transition.occurredAt,
  )
}
