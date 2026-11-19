<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElPopover } from 'element-plus'
import { ArrowDown } from '@element-plus/icons-vue'
import type { MetadataOption } from '@/api/metadata'

const props = defineProps<{ modelValue: string; options: MetadataOption[] }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const root = ref<HTMLElement>()
const open = ref(false)
const level = ref(0)
function findPath(code: string, nodes: MetadataOption[], parents: MetadataOption[] = []): MetadataOption[] {
  for (const node of nodes) {
    const path = [...parents, node]
    if (node.code === code) return path
    const found = findPath(code, node.children || [], path)
    if (found.length) return found
  }
  return []
}
const path = computed(() => findPath(props.modelValue, props.options))
const choices = computed(() => level.value === 0 ? props.options : path.value[level.value - 1]?.children || [])
function showLevel(index: number) { level.value = index; open.value = true }
function toggle() { if (!open.value) level.value = Math.min(path.value.length, 2); open.value = !open.value }
function choose(item: MetadataOption) {
  emit('update:modelValue', item.code)
  if (level.value < 2 && item.children?.length) { level.value++; open.value = true }
  else open.value = false
}
function outside(event: PointerEvent) {
  const target = event.target as Element | null
  if (!root.value?.contains(target) && !target?.closest('.region-step-popover')) open.value = false
}
function escape(event: KeyboardEvent) { if (event.key === 'Escape') open.value = false }
watch(() => props.modelValue, value => { if (!value) level.value = 0 })
onMounted(() => { document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape) })
onBeforeUnmount(() => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) })
</script>

<template>
  <ElPopover :visible="open" placement="bottom-start" :width="250" :show-arrow="false" popper-class="region-step-popover">
    <template #reference>
      <div ref="root" class="region-step" role="group" aria-label="所属区划">
        <div v-if="path.length" class="region-step-path">
          <template v-for="(item, index) in path" :key="item.code"><span v-if="index" class="separator">/</span><button type="button" :title="`重新选择${['省份', '城市', '区县'][index] || '区划'}`" @click.stop="showLevel(index)">{{ item.name }}</button></template>
        </div>
        <button v-else type="button" class="region-placeholder" @click="toggle">全部区划</button>
        <button v-if="path.length" type="button" class="region-clear" aria-label="清空区划" @click.stop="emit('update:modelValue', ''); open = false">×</button>
        <button type="button" class="region-arrow" :aria-expanded="open" aria-label="选择所属区划" @click.stop="toggle"><ArrowDown :class="{ expanded: open }" /></button>
      </div>
    </template>
    <div class="region-step-options" role="listbox" :aria-label="['选择省份', '选择城市', '选择区县'][level]">
      <button v-for="item in choices" :key="item.code" type="button" role="option" :aria-selected="path[level]?.code === item.code" @click="choose(item)">{{ item.name }}</button>
      <p v-if="!choices.length">暂无可选区划</p>
    </div>
  </ElPopover>
</template>

<style scoped>
.region-step{box-sizing:border-box;width:100%;height:36px;min-width:0;display:flex;align-items:center;padding:0 9px;border:1px solid var(--ui-border);border-radius:var(--ui-control-radius);background:var(--ui-input);color:var(--ui-body);font-size:13px;font-weight:400}
.region-step:focus-within{border-color:var(--ui-accent)}
.region-step button{border:0;padding:0;color:inherit;background:transparent;font:inherit;cursor:pointer}
.region-step-path{min-width:0;flex:1;display:flex;align-items:center;overflow:auto;scrollbar-width:none;white-space:nowrap}.region-step-path::-webkit-scrollbar{display:none}
.region-step-path button:hover{color:var(--ui-accent)}.separator{padding:0 3px;color:var(--ui-muted)}
.region-placeholder{min-width:0;flex:1;text-align:left;color:var(--ui-muted)!important}.region-arrow,.region-clear{flex:none;width:20px;color:var(--ui-muted)!important;font-size:16px!important}.region-arrow{display:grid;place-items:center}.region-arrow svg{width:14px;height:14px;transform:rotate(0deg);transition:transform .3s}.region-arrow svg.expanded{transform:rotate(180deg)}
.region-step-options{max-height:280px;overflow-y:auto;display:flex;flex-direction:column}
.region-step-options button{width:100%;min-height:36px;padding:7px 12px;border:0;background:transparent;color:var(--ui-body);text-align:left;font:13px var(--ui-font);cursor:pointer}
.region-step-options button:hover,.region-step-options button:focus-visible{background:var(--ui-hover);color:var(--ui-text)}
.region-step-options button[aria-selected=true]{color:var(--ui-accent);background:var(--ui-selected)}.region-step-options p{margin:0;padding:12px;color:var(--ui-muted);font-size:13px}
</style>
