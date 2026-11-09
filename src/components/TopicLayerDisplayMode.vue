<script setup lang="ts">
import type { TopicDisplayMode } from '@/utils/topic-renderer'
import { UPLOAD_COLORS } from '@/utils/topic-upload'
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
    <span v-if="color && colorEditable" class="layer-color-picker" :class="{'is-boundary':mode==='boundary'}"><ElColorPicker :model-value="color" color-format="hex" :show-alpha="false" :clearable="false" :predefine="UPLOAD_COLORS" :aria-label="`${label}，选择图层颜色`" :title="`选择图层颜色（${color}）`" popper-class="topic-layer-color-options" size="small" @change="changeColor" /></span>
  </fieldset>
</template>
<style scoped>
.layer-display-mode{display:flex;align-items:center;gap:12px;min-width:0;border:0;margin:0;padding:0}.layer-display-mode legend{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}label{display:flex;align-items:center;gap:5px;cursor:pointer;font-size:12px;line-height:20px;color:#b9d2dc;white-space:nowrap}input{margin:0;width:12px;height:12px;flex:none;accent-color:#39c7d5}
.layer-color-picker{display:flex;align-items:center;flex:none;margin-left:auto;--el-color-picker-border-radius:4px}.layer-color-picker :deep(.el-color-picker__trigger){width:22px;height:17px;padding:0;border:0}.layer-color-picker :deep(.el-color-picker__color){border:2px solid v-bind(color)}.layer-color-picker :deep(.el-color-picker__icon){display:none}.layer-color-picker.is-boundary :deep(.el-color-picker__color-inner){background:transparent!important}
</style>
