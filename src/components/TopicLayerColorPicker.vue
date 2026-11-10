<script setup lang="ts">
defineProps<{color:string;label:string;boundary?:boolean}>()
const emit=defineEmits<{change:[color:string]}>()
function change(event:Event){
  const color=(event.target as HTMLInputElement).value
  if(/^#[\da-f]{6}$/i.test(color))emit('change',color)
}
</script>
<template>
  <label class="topic-color-control" :class="{'is-boundary':boundary}" :style="{'--layer-color':color}" :title="`${label}：点击修改颜色`">
    <input type="color" :value="color" :aria-label="`${label}，选择图层颜色`" @change="change" />
    <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 10 6-6 2 2-6 6-3 1 1-3Z M9 5l2 2" /></svg>
  </label>
</template>
<style scoped>
.topic-color-control{position:relative;display:inline-flex;align-items:center;justify-content:center;flex:none;width:28px;height:22px;box-sizing:border-box;border:2px solid var(--layer-color);border-radius:4px;background:var(--layer-color);cursor:pointer;transition:box-shadow .15s ease}.topic-color-control.is-boundary{background:transparent}.topic-color-control:hover,.topic-color-control:focus-within{box-shadow:0 0 0 3px #83dfed45}.topic-color-control input{position:absolute;inset:0;width:100%;height:100%;margin:0;padding:0;border:0;opacity:0;cursor:pointer}.topic-color-control svg{width:13px;height:13px;pointer-events:none;fill:none;stroke:#fff;stroke-width:1.5;filter:drop-shadow(0 1px 1px #002334)}
</style>
