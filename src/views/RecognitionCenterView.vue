<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PrimaryHeader from '@/components/PrimaryHeader.vue'
import SpotIdentificationPanel from '@/workspace-components/spot-identification/SpotIdentificationPanel.vue'
import AlgorithmRepositoryView from '@/views/AlgorithmRepositoryView.vue'
import DataResultsView from '@/views/DataResultsView.vue'
import { getGovernanceTaskPage, toPatrolTask, type GovernanceTask } from '@/api/governance-task'
import type { PortalTask, WorkspaceNodeConfig } from '@/types'

type RecognitionMode = 'spots' | 'algorithms' | 'data'

const route = useRoute()
const router = useRouter()
const recognitionModes: RecognitionMode[] = ['algorithms', 'spots', 'data']
const mode = computed<RecognitionMode>(() => recognitionModes.includes(route.params.tab as RecognitionMode) ? route.params.tab as RecognitionMode : 'algorithms')
const tasks = ref<PortalTask[]>([])
const selectedId = ref('')
const loading = ref(false)
const error = ref('')
const selected = computed(() => tasks.value.find(item => item.id === selectedId.value))
const spotNode: WorkspaceNodeConfig = { key:'spot-identification', name:'图斑识别', shortName:'图斑识别', order:3, module:'governance' }
async function loadTasks() { loading.value = true; error.value = ''; try { const page = await getGovernanceTaskPage({ pageNum:1, pageSize:100 }); tasks.value = page.records.map((item:GovernanceTask) => toPatrolTask(item)); if (!selectedId.value && tasks.value[0]) selectedId.value = tasks.value[0].id } catch (e) { error.value = e instanceof Error ? e.message : '任务列表加载失败' } finally { loading.value = false } }
function setMode(nextMode: RecognitionMode) { if (mode.value !== nextMode) void router.push({ name: 'recognition', params: { tab: nextMode } }) }
onMounted(() => void loadTasks())
</script>
<template>
  <div class="recognition-page"><PrimaryHeader /><main><aside><button :class="{active:mode === 'algorithms'}" @click="setMode('algorithms')"><i>◈</i>算法仓库</button><button :class="{active:mode === 'spots'}" @click="setMode('spots')"><i>⌗</i>图斑识别</button><button :class="{active:mode === 'data'}" @click="setMode('data')"><i>▦</i>数据管理</button><div v-if="mode === 'spots'" class="recognition-task-submenu"><small>选择识别任务</small><button v-for="task in tasks" :key="task.id" class="task-button" :class="{selected:selectedId === task.id}" @click="selectedId = task.id"><b>{{ task.name }}</b><span>{{ task.id }}</span></button><p v-if="loading">正在加载任务…</p><p v-else-if="error">{{ error }}</p></div></aside><section class="recognition-content"><SpotIdentificationPanel v-if="mode === 'spots' && selected" :task="selected" :scene-name="selected.sceneId" :node="spotNode" /><div v-else-if="mode === 'spots'" class="empty">请选择一个任务以开始图斑识别</div><AlgorithmRepositoryView v-else-if="mode === 'algorithms'" embedded /><DataResultsView v-else embedded /></section></main></div>
</template>
<style scoped lang="scss">
.recognition-page{width:100%;height:100dvh;min-height:0;display:flex;flex-direction:column;background:#e8eef3}.recognition-page main{flex:1;min-height:0;display:grid;grid-template-columns:190px minmax(0,1fr)}.recognition-page aside{min-height:0;overflow:auto;padding:12px 9px;background:#292832;color:#c4c2cb}.recognition-page aside>button{width:100%;display:flex;align-items:center;gap:11px;margin:4px 0;padding:10px 9px;border:0;border-radius:4px;color:#c5c3cc;background:transparent;cursor:pointer;text-align:left;font-weight:600}.recognition-page aside>button i{width:20px;color:#d3d1d9;font-style:normal;font-size:17px}.recognition-page aside>button.active{color:#fff;background:#4b75e7}.recognition-task-submenu{display:grid;gap:3px;margin:14px 0 2px 13px;padding:5px 0 5px 9px;border-left:1px solid #545365}.recognition-task-submenu small{margin:0 0 3px;color:#c5c3cc;font-size:13px;font-weight:600}.recognition-page aside .recognition-task-submenu .task-button{min-height:31px;display:block;margin:0;padding:7px;color:#aeadba;background:transparent;border:0;border-radius:4px;cursor:pointer;text-align:left;font-size:13px;font-weight:500}.recognition-page aside .recognition-task-submenu .task-button:hover{color:#fff;background:#ffffff12}.recognition-page aside .recognition-task-submenu .task-button.selected{color:#fff;background:#3d5dae;box-shadow:none}.task-button b,.task-button span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.task-button b::before{margin-right:6px;content:'•';color:#a6b3d8}.task-button span{margin-top:3px;color:#8b9aab;font-size:10px}.recognition-page aside p{margin:0;padding:6px 2px;color:#faabab;font-size:11px}.recognition-content{min-width:0;min-height:0;overflow:hidden}.recognition-content>:deep(.governance-page),.recognition-content>:deep(.algorithm-page),.recognition-content>:deep(.results-page){height:100%;min-height:0}.empty{height:100%;display:grid;place-items:center;color:#6c8596;background:#f5f8fa}@media(max-width:1100px){.recognition-page main{grid-template-columns:160px minmax(0,1fr)}.recognition-page aside{padding-inline:6px}}
</style>
