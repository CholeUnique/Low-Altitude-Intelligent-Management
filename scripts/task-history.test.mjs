import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import ts from 'typescript'
function load(file) {
  const source = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const module = { exports: {} }
  new Function('require', 'module', 'exports', source)(id => load(resolve(dirname(file), id + '.ts')), module, module.exports)
  return module.exports
}
const { buildTaskHistory } = load('src/utils/task-history.ts')
const task = { id: '1318', name: '核查任务', sceneCode: 'CULTIVATED_LAND_USE_CONTROL', createTime: '2026-10-07T10:25:35' }
const spots = [{ id: '440', title: '农田', abnormalTypeDesc: '其他', foundTime: '2026-10-06T10:00:00', longitude: 119.84, latitude: 32.49 }]
const nodes = [
  { id: '5', nodeKey: 'REVIEW_CITY', nodeName: '市级审核', nodeType: 'REVIEW', status: 'COMPLETED', assigneeId: '692', assigneeName: '农田建设科', submitTime: '2026-10-07T10:36:19', resultData: { result: 'FORWARD', opinion: '建议下发', targetAssigneeName: '海陵区农业农村局', targetAssigneeId: '694', deadline: '2026-10-21T10:36:00' } },
  { id: '6', nodeKey: 'REVIEW_COUNTY', nodeName: '区县审核', nodeType: 'REVIEW', status: 'COMPLETED', assigneeId: '694', assigneeName: '海陵区农业农村局', prevNodeInstId: '5', submitTime: '2026-10-08T11:54:22', resultData: { opinion: '核查', result: 'FORWARD', abnormalIds: ['440'], targetAssigneeId: '720' } },
  { id: '10', nodeKey: 'IMPLEMENT', nodeName: '实地核查', nodeType: 'IMPLEMENT', status: 'COMPLETED', assigneeId: '720', assigneeName: '九龙镇张巷村网格员', prevNodeInstId: '6', submitTime: '2026-10-08T12:04:00', resultData: { result: 'PROBLEM', description: '休耕已成荒地', plotResults: [{ abnormalId: '440', result: 'PROBLEM', description: '休耕已成荒地' }] } },
  { id: '11', nodeKey: 'RECTIFY', nodeName: '线下整改', nodeType: 'RECTIFY', status: 'COMPLETED', assigneeId: '744', assigneeName: '区农业局的农田建设股', prevNodeInstId: '10', submitTime: '2026-10-08T12:29:01', resultData: { result: 'DONE', description: '地块已重新种满小麦' } },
  { id: '14', nodeKey: 'UAV_RECHECK', nodeName: '无人机复核', nodeType: 'UAV_RECHECK', status: 'PROCESSING', assigneeId: '692', assigneeName: '农田建设科', prevNodeInstId: '11' },
]
const logs = [{ id: '2613', operateType: 'WORKFLOW_FORWARD', operateTypeDesc: '下发指派', operateDesc: '节点[实地核查]提交，流转至[线下整改]', operatorName: '九龙镇张巷村网格员', createTime: '2026-10-08T12:03:59', detailJson: '{"toNode":"RECTIFY","assigneeId":"744","fromNode":"IMPLEMENT"}' }, { id: '2612', operateType: 'WORKFLOW_SUBMIT', operateTypeDesc: '节点提交', operateDesc: '节点[实地核查]上传附件 1 个', operatorName: '九龙镇张巷村网格员', createTime: '2026-10-08T12:03:56' }]
const flow = { timeline: nodes }
const entries = buildTaskHistory(task, logs, flow, spots)
assert.equal(entries[0].title, '发现疑似图斑')
assert.ok(entries[0].content.join('').includes('119.84'))
assert.equal(entries.filter(entry => entry.id === 'log:2613').length, 0, 'Deduplicate workflow submission and routing log despite one-second timestamp skew')
assert.ok(entries.some(entry => entry.id === 'log:2612'), 'Preserve independent attachment upload event')
const inspection = entries.find(entry => entry.id === 'node:10')
assert.equal(inspection.actor, '九龙镇张巷村网格员')
assert.ok(inspection.content.join('').includes('有问题图斑'))
assert.equal(inspection.content.filter(line => line.includes('休耕已成荒地')).length, 1)
assert.ok(inspection.content.join('').includes('区农业局的农田建设股'))
assert.ok(entries.find(entry => entry.id === 'node:5').content.join('').includes('建议下发'))
assert.ok(entries.find(entry => entry.id === 'node:6').content.join('').includes('九龙镇张巷村网格员'))
assert.equal(entries.some(entry => entry.id === 'node:14'), false, 'Pending node must not fabricate completed work')
const output = JSON.stringify(entries)
for (const field of ['toNode', 'assigneeId', 'fromNode', 'REVIEW_CITY', 'UAV_RECHECK', 'RECTIFY']) assert.equal(output.includes(field), false, field)
const repeat = buildTaskHistory(task, [], { timeline: [...nodes, { ...nodes[3], id: '21', submitTime: '2026-10-09T12:00:00', resultData: { description: '再次整改' } }] }, [])
assert.equal(repeat.filter(entry => entry.title === '完成整改处置').length, 2, 'Retain each loop instance')
assert.doesNotThrow(() => buildTaskHistory(task, [{ ...logs[0], operateDesc: '{bad json', detailJson: '{bad json' }], undefined, []))
assert.equal(buildTaskHistory(task, [], undefined, [])[0].actor, '创建人未记录', 'Do not fabricate users')
const normal = buildTaskHistory({ ...task, sceneCode: 'OTHER' }, [], flow, [])
assert.ok(normal.some(entry => entry.title === '完成市级审核'), 'Other scenes keep backend node names')
console.log('PASS: business-readable task history, opinions/recipients/plot outcomes, no raw JSON, chronology, skew/deduplication, loops and missing data')
