import type { ObjectDirective } from 'vue'
import { ElMessage } from 'element-plus'
import 'element-plus/es/components/message/style/css'
import './workbench-feedback.css'

let feedback: ReturnType<typeof ElMessage> | undefined
export function showWorkbenchFeedback(message: string) {
  feedback?.close()
  feedback = message ? ElMessage.error({ message, showClose: true, duration: 6000, offset: 90, customClass: 'workbench-feedback-popup' }) : undefined
  return feedback
}

type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
function fieldName(control: Control) {
  if (control.type === 'radio') {
    const group = control.closest('div')
    if (group?.previousElementSibling?.tagName === 'H4') return group.previousElementSibling.textContent?.replace(/^[*✓◇\s]+/, '') || '此项'
  }
  const label = control.closest('label')
  const text = label?.querySelector('span')?.textContent || label?.firstChild?.textContent
  return (control.getAttribute('aria-label') || text || control.getAttribute('placeholder') || '此项').replace(/^\s*\*\s*/, '').trim()
}
function missing(control: Control) {
  return control.willValidate && (!control.validity.valid || (control.required && !control.value.trim()))
}
export function validateWorkbenchForm(form?: HTMLFormElement | null) {
  const invalid = Array.from(form?.querySelectorAll<Control>('input,select,textarea') || []).find(missing)
  if (!invalid) return true
  showWorkbenchFeedback(`${invalid.validity.valueMissing || !invalid.value.trim() ? '请填写' : '请检查'}${fieldName(invalid)}。`)
  invalid.scrollIntoView({ block: 'center', behavior: 'smooth' })
  invalid.focus({ preventScroll: true })
  return false
}

// Capture at the workspace boundary so every child form uses the same prompt.
const cleanup = new WeakMap<HTMLElement, () => void>()
export const vWorkbenchValidation: ObjectDirective<HTMLElement> = {
  mounted(root) {
    let handling = false
    const onInvalid = (event: Event) => {
      event.preventDefault()
      if (handling) return
      handling = true
      const control = event.target as Control
      validateWorkbenchForm(control.form)
      queueMicrotask(() => { handling = false })
    }
    const onSubmit = (event: Event) => {
      if (!validateWorkbenchForm(event.target as HTMLFormElement)) {
        event.preventDefault()
        event.stopImmediatePropagation()
      }
    }
    root.addEventListener('invalid', onInvalid, true)
    root.addEventListener('submit', onSubmit, true)
    cleanup.set(root, () => {
      root.removeEventListener('invalid', onInvalid, true)
      root.removeEventListener('submit', onSubmit, true)
    })
  },
  unmounted(root) { cleanup.get(root)?.(); cleanup.delete(root) },
}
