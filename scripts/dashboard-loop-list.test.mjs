import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import * as Vue from 'vue'
import { parse, compileScript } from '@vue/compiler-sfc'

const saved = Object.fromEntries(['window', 'document', 'ResizeObserver', 'requestAnimationFrame', 'cancelAnimationFrame', 'Node'].map(key => [key, globalThis[key]]))
let resize, motionChange, disconnected = false, cancelled = false, removed = false
const motion = { matches: false, addEventListener: (_, callback) => motionChange = callback, removeEventListener: () => removed = true }
globalThis.window = { matchMedia: () => motion }
globalThis.document = { hidden: false }
globalThis.Node = class {}
globalThis.ResizeObserver = class { constructor(callback) { resize = callback } observe() {} disconnect() { disconnected = true } }
globalThis.requestAnimationFrame = () => 1
globalThis.cancelAnimationFrame = () => cancelled = true

try {
  const source = readFileSync('src/components/DashboardLoopList.vue', 'utf8').replace('</script>', 'defineExpose({viewport,content,looping,hovered,focused,animate,measure,onFocusOut});\n</script>')
  const code = compileScript(parse(source).descriptor, { id: 'dashboard-loop-list-test' }).content
  const module = { exports: {} }
  new Function('require', 'module', 'exports', ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(name => {
    assert.equal(name, 'vue')
    return Vue
  }, module, module.exports)
  const component = module.exports.default
  component.render = () => null
  const renderer = Vue.createRenderer({ createComment: () => ({}), insert() {}, remove() {}, parentNode: () => null, nextSibling: () => null })
  const props = Vue.reactive({ itemCount: 4 })
  let vm
  const app = renderer.createApp({ render: () => Vue.h(component, { ...props, ref: instance => vm = instance }) })
  app.mount({})
  let scroll = 0
  const viewport = { get scrollTop() { return scroll }, set scrollTop(value) { scroll = Math.round(value) }, contains: value => value === inside }
  const inside = new Node()
  vm.viewport = viewport
  vm.content = { offsetHeight: 120 }
  resize()
  assert(vm.looping, 'Multiple rows cycle once their dimensions are available')
  for (let t = 1000; t <= 2000; t += 16) vm.animate(t)
  assert(scroll >= 17 && scroll <= 19, 'Fractional per-frame movement must accumulate even when native scrollTop rounds')
  const beforePause = scroll
  vm.hovered = true
  vm.animate(2050)
  assert.equal(scroll, beforePause, 'Mouse hover pauses without resetting the reading position')
  scroll = 68
  vm.animate(2100)
  vm.hovered = false
  vm.animate(2150)
  assert(scroll >= 68 && scroll <= 70, 'Resume from manual scrolling rather than jumping back')
  vm.focused = true
  vm.animate(2200)
  const focusedPosition = scroll
  vm.onFocusOut({ relatedTarget: inside })
  vm.animate(2250)
  assert.equal(scroll, focusedPosition, 'Moving focus between list buttons keeps scrolling paused')
  vm.onFocusOut({ relatedTarget: null })
  scroll = 119
  vm.focused = true
  vm.animate(2300)
  vm.focused = false
  vm.animate(2360)
  assert(scroll < 2, 'Crossing the repeat boundary wraps to the identical first row without a blank interval')
  document.hidden = true
  vm.animate(2400)
  assert(scroll < 2, 'Background tabs must not advance the list')
  document.hidden = false
  motion.matches = true
  motionChange()
  assert.equal(vm.looping, false, 'Reduced motion leaves a manually scrollable single copy')
  motion.matches = false
  motionChange()
  props.itemCount = 1
  await Vue.nextTick()
  assert.equal(vm.looping, false, 'Single-row and empty lists must not be duplicated')
  props.itemCount = 0
  await Vue.nextTick()
  assert.equal(vm.looping, false)
  vm.content.offsetHeight = 0
  resize()
  props.itemCount = 5
  await Vue.nextTick()
  assert.equal(vm.looping, false, 'Do not divide by zero while async data or a hidden panel is being resized')
  vm.content.offsetHeight = 180
  resize()
  assert.equal(vm.looping, true, 'New data and resized rows re-enable the loop')
  app.unmount()
  assert(disconnected && cancelled && removed, 'Leaving the dashboard removes observers, motion listener and animation')
  console.log('PASS: continuous loop, fractional movement, hover/focus pause, manual resume, resize/data changes, reduced motion and cleanup')
} finally {
  Object.assign(globalThis, saved)
}
