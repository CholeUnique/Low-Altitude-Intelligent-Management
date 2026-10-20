import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const module = { exports: {} }
const compiled = ts.transpileModule(readFileSync('src/utils/telemetry-panel.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
new Function('module', 'exports', compiled)(module, module.exports)
const { containedVideoBounds, fitTelemetryPanelSize, placeTelemetryPanel, resizeTelemetryPanel } = module.exports
const near = (actual, expected) => assert(Math.abs(actual - expected) < 1e-6, `${actual} != ${expected}`)
const normal = containedVideoBounds({ left: 0, top: 0, width: 1000, height: 700 }, 1920, 1080)
assert.deepEqual(normal, { left: 0, top: 68.75, width: 1000, height: 562.5 })
assert.deepEqual(placeTelemetryPanel(9999, normal.top + 8, { width: 340, height: 300 }, normal), { left: 652, top: 76.75 })
const full = containedVideoBounds({ left: 0, top: 0, width: 2000, height: 1000 }, 1920, 1080)
near(full.left, 111.1111111111)
near(full.width, 1777.7777777778)
const fullSize = fitTelemetryPanelSize({ width: 420, height: 350 }, full)
const fullPosition = placeTelemetryPanel(9999, full.top + 8, fullSize, full)
near(fullPosition.left + fullSize.width, full.left + full.width - 8)
assert.equal(fullPosition.top, 8)
const portrait = containedVideoBounds({ left: 20, top: 40, width: 1000, height: 600 }, 1080, 1920)
assert.deepEqual(portrait, { left: 351.25, top: 40, width: 337.5, height: 600 })
assert.deepEqual(fitTelemetryPanelSize({ width: 420, height: 350 }, portrait), { width: 321.5, height: 350 })
assert.deepEqual(fitTelemetryPanelSize({ width: 5, height: 5 }, normal), { width: 300, height: 250 })
assert.deepEqual(fitTelemetryPanelSize({ width: 5000, height: 5000 }, full), { width: full.width - 16, height: full.height - 16 })
assert.deepEqual(fitTelemetryPanelSize({ width: 1400, height: 850 }, full), { width: 1400, height: 850 }, 'Large video pictures allow growth beyond the former 720×640 cap')
assert.deepEqual(containedVideoBounds(normal, 0, 0), normal, 'Before metadata, use the video element box safely')
const origin = { left: 652, top: 76.75, width: 340, height: 300 }
const leftGrow = resizeTelemetryPanel(origin, -180, 70, 'left', normal)
assert.deepEqual(leftGrow, { left: 472, top: 76.75, width: 520, height: 370 })
near(leftGrow.left + leftGrow.width, origin.left + origin.width)
const rightGrow = resizeTelemetryPanel({ left: 100, top: 100, width: 340, height: 300 }, 100, 50, 'right', normal)
assert.deepEqual(rightGrow, { left: 100, top: 100, width: 440, height: 350 })
const limited = resizeTelemetryPanel(origin, -10000, 10000, 'left', normal)
assert(limited.left >= normal.left + 8)
assert(limited.top + limited.height <= normal.top + normal.height - 8)
near(limited.width, normal.width - 16)
near(limited.height, normal.top + normal.height - 8 - origin.top)
const largeOrigin = { ...fullPosition, ...fullSize }
const largeDrag = resizeTelemetryPanel(largeOrigin, -10000, 10000, 'left', full)
near(largeDrag.width, full.width - 16)
near(largeDrag.height, full.height - 16)
assert(largeDrag.width > 720 && largeDrag.height > 640)
const tiny = { left: 50, top: 40, width: 240, height: 200 }
assert.deepEqual(fitTelemetryPanelSize({ width: 420, height: 350 }, tiny), { width: 224, height: 184 })
assert.deepEqual(placeTelemetryPanel(-500, 800, { width: 224, height: 184 }, tiny), { left: 58, top: 48 })
console.log('Telemetry panel: normal/fullscreen/portrait bounds, top-right docking, picture-only size limits and two-corner resizing passed.')
