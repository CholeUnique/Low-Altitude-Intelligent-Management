<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{ root: HTMLElement | null; message: string; pageKey?: string }>()
const visible = ref(false)
const left = ref(0)
const top = ref(0)

function hide() { visible.value = false }
function show(event: PointerEvent) {
  if (!props.message || !(event.target instanceof Element)) return hide()
  const control = event.target.closest('button, input, select, textarea, [role="button"], [role="radio"], [role="checkbox"], [role="combobox"], label')
  const disabled = control?.matches(':disabled, [readonly], [aria-disabled="true"]') || control?.querySelector('input:disabled, select:disabled, textarea:disabled, button:disabled')
  if (!control || !disabled || !props.root?.contains(control)) return hide()
  left.value = Math.max(8, Math.min(event.clientX + 12, window.innerWidth - 220))
  top.value = Math.max(8, Math.min(event.clientY + 16, window.innerHeight - 44))
  visible.value = true
}

watch(() => props.root, (root, _, onCleanup) => {
  if (!root) return
  // 捕获指针事件，使原生 disabled 表单元素也能显示提示，不改变禁用状态。
  root.addEventListener('pointermove', show, true)
  root.addEventListener('pointerleave', hide)
  root.addEventListener('scroll', hide, true)
  root.addEventListener('pointerdown', hide, true)
  onCleanup(() => {
    root.removeEventListener('pointermove', show, true)
    root.removeEventListener('pointerleave', hide)
    root.removeEventListener('scroll', hide, true)
    root.removeEventListener('pointerdown', hide, true)
  })
}, { immediate: true, flush: 'post' })
watch([() => props.message, () => props.pageKey], hide)
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="workbench-readonly-hint" role="tooltip" :style="{ left: `${left}px`, top: `${top}px` }">{{ message }}</div>
  </Teleport>
</template>

<style scoped>
.workbench-readonly-hint {
  position: fixed;
  z-index: 3000;
  max-width: 208px;
  padding: 8px 12px;
  border-radius: 5px;
  background: #17394eeF;
  color: #fff;
  box-shadow: 0 3px 12px #17394e26;
  font-size: 12px;
  line-height: 1.5;
  pointer-events: none;
}
</style>
