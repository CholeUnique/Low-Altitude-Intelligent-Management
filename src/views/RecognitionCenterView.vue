<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PrimaryHeader from '@/components/PrimaryHeader.vue'
import SpotIdentificationPanel from '@/workspace-components/spot-identification/SpotIdentificationPanel.vue'
import GeneralSpotReviewPanel from '@/workspace-components/spot-identification/GeneralSpotReviewPanel.vue'
import AlgorithmRepositoryView from '@/views/AlgorithmRepositoryView.vue'
import DataResultsView from '@/views/DataResultsView.vue'
import { getGovernanceTaskPage, toPatrolTask, type GovernanceTask } from '@/api/governance-task'
import type { PortalTask, WorkspaceNodeConfig } from '@/types'
import { useUserStore } from '@/stores/user'

type RecognitionMode = 'spots' | 'algorithms' | 'data'
type DataTab = 'collection' | 'recognition'
type RecognitionAnalysisMode = 'flight' | 'scene' | 'general'

const route = useRoute()
const router = useRouter()
const user = useUserStore()
const recognitionModes: RecognitionMode[] = ['algorithms', 'spots', 'data']
const recognitionNavItems = computed(() => [
  { key: 'spots' as const, icon: '⌗', label: '智能识别', permission: 'smart-recognition' as const },
  { key: 'algorithms' as const, icon: '◈', label: '算法分析', permission: 'algorithm-analysis' as const },
  { key: 'data' as const, icon: '▦', label: '数据管理', permission: 'data-management' as const },
].filter((item) => user.hasPermission(item.permission)))
const dataNavItems: Array<{ key: DataTab; label: string; disabled?: boolean }> = [
  { key: 'collection', label: '采集数据' },
  { key: 'recognition', label: '识别成果', disabled: true },
]
const mode = computed<RecognitionMode>(() => recognitionModes.includes(route.params.tab as RecognitionMode) ? route.params.tab as RecognitionMode : 'spots')
const recognitionAnalysisItems = [
  { key: 'flight' as const, label: '飞行任务研判', disabled: true },
  { key: 'general' as const, label: '通用任务研判', disabled: false },
  { key: 'scene' as const, label: '场景任务研判', disabled: false },
]
const firstRecognitionMode = recognitionAnalysisItems.find((item) => !item.disabled)?.key || 'scene'
function recognitionModeFromRoute(): RecognitionAnalysisMode {
  const queryMode = typeof route.query.analysis === 'string' ? route.query.analysis : ''
  return recognitionAnalysisItems.find((item) => item.key === queryMode && !item.disabled)?.key || firstRecognitionMode
}
const activeDataTab = ref<DataTab>(dataNavItems.find((item) => !item.disabled)?.key || 'collection')
const activeRecognitionMode = ref<RecognitionAnalysisMode>(recognitionModeFromRoute())
const governanceTasks = ref<GovernanceTask[]>([])
const tasks = ref<PortalTask[]>([])
const selectedId = ref('')
const loading = ref(false)
const error = ref('')
const selected = computed(() => tasks.value.find(item => item.id === selectedId.value))
const spotNode: WorkspaceNodeConfig = { key:'spot-identification', name:'图斑识别', shortName:'图斑识别', order:3, module:'governance' }
async function loadTasks() {
  loading.value = true
  error.value = ''
  try {
    const first = await getGovernanceTaskPage({ pageNum: 1, pageSize: 100 })
    const allTasks = [...first.records]
    const actualPageSize = Math.max(1, first.records.length || first.pageSize || 100)
    const pageCount = Math.ceil(first.total / actualPageSize)
    for (let pageNum = 2; pageNum <= pageCount; pageNum += 1) {
      const page = await getGovernanceTaskPage({ pageNum, pageSize: 100 })
      allTasks.push(...page.records)
    }
    governanceTasks.value = allTasks
    tasks.value = allTasks.map((item) => toPatrolTask(item))
    if (!tasks.value.some((task) => task.id === selectedId.value)) selectedId.value = tasks.value[0]?.id || ''
  } catch (e) {
    governanceTasks.value = []
    tasks.value = []
    selectedId.value = ''
    error.value = e instanceof Error ? e.message : '任务列表加载失败'
  } finally {
    loading.value = false
  }
}
function setMode(nextMode: RecognitionMode) { if (mode.value !== nextMode) void router.push({ name: 'recognition', params: { tab: nextMode } }) }
function setRecognitionMode(nextMode: RecognitionAnalysisMode) {
  const target = recognitionAnalysisItems.find((item) => item.key === nextMode)
  if (!target || target.disabled) return
  activeRecognitionMode.value = nextMode
  if (mode.value === 'spots' && route.query.analysis !== nextMode) {
    void router.push({
      name: 'recognition',
      params: { tab: 'spots' },
      query: { ...route.query, analysis: nextMode },
    })
  }
}
watch([mode, () => route.query.analysis], ([nextMode]) => {
  if (nextMode === 'spots') activeRecognitionMode.value = recognitionModeFromRoute()
  if (nextMode === 'data') activeDataTab.value = dataNavItems.find((item) => !item.disabled)?.key || 'collection'
}, { immediate: true })
onMounted(() => void loadTasks())
</script>
<template>
  <div class="recognition-page"><PrimaryHeader /><main><aside><nav><template v-for="item in recognitionNavItems" :key="item.key"><button :class="{active:mode === item.key}" @click="setMode(item.key)"><i>{{ item.icon }}</i><span><b>{{ item.label }}</b></span><em>›</em></button><div v-if="item.key === 'spots' && mode === 'spots'" class="recognition-task-submenu recognition-analysis-submenu"><button v-for="analysis in recognitionAnalysisItems" :key="analysis.key" class="task-button" :class="{selected:activeRecognitionMode === analysis.key,unavailable:analysis.disabled}" :disabled="analysis.disabled" @click="setRecognitionMode(analysis.key)"><b>{{ analysis.label }}</b></button></div><div v-if="item.key === 'data' && mode === 'data'" class="recognition-task-submenu recognition-data-submenu"><button v-for="tab in dataNavItems" :key="tab.key" class="task-button" :class="{selected:activeDataTab === tab.key,unavailable:tab.disabled}" :disabled="tab.disabled" @click="activeDataTab = tab.key"><b>{{ tab.label }}</b></button></div></template></nav></aside><section class="recognition-content"><SpotIdentificationPanel v-if="mode === 'spots' && activeRecognitionMode === 'scene'" :task="selected" :tasks="governanceTasks" :selected-task-id="selectedId" :task-loading="loading" :task-error="error" :scene-name="selected?.sceneId" :node="spotNode" @select-task="selectedId = $event" /><GeneralSpotReviewPanel v-else-if="mode === 'spots' && activeRecognitionMode === 'general'" /><div v-else-if="mode === 'spots'" class="empty">飞行任务研判暂未开放</div><AlgorithmRepositoryView v-else-if="mode === 'algorithms'" embedded /><DataResultsView v-else embedded :active-tab="activeDataTab" /></section></main></div>
</template>
<style scoped lang="scss">
.recognition-page{width:100%;height:100dvh;min-height:0;display:flex;flex-direction:column;background:#e8eef3}.recognition-page main{flex:1;min-height:0;display:grid;grid-template-columns:220px minmax(0,1fr)}.recognition-page aside{min-height:0;overflow:auto;padding:15px 12px;background:linear-gradient(180deg,#06243e 0%,#031c33 100%);color:#d8edf4;border-right:1px solid #0b4969;box-shadow:inset -1px 0 #021426}.recognition-page aside nav{display:grid;gap:9px}.recognition-page aside nav>button{position:relative;z-index:1;width:100%;min-height:52px;display:grid;grid-template-columns:36px minmax(0,1fr) 12px;align-items:center;gap:10px;padding:8px 9px;border:1px solid transparent;border-radius:4px;color:#abc6d3;background:transparent;cursor:pointer;text-align:left;transition:border-color .18s,background .18s,box-shadow .18s,color .18s}.recognition-page aside nav>button::after{position:absolute;right:10px;bottom:-5px;left:10px;border-bottom:1px solid #0d3d59;content:''}.recognition-page aside nav>button:hover{color:#eafaff;background:#0a2d48}.recognition-page aside nav>button>i{width:34px;height:34px;display:grid;place-items:center;color:#61bfd6;background:#093b57;border:1px solid #0c5776;border-radius:5px;font-style:normal;font-size:19px}.recognition-page aside nav>button span,.recognition-page aside nav>button b{display:block;min-width:0}.recognition-page aside nav>button b{overflow:hidden;color:inherit;font-size:17px;text-overflow:ellipsis;white-space:nowrap}.recognition-page aside nav>button>em{color:#668fa1;font-size:22px;font-style:normal}.recognition-page aside nav>button.active{color:#fff;border-color:#1686a8;background:#082f4c;box-shadow:none}.recognition-page aside nav>button.active::before{display:none}.recognition-page aside nav>button.active>i{color:#e8fdff;background:#075a78;border-color:#1686a8}.recognition-page aside nav>button.active>em{color:#48d9eb}.recognition-task-submenu{display:grid;gap:4px;margin:2px 3px 1px 17px;padding:7px 0 5px 10px;border-left:1px solid #15516c}.recognition-task-submenu>small{margin:0 0 4px;color:#7fa8b8;font-size:12px;font-weight:600}.recognition-page aside .recognition-task-submenu .task-button{min-height:36px;display:block;margin:0;padding:7px 8px;color:#8fadb9;background:transparent;border:1px solid transparent;border-radius:4px;cursor:pointer;text-align:left;font-size:14px;font-weight:500}.recognition-page aside .recognition-task-submenu .task-button:hover{color:#fff;background:#0a304b}.recognition-page aside .recognition-task-submenu .task-button.selected{color:#fff;border-color:#1686a8;background:#082f4c;box-shadow:none}.task-button b,.task-button span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.task-button b::before{margin-right:6px;content:'•';color:#22d4ee}.task-button span{margin-top:3px;color:#678b9a;font-size:11px}.recognition-page aside .recognition-task-submenu p{margin:0;padding:6px 2px;color:#ffb7b7;font-size:12px}.recognition-content{min-width:0;min-height:0;overflow:hidden}.recognition-content>:deep(.governance-page),.recognition-content>:deep(.algorithm-page),.recognition-content>:deep(.results-page){height:100%;min-height:0}.empty{height:100%;display:grid;place-items:center;color:#6c8596;background:#f5f8fa}@media(max-width:1200px){.recognition-page main{grid-template-columns:190px minmax(0,1fr)}.recognition-page aside{padding:12px 8px}.recognition-page aside nav>button{grid-template-columns:34px minmax(0,1fr) 9px;gap:7px}}
.recognition-page aside{overflow-x:hidden}.recognition-page aside nav,.recognition-task-submenu{min-width:0}.recognition-page aside .recognition-task-submenu .task-button{width:100%;min-width:0;box-sizing:border-box}.task-button b{overflow:visible;text-overflow:clip;white-space:normal;overflow-wrap:anywhere;word-break:break-word;line-height:1.45}.task-button span{max-width:100%}
.recognition-data-submenu{padding-top:4px}.recognition-page aside .recognition-data-submenu .task-button{min-height:32px}.recognition-data-submenu .task-button b::before{content:'•'}
.recognition-page aside .recognition-data-submenu .task-button.unavailable{color:#577889;cursor:not-allowed;opacity:.58}.recognition-page aside .recognition-data-submenu .task-button.unavailable:hover{color:#577889;background:transparent}
.recognition-analysis-submenu{padding-top:5px}.recognition-page aside .recognition-analysis-submenu .task-button{min-height:38px}.recognition-page aside .recognition-analysis-submenu .task-button.unavailable{color:#577889;cursor:not-allowed;opacity:.58}.recognition-page aside .recognition-analysis-submenu .task-button.unavailable:hover{color:#577889;background:transparent}.recognition-analysis-submenu .task-button span{padding-left:13px}.recognition-analysis-submenu .task-button b::before{content:'•'}
</style>
