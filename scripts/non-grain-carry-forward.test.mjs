import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const module = { exports: {} }
const source = ts.transpileModule(readFileSync('src/utils/non-grain-carry-forward.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
new Function('module', 'exports', source)(module, module.exports)
const { workflowPlotRecord, precedingWorkflowNodes, inspectionConclusion, archiveTypeAllowed, carriedPlotFields } = module.exports
const node = (id, nodeKey, prevNodeInstId, resultData = {}, status = 'COMPLETED') => ({ id, nodeKey, prevNodeInstId, resultData, status })
const inspection = node('i', 'IMPLEMENT', null, { result: 'PROBLEM', plotResults: [
  { abnormalId: 1, result: 'PROBLEM', landUse: '01' },
  { abnormalId: '2', result: 'NO_PROBLEM', landUse: '02' },
] })
const rectification = node('r', 'RECTIFY', 'i', { plotResults: [
  { abnormalId: '1', restoredArea: 0, landUse: '0101' },
  { abnormalId: '2', restoredArea: 123.45, landUse: '0102' },
] })
const review = node('u', 'UAV_RECHECK', 'r', {}, 'PROCESSING')
const archive = node('f', 'FINISH', 'u', {}, 'PROCESSING')
const flow = { timeline: [inspection, rectification, review, archive], currentNode: archive }

assert.equal(inspectionConclusion(flow, 'f', '1'), 'PROBLEM')
assert.equal(inspectionConclusion(flow, 'f', '2'), 'NO_PROBLEM', 'Mixed plots use individual conclusions instead of the aggregate PROBLEM')
assert.equal(inspectionConclusion(flow, 'f', 'missing'), undefined)
assert.equal(archiveTypeAllowed('NO_PROBLEM', 'PROBLEM'), false)
assert.equal(archiveTypeAllowed('RESTORED', 'PROBLEM'), true)
assert.equal(archiveTypeAllowed('NO_PROBLEM', 'NO_PROBLEM'), true)
assert.equal(archiveTypeAllowed('RESTORED', 'NO_PROBLEM'), false)
assert.equal(archiveTypeAllowed('NO_PROBLEM', undefined), false)
assert.equal(archiveTypeAllowed('SPECIAL', undefined), true)
assert.equal(archiveTypeAllowed('unrecognized', 'PROBLEM'), false)

assert.deepEqual(carriedPlotFields(flow, 'u', '1', 2), { restoredArea: '0', landUse: '0101' })
assert.deepEqual(carriedPlotFields(flow, 'u', '2', 2), { restoredArea: '123.45', landUse: '0102' })
assert.deepEqual(carriedPlotFields(flow, 'u', '1', 2, { restoredArea: 12, landUse: '0103' }), { restoredArea: '12', landUse: '0103' }, 'Saved downstream edits win')
assert.deepEqual(carriedPlotFields(flow, 'u', '1', 2, { restoredArea: ' ', landUse: '0103' }), { restoredArea: '0', landUse: '0103' }, 'Fields are filled independently')
review.status = 'COMPLETED'
review.resultData = { plotResults: [{ abnormalId: '1', restoredArea: 45.6, landUse: '0104' }] }
assert.deepEqual(carriedPlotFields(flow, 'f', '1', 2), { restoredArea: '45.6', landUse: '0104' }, 'Archive inherits the latest completed review')
assert.deepEqual(carriedPlotFields(flow, 'f', '2', 2), { restoredArea: '123.45', landUse: '0102' })
assert.deepEqual(carriedPlotFields(flow, 'u', '1', 2), { restoredArea: '0', landUse: '0101' }, 'Viewing an older node must not read future results')
assert.deepEqual(workflowPlotRecord({ restoredArea: 99 }, '1'), {})
assert.deepEqual(workflowPlotRecord({ abnormalId: '2', restoredArea: 99 }, '1', true), {})
assert.deepEqual(workflowPlotRecord({ plotResults: [], restoredArea: 99 }, '1', true), {})
const legacy = { timeline: [node('r', 'RECTIFY', null, { restoredArea: 99, landUse: '01' }), node('u', 'UAV_RECHECK', 'r')] }
assert.deepEqual(carriedPlotFields(legacy, 'u', '1', 1), { restoredArea: '99', landUse: '01' })
assert.deepEqual(carriedPlotFields(legacy, 'u', '1', 2), { restoredArea: '', landUse: '' }, 'Unkeyed legacy totals must not be copied to every plot')
const rerun = { timeline: [...flow.timeline, node('r2', 'RECTIFY', 'u', { plotResults: [{ abnormalId: '1', restoredArea: 77, landUse: '0105' }] }), node('u2', 'UAV_RECHECK', 'r2')] }
assert.deepEqual(carriedPlotFields(rerun, 'u2', '1', 2), { restoredArea: '77', landUse: '0105' })
assert.deepEqual(precedingWorkflowNodes({ timeline: [node('a', 'IMPLEMENT', 'b'), node('b', 'RECTIFY', 'a')] }, 'b').map(item => item.id), ['a'], 'Bad cycle cannot loop forever')
assert.deepEqual(precedingWorkflowNodes({ timeline: [node('a', 'IMPLEMENT'), node('b', 'RECTIFY')] }, 'b').map(item => item.id), ['a'], 'Older timelines without predecessor IDs remain supported')
console.log('PASS: per-plot archive policy, carry-forward precedence, zero area, legacy data, rework and historical-node isolation')
