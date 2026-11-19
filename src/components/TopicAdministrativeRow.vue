<script setup lang="ts">
import { ref } from 'vue'
import TopicLayerDisplayMode from './TopicLayerDisplayMode.vue'
interface Region {key:string;value:string;name:string;checked:boolean;clipping?:boolean;mode?:'filled'|'boundary'}
defineProps<{region:Region;village?:boolean;expandable?:boolean;expanded?:boolean}>()
const emit=defineEmits<{select:[checked:boolean];clip:[checked:boolean];mode:[mode:'filled'|'boundary'];locate:[];expand:[]}>()
const stylesOpen=ref(false)
function changeMode(mode:'filled'|'boundary'){emit('mode',mode);stylesOpen.value=false}
</script>
<template>
  <div class="admin-region" :class="{'is-village':village,'is-clipping':region.clipping}">
    <div class="admin-region-row">
      <button v-if="expandable" class="region-expand" type="button" :aria-expanded="expanded" :aria-label="`展开${region.name}村级区划`" @click="emit('expand')">{{ expanded?'▾':'▸' }}</button>
      <label class="region-visible"><input type="checkbox" :checked="region.checked" :aria-label="`${village?'村级':'乡级'}区划 ${region.name}`" @change="emit('select',($event.target as HTMLInputElement).checked)" /><span>{{ region.name }}</span></label>
      <div class="region-actions">
        <button class="region-clip" type="button" :aria-pressed="!!region.clipping" :aria-label="`${region.name}用于裁切`" :title="`${region.clipping?'移出':'加入'}裁切范围：${region.name}`" @click="emit('clip',!region.clipping)">裁切</button>
        <button type="button" class="region-style" :aria-expanded="stylesOpen" :aria-label="`${region.name}显示样式`" title="设置铺满或边界模式" @click="stylesOpen=!stylesOpen"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3 11 7-7 2 2-7 7-3 1 1-3ZM9 5l2 2" /></svg></button>
        <button type="button" class="region-locate" :aria-label="`定位${region.name}`" title="定位行政区" @click="emit('locate')">⌖</button>
      </div>
    </div>
    <TopicLayerDisplayMode v-if="stylesOpen" class="region-display-mode" :mode="region.mode || 'boundary'" :name="`admin-mode-${region.key}-${region.value}`" :label="`${region.name}显示模式`" @change="changeMode" />
  </div>
</template>
<style scoped>
.admin-region{border-radius:5px}.admin-region-row{display:flex;align-items:center;gap:6px;min-height:36px}.region-visible{display:flex;align-items:center;gap:8px;flex:1;min-width:0;cursor:pointer;font-size:12px}.region-visible span{overflow-wrap:anywhere;line-height:1.7}.region-visible input{width:14px;height:14px;accent-color:#74dfff;margin:0;flex:none}.is-village .region-visible input{accent-color:#ffcf70}.region-actions{display:flex;align-items:center;gap:4px;flex:none}.admin-region button{display:inline-flex;align-items:center;justify-content:center;flex:none;min-height:26px;padding:3px;border:0;border-radius:4px;background:transparent;color:#a7cbd7;font:12px var(--ui-font);cursor:pointer}.admin-region button:hover{background:#63c8db22;color:#a4eff8}.admin-region .region-clip{padding:3px 6px;border:1px solid #75b6ca38;white-space:nowrap}.region-clip[aria-pressed=true]{color:#8cf0e1;background:#2b9c8e32;border-color:#65d5bd77}.region-expand{width:12px}.region-style,.region-locate{width:22px}.region-style svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:1.5}.region-display-mode{padding:8px 0 10px 20px;border-bottom:1px solid #75a9bd26;flex-wrap:wrap}.is-clipping{background:#6dd3c708}
</style>
