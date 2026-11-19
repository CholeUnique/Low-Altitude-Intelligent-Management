<script setup lang="ts">
import { computed, ref } from 'vue'
import TopicLayerCard from './TopicLayerCard.vue'
import TopicAdministrativeRow from './TopicAdministrativeRow.vue'
import { administrativeTree, type AdministrativeChoice } from '@/utils/topic-administrative-tree'
import { matchesTopicText } from '@/utils/topic-layer-search'
interface Layer {key:string;name:string;categories:AdministrativeChoice[];pending:boolean;error:string;mode:'filled'|'boundary'}
const props=defineProps<{layers:Layer[];keyword:string}>()
const emit=defineEmits<{select:[key:string,value:string,checked:boolean];all:[checked:boolean];clip:[key:string,value:string,checked:boolean];mode:[key:string,value:string,mode:'filled'|'boundary'];locate:[key:string,value:string]}>()
const expanded=ref(false),open=ref<Record<string,boolean>>({})
const towns=computed(()=>props.layers.filter(layer=>!/村级|行政村|村界/.test(layer.name)))
const villages=computed(()=>props.layers.filter(layer=>/村级|行政村|村界/.test(layer.name)))
const choices=(layers:Layer[])=>layers.flatMap(layer=>layer.categories.map(item=>({...item,key:layer.key,mode:item.mode??layer.mode})))
const tree=computed(()=>administrativeTree(choices(towns.value),choices(villages.value)))
const all=computed(()=>choices(props.layers)),checked=computed(()=>!!all.value.length&&all.value.every(item=>item.checked))
const match=(name:string)=>matchesTopicText(props.keyword,name,'行政区划图')||props.layers.some(layer=>matchesTopicText(props.keyword,layer.name))
const choiceMatch=(item:AdministrativeChoice)=>match(item.name)||matchesTopicText(props.keyword,item.value,item.parentCode,item.parentName)||!!item.searchMatch
const groups=computed(()=>tree.value.groups.filter(group=>choiceMatch(group.town)||group.villages.some(choiceMatch)))
const shown=computed(()=>!props.keyword.trim()||groups.value.length>0||tree.value.unassigned.some(choiceMatch))
</script>
<template>
  <TopicLayerCard v-show="shown" :expanded="expanded || !!keyword.trim()" title="行政区划图" :checked="checked" :indeterminate="!checked && all.some(item=>item.checked)" :category-count="all.length" class="administrative-tree" @update:expanded="expanded=$event" @select="emit('all',$event)">
    <p class="admin-operation-hint">点击区划右侧“裁切”选择范围，可多选。</p>
    <template v-for="layer in layers" :key="layer.key"><p v-if="layer.pending" class="admin-status" role="status">{{ layer.name }}正在预加载…</p><p v-if="layer.error" class="admin-status" role="alert">{{ layer.error }}</p></template>
    <div v-for="group in groups" :key="`${group.town.key}:${group.town.value}`" class="admin-town">
      <TopicAdministrativeRow :region="group.town" expandable :expanded="open[group.town.value] || !!keyword.trim()" @expand="open[group.town.value]=!open[group.town.value]" @select="emit('select',group.town.key,group.town.value,$event)" @clip="emit('clip',group.town.key,group.town.value,$event)" @mode="emit('mode',group.town.key,group.town.value,$event)" @locate="emit('locate',group.town.key,group.town.value)" />
      <div v-if="open[group.town.value] || keyword.trim()" class="admin-villages">
        <TopicAdministrativeRow v-for="village in group.villages.filter(item=>choiceMatch(group.town)||choiceMatch(item))" :key="`${village.key}:${village.value}`" :region="village" village @select="emit('select',village.key,village.value,$event)" @clip="emit('clip',village.key,village.value,$event)" @mode="emit('mode',village.key,village.value,$event)" @locate="emit('locate',village.key,village.value)" />
        <small v-if="!group.villages.length">暂无可用村级区划</small>
      </div>
    </div>
    <div v-if="tree.unassigned.length" class="admin-unassigned"><small>其他村级区划</small><TopicAdministrativeRow v-for="village in tree.unassigned.filter(choiceMatch)" :key="`${village.key}:${village.value}`" :region="village" village @select="emit('select',village.key,village.value,$event)" @clip="emit('clip',village.key,village.value,$event)" @mode="emit('mode',village.key,village.value,$event)" @locate="emit('locate',village.key,village.value)" /></div>
  </TopicLayerCard>
</template>
<style scoped>
.admin-operation-hint,.admin-status{margin:0 0 10px;font-size:12px;line-height:1.7;color:#a9c4d2}.admin-status[role=alert]{color:#ffb79b}.admin-villages small,.admin-unassigned>small{color:#a9c4d2;font-size:12px}.admin-villages{margin-left:12px;padding-left:10px;border-left:1px solid #ffcf7055}.admin-unassigned{margin-top:8px}
</style>
