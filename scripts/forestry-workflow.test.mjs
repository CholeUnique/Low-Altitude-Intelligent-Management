import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

function load(source, dependencies) {
  const module = { exports: {} }
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText
  new Function('require', 'module', 'exports', output)((name) => {
    if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`)
    return dependencies[name]
  }, module, module.exports)
  return module.exports
}

const state = load(readFileSync('src/utils/task-workflow-state.ts', 'utf8'), {
  '../workspace/config/non-grain-workflow': load(readFileSync('src/workspace/config/non-grain-workflow.ts', 'utf8'), {}),
})
const common = load(readFileSync('src/workspace/config/common.ts', 'utf8'), {})
const forestry = load(readFileSync('src/utils/forestry-workflow.ts', 'utf8'), { './task-workflow-state': state })
const supply = load(readFileSync('src/utils/supply-workflow.ts', 'utf8'), { './task-workflow-state': state })

const node = (nodeKey, status, id, extra = {}) => ({ id, bizTaskId: '900', nodeKey, nodeType: 'REVIEW', nodeName: nodeKey, status, ...extra })
const flow = {
  flowInstanceId: 'f1',
  flowKey: 'DEFAULT_FLOW',
  status: 'RUNNING',
  currentNode: node('RECTIFY_DEFAULT', 'PROCESSING', 'n2', { assigneeId: '1' }),
  timeline: [node('REVIEW_OWNER', 'COMPLETED', 'n1'), node('RECTIFY_DEFAULT', 'PROCESSING', 'n2')],
}
const finished = { flowInstanceId: 'f2', flowKey: 'DEFAULT_FLOW', status: 'FINISHED', timeline: [node('REVIEW_OWNER', 'COMPLETED', 'n1'), node('RECTIFY_DEFAULT', 'COMPLETED', 'n2')] }

// ---------- 林业执法 ----------
assert.deepEqual(forestry.FORESTRY_WORKSPACE_BACKEND_KEY, {
  'task-dispatch': 'REVIEW_OWNER',
  'field-inspection': 'RECTIFY_DEFAULT',
  'review-archive': 'FINISH_DEFAULT',
})
assert.equal(forestry.forestryBackendKey('task-dispatch'), 'REVIEW_OWNER')
assert.equal(forestry.forestryBackendKey('spot-identification'), undefined)
assert.equal(forestry.forestryWorkspaceKey('review_owner'), 'task-dispatch', '后端 nodeKey 大小写不一致也能命中')
assert.equal(forestry.forestryWorkspaceKey('DISTRICT_DISPATCH'), 'task-dispatch')
const districtFlow = { flowKey: 'FOREST_LAW_ENFORCE_FLOW', status: 'RUNNING', currentNode: node('DISTRICT_DISPATCH', 'PROCESSING', '129'), timeline: [node('DISTRICT_DISPATCH', 'PROCESSING', '129')] }
assert.equal(forestry.forestryNodeInstance(districtFlow, 'task-dispatch').id, '129')
assert.equal(forestry.forestryNodeStatus(districtFlow, 'task-dispatch'), 'active')
assert.equal(forestry.isForestryNodeAvailable(districtFlow, 'task-dispatch'), true)
assert.equal(forestry.forestryWorkspaceKey('UNKNOWN'), undefined)

assert.equal(forestry.forestryNodeStatus(flow, 'task-dispatch'), 'completed')
assert.equal(forestry.forestryNodeStatus(flow, 'field-inspection'), 'active')
assert.equal(forestry.forestryNodeStatus(flow, 'review-archive'), 'pending')
assert.equal(forestry.forestryNodeInstance(flow, 'field-inspection').id, 'n2')
assert.equal(forestry.forestryNodeInstance(flow, 'review-archive'), undefined)
assert.equal(forestry.forestryNodeStatus(finished, 'review-archive'), 'completed', '流程结束后验收节点不挂起')

// 转办/退回会留下同一节点多条记录：旧实例已结束，当前实例以 currentNode 为准。
const retried = {
  ...flow,
  currentNode: node('RECTIFY_DEFAULT', 'PROCESSING', 'n9'),
  timeline: [...flow.timeline, node('RECTIFY_DEFAULT', 'COMPLETED', 'n2'), node('RECTIFY_DEFAULT', 'PROCESSING', 'n9')],
}
assert.equal(forestry.forestryNodeInstance(retried, 'field-inspection').id, 'n9')

assert.equal(forestry.isForestryNodeAvailable(undefined, 'task-dispatch'), true, '流程未启动时科室下发仍可进入')
assert.equal(forestry.isForestryNodeAvailable(undefined, 'field-inspection'), false, '流程未启动时实地考察不可进入')
assert.equal(forestry.isForestryNodeAvailable(flow, 'field-inspection'), true)
assert.equal(forestry.isForestryNodeAvailable(flow, 'review-archive'), false)
assert.equal(forestry.isForestryNodeAvailable(finished, 'review-archive'), true, '流程结束后验收节点可回看')

const forestryConfig = load(readFileSync('src/workspace/config/forestry.ts', 'utf8'), { './common': common })
const forestryKeys = forestryConfig.forestryConfig.nodes.map((item) => item.key)
for (const key of Object.keys(forestry.FORESTRY_WORKSPACE_BACKEND_KEY)) {
  assert.ok(forestryKeys.includes(key), `林业工作台缺少节点：${key}`)
}
assert.deepEqual(forestryConfig.forestryConfig.nodes.map((item) => item.order), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], '林业节点顺序需连续')
for (const [backend, workspace] of Object.entries({ SECTION_DISPATCH: 'section-dispatch', FIELD_COLLECT: 'field-inspection', SECTION_AUDIT: 'section-audit', RECTIFY_FOREST: 'forest-rectify', SECTION_RECHECK: 'section-recheck', FINISH_FOREST: 'forest-finish' })) {
  assert.equal(forestry.forestryWorkspaceKey(backend), workspace)
  assert.equal(forestry.forestryNodeStatus({ status: 'RUNNING', currentNode: node(backend, 'PROCESSING', 'x'), timeline: [] }, workspace), 'active')
}
assert.equal(forestryConfig.forestryConfig.nodes.find((item) => item.key === 'field-inspection').component, 'FieldInspection')

// ---------- 土地供后巡查与履约分析 ----------
assert.deepEqual(supply.SUPPLY_WORKSPACE_BACKEND_KEY, {
  'supply-inspection-dispatch': 'REVIEW_OWNER',
  'supply-on-site-verification': 'RECTIFY_DEFAULT',
  'supply-disposal-archive': 'FINISH_DEFAULT',
})
assert.equal(supply.supplyWorkspaceKey('review_owner'), 'supply-inspection-dispatch')
assert.equal(supply.supplyNodeStatus(flow, 'supply-inspection-dispatch'), 'completed')
assert.equal(supply.supplyNodeStatus(flow, 'supply-on-site-verification'), 'active')
assert.equal(supply.supplyNodeStatus(finished, 'supply-disposal-archive'), 'completed')
assert.equal(supply.isSupplyNodeAvailable(undefined, 'supply-inspection-dispatch'), true)
assert.equal(supply.isSupplyNodeAvailable(undefined, 'supply-on-site-verification'), false)
assert.equal(supply.isSupplyNodeAvailable(flow, 'supply-disposal-archive'), false)
assert.equal(supply.isSupplyNodeAvailable(flow, 'supply-project-matching'), true, '本地分析节点不受流程限制')
assert.equal(supply.showsSupplyImagery('supply-on-site-verification'), true)
assert.equal(supply.showsSupplyImagery('supply-inspection-dispatch'), false)

const supplyConfig = load(readFileSync('src/workspace/config/land-supply-inspection.ts', 'utf8'), { './common': common })
const supplyNodes = supplyConfig.landSupplyInspectionConfig.nodes
assert.deepEqual(supplyNodes.map((item) => item.key), [
  'route-flight-plan', 'realtime-cruise',
  'supply-project-matching', 'supply-performance-analysis',
  'supply-inspection-dispatch', 'supply-on-site-verification', 'supply-disposal-archive',
], '供后巡查节点顺序')
assert.deepEqual(supplyNodes.map((item) => item.order), [1, 2, 3, 4, 5, 6, 7])
for (const key of Object.keys(supply.SUPPLY_WORKSPACE_BACKEND_KEY)) {
  assert.ok(supplyNodes.some((item) => item.key === key), `供后巡查工作台缺少节点：${key}`)
}
assert.equal(supplyNodes.find((item) => item.key === 'supply-project-matching').component, 'SupplyProjectMatching')
assert.equal(supplyNodes.find((item) => item.key === 'supply-performance-analysis').component, 'SupplyPerformance')

// ---------- 办理页与工作台接线 ----------
const panelSource = readFileSync('src/workspace-components/shared/DefaultWorkflowPanel.vue', 'utf8')
assert.match(panelSource, /<slot[\s\S]{0,160}?name="context"[\s\S]{0,160}?selectedSpot: activeSpot/, '办理面板需提供上下文插槽承载影像对比')
assert.match(panelSource, /class="material-upload"[\s\S]*?type="file" multiple/, '材料上传保留在办理面板内')

const boundSource = readFileSync('src/workspace-components/scene/BoundWorkflowNode.vue', 'utf8')
assert.match(boundSource, /#context="\{ task: workflowTask, selectedSpot/, '影像对比读取任务影像与当前图斑')
assert.match(boundSource, /:has-evidence="Boolean\(selectedNode\?\.files\?\.length\)"/, '附图状态取自当前节点材料')

const compareSource = readFileSync('src/workspace-components/forestry/ForestryBeforeAfter.vue', 'utf8')
assert.match(compareSource, /整改前影像|暂无整改前影像/, '缺少整改前影像时明确提示')
assert.match(compareSource, /spot\?\.imageUrl/, '整改后无独立影像时回退现场照片')

const viewSource = readFileSync('src/views/WorkspaceView.vue', 'utf8')
assert.match(viewSource, /isSupplyWorkspace/, '工作台需识别供后巡查场景')
assert.match(viewSource, /getWorkspaceConfig\(dedicatedSceneId\)/, '专属场景使用各自节点配置')
assert.match(viewSource, /showsSupplyImagery/, '供后巡查的影像节点由绑定配置决定')
assert.match(viewSource, /BoundWorkflowNode/, '绑定节点复用通用办理页')

// 未启动流程时不能把整个工作台变成白板：要么落在本场景首个办理节点，要么给出启动入口。
assert.match(viewSource, /defaultNodeKey: 'task-dispatch'/, '林业默认落在科室下发')
assert.match(viewSource, /defaultNodeKey: 'supply-inspection-dispatch'/, '供后巡查默认落在核查下发')
assert.match(viewSource, /if \(flow\?\.defaultNodeKey\) return flow\.defaultNodeKey/, '未映射到流程实例时用本场景首个办理节点兜底')
assert.match(viewSource, /startTaskWorkflow/, '未启动流程时提供启动入口')
assert.match(viewSource, /class="workflow-notice"/, '未启动流程时的提示条')

console.log('场景流程绑定：林业执法与土地供后巡查的节点、状态、可进入性与工作台接线一致')
