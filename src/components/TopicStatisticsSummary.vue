<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useUserStore } from '@/stores/user'
import { getCustomDepartmentStatistics, type CustomStatGroup } from '@/api/business-statistics'
import { topicStatGroups } from '@/utils/topic-layer-catalog'
import DashboardFlipNumber from './DashboardFlipNumber.vue'
const user = useUserStore()
const props = defineProps<{sources?:{id:string; name:string}[];animated?:boolean}>()
const emit = defineEmits<{available:[visible:boolean]}>()
const groups = ref<CustomStatGroup[]>([]), loading = ref(false), error = ref('')
const visibleGroups = computed(() => topicStatGroups(groups.value,props.sources))
watch([visibleGroups,loading,error],()=>emit('available',loading.value || Boolean(error.value) || visibleGroups.value.length>0),{immediate:true})
let version = 0
async function load() {
  const request = ++version
  groups.value = []; error.value = ''; loading.value = true
  try {
    const result = await getCustomDepartmentStatistics(user.activeDeptId)
    if (request === version) groups.value = result
  } catch { if (request === version) error.value = '专题统计暂时无法读取' }
  finally { if (request === version) loading.value = false }
}
watch(() => user.activeDeptId,load,{immediate:true})
</script>
<template>
  <div class="topic-statistics" aria-label="专题统计">
    <p v-if="loading" role="status">正在读取专题统计…</p>
    <p v-else-if="error" role="alert">{{ error }} <button @click="load">重试</button></p>
    <p v-else-if="!visibleGroups.length">当前图层暂无专题统计</p>
    <section v-for="group in visibleGroups" :key="group.code || group.name"><h3>{{ group.name }}</h3><dl><div v-for="item in group.items" :key="item.name"><dt>{{ item.name }}</dt><dd><DashboardFlipNumber v-if="animated" :value="item.value" /><template v-else>{{ item.value }}</template><small>{{ item.unit }}</small></dd></div></dl></section>
  </div>
</template>
<style scoped>
.topic-statistics{min-height:0;overflow:auto;scrollbar-width:none;color:inherit;font-size:12px;line-height:1.5}.topic-statistics::-webkit-scrollbar{display:none}h3{margin:0 0 10px;font:inherit;color:#a5c7d3}section+section{margin-top:12px}dl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 14px;margin:0}dl>div{min-width:0}dt{color:#94b6c6;font-size:11px;overflow-wrap:anywhere}dd{margin:4px 0 0;color:#7ce4e6;font-size:18px;font-weight:600;overflow-wrap:anywhere;font-variant-numeric:tabular-nums}small{margin-left:4px;font-size:10px;font-weight:400;color:#a5c7d3}p{color:#9fbfcd;font-size:12px;margin:0}button{background:transparent;border:0;color:#76dce9;cursor:pointer}
</style>
