<script setup lang="ts">
import { computed, useId } from 'vue'
import type { IdentifiedMapFeature } from '@/utils/map-service-layer'
import { topicFeatureRows } from '@/utils/topic-feature-fields'
const props = defineProps<{features: IdentifiedMapFeature[]; selected: number; roles: Record<string,string>; embedded?:boolean}>()
const emit = defineEmits<{select:[index:number]; close:[]}>()
const id = useId()
const active = computed(() => props.features[props.selected])
const groups = computed(() => {
  const result = new Map<string,{id:string; name:string; indices:number[]}>()
  props.features.forEach((feature,index) => {
    const group = result.get(feature.serviceId)
    if (group) group.indices.push(index)
    else result.set(feature.serviceId,{id:feature.serviceId,name:feature.serviceName,indices:[index]})
  })
  return [...result.values()]
})
const activeGroup = computed(() => groups.value.find(group => group.id === active.value?.serviceId))
const rows = computed(() => active.value ? topicFeatureRows(active.value.rows,props.roles[active.value.serviceId] || '') : [])
</script>
<template>
  <aside v-if="active" class="topic-feature-details" :class="{'is-embedded':embedded}" aria-label="要素详情">
    <header><div><b>要素详情</b><small>{{ groups.length }} 个叠加图层 · {{ features.length }} 个要素</small></div><button aria-label="关闭要素详情" @click="emit('close')">×</button></header>
    <nav role="tablist" aria-label="叠加要素图层">
      <button v-for="(group,index) in groups" :id="`${id}-tab-${index}`" :key="group.id" role="tab" :aria-selected="group.id === active.serviceId" :aria-controls="`${id}-content`" :tabindex="group.id === active.serviceId ? 0 : -1" :title="group.name" @click="emit('select',group.indices[0]!)" @keydown.right.prevent="emit('select',groups[(index+1)%groups.length]!.indices[0]!)" @keydown.left.prevent="emit('select',groups[(index+groups.length-1)%groups.length]!.indices[0]!)">{{ group.name }}</button>
    </nav>
    <section :id="`${id}-content`" role="tabpanel" :aria-labelledby="`${id}-tab-${groups.findIndex(group=>group.id===active?.serviceId)}`" tabindex="0">
      <div v-if="activeGroup && activeGroup.indices.length > 1" class="same-layer"><button v-for="index in activeGroup.indices" :key="index" :aria-pressed="selected === index" @click="emit('select',index)">图斑 {{ features[index]?.objectId ?? index+1 }}</button></div>
      <div class="feature-type"><small>{{ active.typeLabel || '地块类型' }}</small><strong>{{ active.typeValue || '暂无地块类型' }}</strong></div>
      <dl><div v-for="row in rows" :key="row.name"><dt>{{ row.label }}</dt><dd>{{ row.value }}</dd></div></dl>
      <p v-if="!rows.length">此要素暂无已配置的业务属性。</p>
    </section>
  </aside>
</template>
<style scoped>
.topic-feature-details.is-embedded{position:relative;inset:auto;width:100%;max-width:none;flex:1;min-height:180px}
.topic-feature-details{position:absolute;z-index:525;right:20px;top:82px;bottom:38px;width:350px;max-width:calc(100% - 40px);display:flex;flex-direction:column;overflow:hidden;border:1px solid #74cce32b;border-radius:12px;background:linear-gradient(135deg,#143c4beF,#082535ee);box-shadow:0 16px 45px #00131b66;backdrop-filter:blur(20px);color:#def0f5;font-size:12px}header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px;border-bottom:1px solid #7395a229}header div{display:grid;gap:5px}header b{font-size:16px}small{font-size:11px;color:#9cbfca}button{font:inherit;color:inherit;cursor:pointer}header button{border:0;background:transparent;font-size:24px}nav{display:flex;flex:none;gap:5px;padding:10px 12px;overflow:auto;border-bottom:1px solid #7395a229}nav button,.same-layer button{border:1px solid #7bcadd25;border-radius:6px;background:#38718625;padding:7px 10px;white-space:nowrap;font-size:11px}nav button[aria-selected=true],.same-layer button[aria-pressed=true]{background:#247b974d;border-color:#55cee2;color:#a1effa}section{overflow:auto;min-height:0;padding:14px;line-height:1.7}nav,section{scrollbar-width:none}nav::-webkit-scrollbar,section::-webkit-scrollbar{display:none}.same-layer{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:12px}.feature-type{display:grid;gap:4px;background:#6bc6df0d;border-radius:8px;padding:12px;margin-bottom:12px}.feature-type strong{font-size:14px}dl{margin:0}dl>div{display:grid;grid-template-columns:minmax(90px,.85fr) minmax(0,1.15fr);gap:12px;padding:9px 2px;border-bottom:1px solid #7295a21f}dt{color:#8fb9c8}dd{margin:0;color:#e2f1f5;overflow-wrap:anywhere;font-variant-numeric:tabular-nums}
</style>
