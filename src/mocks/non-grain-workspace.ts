import type {
  NonGrainWorkflowActor,
  NonGrainWorkflowNode,
  NonGrainWorkflowNodeKey,
} from '@/types'
import type { GovernanceTask } from '@/api/governance-task'

export interface NonGrainPlot {
  id: string
  landType: '苗木' | '果园' | '养殖坑塘'
  area: number
  location: string
  owner: string
  confirmation: string
  coordinates: [number, number][]
}

export interface NonGrainImageryPhase {
  id: string
  name: string
  capturedAt: string
  source: string
  resolution: string
  imageUrl: string
  description: string
}

export interface NonGrainFormField {
  key: string
  label: string
  value: string | number | boolean | string[]
  required?: boolean
}

export interface NonGrainPageForm {
  nodeKey: NonGrainWorkflowNodeKey
  title: string
  status: '已提交' | '填写中' | '待填写'
  fields: NonGrainFormField[]
}

export interface NonGrainMaterial {
  id: string
  nodeKey: NonGrainWorkflowNodeKey
  name: string
  category: string
  fileType: string
  size: string
  uploader: string
  uploadedAt: string
  status: '有效' | '待补充'
}

export interface NonGrainWorkspaceContext {
  task: {
    id: string
    taskNo: string
    name: string
    sceneId: 'non-grain-monitoring'
    area: string
    totalArea: number
    source: string
    priority: '高'
    createdAt: string
    deadline: string
    department: string
  }
  currentNodeKey: NonGrainWorkflowNodeKey
  currentActor: NonGrainWorkflowActor
  plots: NonGrainPlot[]
  workflow: NonGrainWorkflowNode[]
  summary: {
    plotCount: number
    totalArea: number
    completedNodeCount: number
    currentNodeName: string
    riskLevel: '高风险'
    conclusion: string
  }
  imageryPhases: NonGrainImageryPhase[]
  forms: Record<NonGrainWorkflowNodeKey, NonGrainPageForm>
  materials: NonGrainMaterial[]
}

export const NON_GRAIN_MOCK_TASK_ID = 'NFNL-20260923-001'

export const nonGrainWorkspaceMock: NonGrainWorkspaceContext = {
  task: {
    id: NON_GRAIN_MOCK_TASK_ID,
    taskNo: NON_GRAIN_MOCK_TASK_ID,
    name: '九龙镇耕地种植用途变化核查任务',
    sceneId: 'non-grain-monitoring',
    area: '九龙镇界沟村、姚家村',
    totalArea: 13.66,
    source: '2026 年第三季度卫片变化监测',
    priority: '高',
    createdAt: '2026-09-23 09:20',
    deadline: '2026-10-15 18:00',
    department: '耕地保护监督科',
  },
  currentNodeKey: 'on-site-verification',
  currentActor: {
    userId: 'user-field-chen',
    roles: ['field-inspector'],
  },
  plots: [
    {
      id: 'TB-NFNL-001',
      landType: '苗木',
      area: 8.42,
      location: '九龙镇界沟村三组',
      owner: '界沟村股份经济合作社',
      confirmation: '疑似占用永久基本农田种植景观苗木',
      coordinates: [[119.9182, 32.4715], [119.9226, 32.4728], [119.9241, 32.4691], [119.9193, 32.4679]],
    },
    {
      id: 'TB-NFNL-002',
      landType: '果园',
      area: 3.16,
      location: '九龙镇界沟村五组',
      owner: '陈某某',
      confirmation: '疑似新增果树种植',
      coordinates: [[119.9291, 32.4652], [119.9322, 32.4664], [119.9334, 32.4638], [119.9301, 32.4629]],
    },
    {
      id: 'TB-NFNL-003',
      landType: '养殖坑塘',
      area: 2.08,
      location: '九龙镇姚家村二组',
      owner: '姚家村股份经济合作社',
      confirmation: '疑似耕地开挖形成养殖坑塘',
      coordinates: [[119.9402, 32.4781], [119.9433, 32.4787], [119.9441, 32.4762], [119.9410, 32.4755]],
    },
  ],
  workflow: [
    { key: 'task-acceptance', name: '任务受理', order: 1, status: 'completed', ownerRole: 'task-acceptor', ownerUserId: 'user-accept-li', ownerName: '李敏', startedAt: '2026-09-23 09:20', completedAt: '2026-09-23 09:36', updatedAt: '2026-09-23 09:36' },
    { key: 'section-preliminary-review', name: '科室初核', order: 2, status: 'completed', ownerRole: 'section-reviewer', ownerUserId: 'user-review-zhou', ownerName: '周颖', startedAt: '2026-09-23 09:36', completedAt: '2026-09-23 11:15', updatedAt: '2026-09-23 11:15' },
    { key: 'department-confirmation', name: '部门确认', order: 3, status: 'completed', ownerRole: 'department-approver', ownerUserId: 'user-dept-wang', ownerName: '王磊', startedAt: '2026-09-23 11:15', completedAt: '2026-09-24 09:05', updatedAt: '2026-09-24 09:05' },
    { key: 'on-site-verification', name: '现场核查', order: 4, status: 'active', ownerRole: 'field-inspector', ownerUserId: 'user-field-chen', ownerName: '陈浩', startedAt: '2026-09-24 09:05', updatedAt: '2026-09-25 16:40' },
    { key: 'rectification-disposal', name: '整改处置', order: 5, status: 'pending', ownerRole: 'rectification-manager', ownerUserId: 'user-rectify-zhao', ownerName: '赵晨' },
    { key: 'drone-review', name: '无人机复核', order: 6, status: 'pending', ownerRole: 'drone-reviewer', ownerUserId: 'user-drone-sun', ownerName: '孙宇' },
    { key: 'case-archive', name: '结案归档', order: 7, status: 'pending', ownerRole: 'archive-manager', ownerUserId: 'user-archive-wu', ownerName: '吴静' },
  ],
  summary: {
    plotCount: 3,
    totalArea: 13.66,
    completedNodeCount: 3,
    currentNodeName: '现场核查',
    riskLevel: '高风险',
    conclusion: '三处图斑合计 13.66 亩，均需现场核验现状、权属及是否占用永久基本农田。',
  },
  imageryPhases: [
    {
      id: 'IMG-BASE-202508',
      name: '历史基准影像',
      capturedAt: '2025-08-18 10:30',
      source: '自然资源卫星影像',
      resolution: '0.5m',
      imageUrl: '/mock/non-grain/imagery-baseline.jpg',
      description: '基准时相显示三处图斑均为连片耕作状态。',
    },
    {
      id: 'IMG-DISCOVERY-202609',
      name: '疑似变化影像',
      capturedAt: '2026-09-20 14:10',
      source: '季度卫片监测',
      resolution: '0.3m',
      imageUrl: '/mock/non-grain/imagery-discovery.jpg',
      description: '识别出苗木、果园和养殖坑塘三类种植用途变化。',
    },
    {
      id: 'IMG-VERIFY-202609',
      name: '现场核查航拍',
      capturedAt: '2026-09-25 15:42',
      source: 'Mavic 3E 核查航拍',
      resolution: '2.8cm',
      imageUrl: '/mock/non-grain/imagery-verification.jpg',
      description: '现场核查时相，用于确认边界、面积与实际利用现状。',
    },
  ],
  forms: {
    'task-acceptance': {
      nodeKey: 'task-acceptance',
      title: '任务受理单',
      status: '已提交',
      fields: [
        { key: 'source', label: '任务来源', value: '2026 年第三季度卫片变化监测', required: true },
        { key: 'acceptor', label: '受理人', value: '李敏', required: true },
        { key: 'acceptedAt', label: '受理时间', value: '2026-09-23 09:36', required: true },
        { key: 'urgency', label: '紧急程度', value: '高' },
      ],
    },
    'section-preliminary-review': {
      nodeKey: 'section-preliminary-review',
      title: '科室初核意见',
      status: '已提交',
      fields: [
        { key: 'reviewer', label: '初核人', value: '周颖', required: true },
        { key: 'plotCount', label: '疑似图斑数', value: 3, required: true },
        { key: 'area', label: '疑似面积（亩）', value: 13.66, required: true },
        { key: 'opinion', label: '初核意见', value: '影像变化明显，建议转部门确认并开展现场核查。', required: true },
      ],
    },
    'department-confirmation': {
      nodeKey: 'department-confirmation',
      title: '部门确认单',
      status: '已提交',
      fields: [
        { key: 'department', label: '确认部门', value: '耕地保护监督科', required: true },
        { key: 'approver', label: '确认人', value: '王磊', required: true },
        { key: 'issueType', label: '问题类型', value: ['苗木种植', '果园种植', '养殖坑塘'], required: true },
        { key: 'requirement', label: '办理要求', value: '逐图斑核实权属、现状、发生时间及基本农田占用情况。', required: true },
      ],
    },
    'on-site-verification': {
      nodeKey: 'on-site-verification',
      title: '现场核查记录',
      status: '填写中',
      fields: [
        { key: 'inspector', label: '核查人', value: '陈浩', required: true },
        { key: 'verifiedAt', label: '核查时间', value: '2026-09-25 14:30', required: true },
        { key: 'weather', label: '现场天气', value: '晴，东北风 2 级' },
        { key: 'gps', label: '定位校验', value: true, required: true },
        { key: 'result', label: '核查结果', value: '已完成三处边界踏勘，待补充责任主体签字。', required: true },
      ],
    },
    'rectification-disposal': {
      nodeKey: 'rectification-disposal',
      title: '整改处置记录',
      status: '待填写',
      fields: [
        { key: 'responsibleParty', label: '整改责任主体', value: '', required: true },
        { key: 'measure', label: '整改措施', value: '', required: true },
        { key: 'deadline', label: '整改期限', value: '', required: true },
        { key: 'completion', label: '整改完成情况', value: '' },
      ],
    },
    'drone-review': {
      nodeKey: 'drone-review',
      title: '无人机复核记录',
      status: '待填写',
      fields: [
        { key: 'flightTask', label: '复核飞行任务', value: '', required: true },
        { key: 'capturedAt', label: '复核影像时间', value: '', required: true },
        { key: 'comparison', label: '前后时相比对', value: '' },
        { key: 'conclusion', label: '复核结论', value: '', required: true },
      ],
    },
    'case-archive': {
      nodeKey: 'case-archive',
      title: '结案归档单',
      status: '待填写',
      fields: [
        { key: 'caseNo', label: '案卷编号', value: '', required: true },
        { key: 'archiveCategory', label: '归档类别', value: '非粮化监测闭环档案', required: true },
        { key: 'conclusion', label: '结案意见', value: '', required: true },
        { key: 'archivedAt', label: '归档时间', value: '' },
      ],
    },
  },
  materials: [
    { id: 'MAT-001', nodeKey: 'task-acceptance', name: '第三季度疑似变化图斑清单.xlsx', category: '任务来源', fileType: 'XLSX', size: '86 KB', uploader: '系统', uploadedAt: '2026-09-23 09:20', status: '有效' },
    { id: 'MAT-002', nodeKey: 'task-acceptance', name: '非粮化监测任务书.pdf', category: '任务文书', fileType: 'PDF', size: '1.2 MB', uploader: '李敏', uploadedAt: '2026-09-23 09:34', status: '有效' },
    { id: 'MAT-003', nodeKey: 'section-preliminary-review', name: '多时相影像比对报告.pdf', category: '初核材料', fileType: 'PDF', size: '5.8 MB', uploader: '周颖', uploadedAt: '2026-09-23 11:08', status: '有效' },
    { id: 'MAT-004', nodeKey: 'department-confirmation', name: '部门确认意见单.pdf', category: '确认材料', fileType: 'PDF', size: '620 KB', uploader: '王磊', uploadedAt: '2026-09-24 09:04', status: '有效' },
    { id: 'MAT-005', nodeKey: 'on-site-verification', name: '现场核查照片.zip', category: '现场影像', fileType: 'ZIP', size: '24.6 MB', uploader: '陈浩', uploadedAt: '2026-09-25 16:32', status: '有效' },
    { id: 'MAT-006', nodeKey: 'on-site-verification', name: '责任主体签字确认单.pdf', category: '核查文书', fileType: 'PDF', size: '0 KB', uploader: '陈浩', uploadedAt: '-', status: '待补充' },
    { id: 'MAT-007', nodeKey: 'rectification-disposal', name: '整改通知书.pdf', category: '整改材料', fileType: 'PDF', size: '0 KB', uploader: '-', uploadedAt: '-', status: '待补充' },
    { id: 'MAT-008', nodeKey: 'drone-review', name: '无人机复核成果.zip', category: '复核影像', fileType: 'ZIP', size: '0 KB', uploader: '-', uploadedAt: '-', status: '待补充' },
    { id: 'MAT-009', nodeKey: 'case-archive', name: '结案归档目录.pdf', category: '归档材料', fileType: 'PDF', size: '0 KB', uploader: '-', uploadedAt: '-', status: '待补充' },
  ],
}

function cloneContext(context: NonGrainWorkspaceContext): NonGrainWorkspaceContext {
  return JSON.parse(JSON.stringify(context)) as NonGrainWorkspaceContext
}

/** 为路由中的任意任务 ID 创建相互隔离的完整 Mock 上下文。 */
export function createNonGrainWorkspaceContext(
  taskId = NON_GRAIN_MOCK_TASK_ID,
): NonGrainWorkspaceContext {
  const context = cloneContext(nonGrainWorkspaceMock)
  context.task.id = taskId
  return context
}

export const getNonGrainWorkspaceContext = createNonGrainWorkspaceContext

/** “我的待办”固定演示任务：仅用于前端展示，不会调用后端创建接口。 */
export function createNonGrainTodoTask(
  assigneeId: string,
  deptId?: string,
  deptName = '海陵区农业农村局',
): GovernanceTask {
  return {
    id: NON_GRAIN_MOCK_TASK_ID,
    taskNo: NON_GRAIN_MOCK_TASK_ID,
    sceneCode: 'NON_GRAIN_MONITORING',
    sceneName: '耕地种植用途管控与“非粮化”动态监测',
    name: nonGrainWorkspaceMock.task.name,
    deptId: deptId || 'agriculture-rural-demo',
    deptName,
    refType: 'NONE',
    executeMode: 'MANUAL',
    taskStatus: 1,
    taskStatusDesc: '现场核查中',
    priority: 2,
    planStartTime: '2026-09-23T09:20:00',
    planEndTime: '2026-10-15T18:00:00',
    actualStartTime: '2026-09-24T09:05:00',
    assigneeId,
    createBy: assigneeId,
    createTime: '2026-09-23T09:20:00',
    updateTime: '2026-09-25T16:40:00',
    area: nonGrainWorkspaceMock.task.area,
    areaSize: nonGrainWorkspaceMock.task.totalArea,
  }
}
