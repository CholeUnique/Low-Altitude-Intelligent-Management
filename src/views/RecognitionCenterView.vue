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
type DataTab = 'overview' | 'tasks' | 'abnormal' | 'scenes'

const route = useRoute()
const router = useRouter()
const recognitionModes: RecognitionMode[] = ['algorithms', 'spots', 'data']
const recognitionNavItems = [
  { key: 'algorithms' as const, icon: '◈', label: '算法仓库' },
  { key: 'spots' as const, icon: '⌗', label: '图斑识别' },
  { key: 'data' as const, icon: '▦', label: '数据管理' },
]
const dataNavItems: Array<{ key: DataTab; label: string }> = [
  { key: 'overview', label: '数据总览' },
  { key: 'tasks', label: '任务统计' },
  { key: 'abnormal', label: '异常图斑' },
  { key: 'scenes', label: '场景成果' },
]
const mode = computed<RecognitionMode>(() => recognitionModes.includes(route.params.tab as RecognitionMode) ? route.params.tab as RecognitionMode : 'algorithms')
const activeDataTab = ref<DataTab>('overview')
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
  <div class="recognition-page"><PrimaryHeader /><main><aside><nav><template v-for="item in recognitionNavItems" :key="item.key"><button :class="{active:mode === item.key}" @click="setMode(item.key)"><i>{{ item.icon }}</i><span><b>{{ item.label }}</b></span><em>›</em></button><div v-if="item.key === 'spots' && mode === 'spots'" class="recognition-task-submenu"><small>选择识别任务</small><button v-for="task in tasks" :key="task.id" class="task-button" :class="{selected:selectedId === task.id}" @click="selectedId = task.id"><b>{{ task.name }}</b><span>{{ task.id }}</span></button><p v-if="loading">正在加载任务…</p><p v-else-if="error">{{ error }}</p></div><div v-if="item.key === 'data' && mode === 'data'" class="recognition-task-submenu recognition-data-submenu"><button v-for="tab in dataNavItems" :key="tab.key" class="task-button" :class="{selected:activeDataTab === tab.key}" @click="activeDataTab = tab.key"><b>{{ tab.label }}</b></button></div></template></nav></aside><section class="recognition-content"><SpotIdentificationPanel v-if="mode === 'spots' && selected" :task="selected" :scene-name="selected.sceneId" :node="spotNode" /><div v-else-if="mode === 'spots'" class="empty">请选择一个任务以开始图斑识别</div><AlgorithmRepositoryView v-else-if="mode === 'algorithms'" embedded /><DataResultsView v-else embedded :active-tab="activeDataTab" /></section></main></div>
</template>
<style scoped lang="scss">
.recognition-page{width:100%;height:100dvh;min-height:0;display:flex;flex-direction:column;background:#e8eef3}.recognition-page main{flex:1;min-height:0;display:grid;grid-template-columns:205px minmax(0,1fr)}.recognition-page aside{min-height:0;overflow:auto;padding:15px 12px;background:linear-gradient(180deg,#06243e 0%,#031c33 100%);color:#d8edf4;border-right:1px solid #0b4969;box-shadow:inset -1px 0 #021426}.recognition-page aside nav{display:grid;gap:9px}.recognition-page aside nav>button{position:relative;z-index:1;width:100%;min-height:52px;display:grid;grid-template-columns:34px minmax(0,1fr) 12px;align-items:center;gap:10px;padding:8px 9px;border:1px solid transparent;border-radius:4px;color:#abc6d3;background:transparent;cursor:pointer;text-align:left;transition:border-color .18s,background .18s,box-shadow .18s,color .18s}.recognition-page aside nav>button::after{position:absolute;right:10px;bottom:-5px;left:10px;border-bottom:1px solid #0d3d59;content:''}.recognition-page aside nav>button:hover{color:#eafaff;background:#0a2d48}.recognition-page aside nav>button>i{width:32px;height:32px;display:grid;place-items:center;color:#61bfd6;background:#093b57;border:1px solid #0c5776;border-radius:5px;font-style:normal;font-size:17px}.recognition-page aside nav>button span,.recognition-page aside nav>button b{display:block;min-width:0}.recognition-page aside nav>button b{overflow:hidden;color:inherit;font-size:15px;text-overflow:ellipsis;white-space:nowrap}.recognition-page aside nav>button>em{color:#668fa1;font-size:22px;font-style:normal}.recognition-page aside nav>button.active{color:#fff;border-color:#1686a8;background:#082f4c;box-shadow:none}.recognition-page aside nav>button.active::before{display:none}.recognition-page aside nav>button.active>i{color:#e8fdff;background:#075a78;border-color:#1686a8}.recognition-page aside nav>button.active>em{color:#48d9eb}.recognition-task-submenu{display:grid;gap:4px;margin:2px 3px 1px 17px;padding:7px 0 5px 10px;border-left:1px solid #15516c}.recognition-task-submenu>small{margin:0 0 4px;color:#7fa8b8;font-size:11px;font-weight:600}.recognition-page aside .recognition-task-submenu .task-button{min-height:34px;display:block;margin:0;padding:7px 8px;color:#8fadb9;background:transparent;border:1px solid transparent;border-radius:4px;cursor:pointer;text-align:left;font-size:12px;font-weight:500}.recognition-page aside .recognition-task-submenu .task-button:hover{color:#fff;background:#0a304b}.recognition-page aside .recognition-task-submenu .task-button.selected{color:#fff;border-color:#1686a8;background:#082f4c;box-shadow:none}.task-button b,.task-button span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.task-button b::before{margin-right:6px;content:'•';color:#22d4ee}.task-button span{margin-top:3px;color:#678b9a;font-size:9px}.recognition-page aside .recognition-task-submenu p{margin:0;padding:6px 2px;color:#ffb7b7;font-size:11px}.recognition-content{min-width:0;min-height:0;overflow:hidden}.recognition-content>:deep(.governance-page),.recognition-content>:deep(.algorithm-page),.recognition-content>:deep(.results-page){height:100%;min-height:0}.empty{height:100%;display:grid;place-items:center;color:#6c8596;background:#f5f8fa}@media(max-width:1100px){.recognition-page main{grid-template-columns:180px minmax(0,1fr)}.recognition-page aside{padding:12px 8px}.recognition-page aside nav>button{grid-template-columns:29px minmax(0,1fr) 9px;gap:7px}.recognition-page aside nav>button>i{width:29px;height:29px}}
.recognition-page aside{overflow-x:hidden}.recognition-page aside nav,.recognition-task-submenu{min-width:0}.recognition-page aside .recognition-task-submenu .task-button{width:100%;min-width:0;box-sizing:border-box}.task-button b{overflow:visible;text-overflow:clip;white-space:normal;overflow-wrap:anywhere;word-break:break-word;line-height:1.45}.task-button span{max-width:100%}
.recognition-data-submenu{padding-top:4px}.recognition-page aside .recognition-data-submenu .task-button{min-height:32px}.recognition-data-submenu .task-button b::before{content:'•'}
</style>
