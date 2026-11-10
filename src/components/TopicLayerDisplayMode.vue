<script setup lang="ts">
import type { TopicDisplayMode } from '@/utils/topic-renderer'
import TopicLayerColorPicker from './TopicLayerColorPicker.vue'
defineProps<{mode:TopicDisplayMode|'mixed';name:string;label:string;color?:string;colorEditable?:boolean}>()
const emit=defineEmits<{change:[mode:TopicDisplayMode];colorChange:[color:string]}>()
function changeColor(color:string|null|undefined){
  if(color&&/^#[\da-f]{6}$/i.test(color))emit('colorChange',color)
}
</script>
<template>
  <fieldset class="layer-display-mode" :aria-label="label"><legend>显示模式</legend>
    <label><input type="radio" :name="name" :checked="mode==='filled'" @change="emit('change','filled')" />铺满模式</label>
    <label><input type="radio" :name="name" :checked="mode==='boundary'" @change="emit('change','boundary')" />边界模式</label>
    <TopicLayerColorPicker v-if="color && colorEditable" class="layer-color-picker" :color="color" :label="label" :boundary="mode==='boundary'" @change="changeColor" />
  </fieldset>
</template>
<style scoped>
.layer-display-mode{display:flex;align-items:center;gap:12px;min-width:0;border:0;margin:0;padding:0}.layer-display-mode legend{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}label{display:flex;align-items:center;gap:5px;cursor:pointer;font-size:12px;line-height:20px;color:#b9d2dc;white-space:nowrap}input{margin:0;width:12px;height:12px;flex:none;accent-color:#39c7d5}
.layer-color-picker{margin-left:auto}
</style>
