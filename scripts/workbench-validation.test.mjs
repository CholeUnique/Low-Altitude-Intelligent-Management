import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const messages = []
const module = { exports: {} }
const code = ts.transpileModule(readFileSync('src/workspace-components/shared/workbench-validation.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
new Function('require', 'module', 'exports', code)(id => id === 'element-plus' ? { ElMessage: { error: options => { messages.push(options.message); return { close() {} } } } } : {}, module, module.exports)
const { validateWorkbenchForm, vWorkbenchValidation } = module.exports
let focused = 0
const control = { type: 'number', value: '', required: true, willValidate: true, validity: { valid: false, valueMissing: true }, closest: () => ({ querySelector: () => ({ textContent: '* 复耕面积' }) }), getAttribute: () => null, scrollIntoView() {}, focus() { focused++ } }
const form = { querySelectorAll: () => [control] }
control.form = form
assert.equal(validateWorkbenchForm(form), false)
assert.equal(messages.at(-1), '请填写复耕面积。')
assert.equal(focused, 1)
control.willValidate = false
assert.equal(validateWorkbenchForm(form), true, 'Disabled/read-only controls do not block submission')
control.willValidate = true
control.value = '   '
control.validity = { valid: true, valueMissing: false }
assert.equal(validateWorkbenchForm(form), false, 'Whitespace-only required fields are rejected')
control.value = '0'
assert.equal(validateWorkbenchForm(form), true, 'Zero is a valid non-negative area')
control.value = '-1'
control.validity = { valid: false, valueMissing: false }
assert.equal(validateWorkbenchForm(form), false)
assert.equal(messages.at(-1), '请检查复耕面积。')
const listeners = new Map()
const root = { addEventListener: (name, callback) => listeners.set(name, callback), removeEventListener: name => listeners.delete(name) }
vWorkbenchValidation.mounted(root)
let prevented = 0, stopped = 0
listeners.get('invalid')({ target: control, preventDefault() { prevented++ } })
assert.equal(prevented, 1, 'Native validation bubbles are suppressed')
listeners.get('submit')({ target: form, preventDefault() { prevented++ }, stopImmediatePropagation() { stopped++ } })
assert.equal(stopped, 1, 'Invalid data never reaches the submit handler')
vWorkbenchValidation.unmounted(root)
assert.equal(listeners.size, 0)
console.log('PASS: unified workbench validation, focus, native bubble suppression, read-only and invalid submit guards')
