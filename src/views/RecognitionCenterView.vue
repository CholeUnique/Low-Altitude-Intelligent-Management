<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Cpu, DocumentChecked, Files, Plus } from '@element-plus/icons-vue'
import SpotIdentificationPanel from '@/workspace-components/spot-identification/SpotIdentificationPanel.vue'
import GeneralSpotReviewPanel from '@/workspace-components/spot-identification/GeneralSpotReviewPanel.vue'
import FlightTaskReviewPanel from '@/workspace-components/spot-identification/FlightTaskReviewPanel.vue'
import AlgorithmRepositoryView from '@/views/AlgorithmRepositoryView.vue'
import DataResultsView from '@/views/DataResultsView.vue'
import GeographicTopicsView from '@/views/GeographicTopicsView.vue'
import { getGovernanceTaskPage, toPatrolTask, type GovernanceTask } from '@/api/governance-task'
import type { PortalTask, WorkspaceNodeConfig } from '@/types'
import { useUserStore } from '@/stores/user'
import { HIGH_STANDARD_TOPIC_ID, useGeographicTopicsStore } from '@/stores/geographic-topics'

type RecognitionMode = 'spots' | 'algorithms' | 'data'
type DataTab = 'collection' | 'recognition' | 'topics'
type RecognitionAnalysisMode = 'flight' | 'scene' | 'task-review'

const route = useRoute()
const router = useRouter()
const user = useUserStore()
const topicStore = useGeographicTopicsStore()
const topicsExpanded = ref(true)
const topicDialog = ref<HTMLDialogElement>()
const topicName = ref(''), topicDescription = ref(''), topicFormError = ref('')
const selectedTopic = computed(() => topicStore.topics.find(item => item.id === route.query.topic) || topicStore.topics[0]!)
const recognitionModes: RecognitionMode[] = ['algorithms', 'spots', 'data']
const recognitionNavItems = computed(() => [
  { key: 'spots' as const, icon: DocumentChecked, label: '任务研判', permission: 'smart-recognition' as const },
  { key: 'algorithms' as const, icon: Cpu, label: '算法分析', permission: 'algorithm-analysis' as const },
  { key: 'data' as const, icon: Files, label: '数据管理', permission: 'data-management' as const },
].filter((item) => user.hasPermission(item.permission)))
const dataNavItems: Array<{ key: DataTab; label: string; disabled?: boolean }> = [
  { key: 'collection', label: '采集数据' },
  { key: 'recognition', label: '识别成果', disabled: true },
  { key: 'topics', label: '专题数据管理' },
]
const mode = computed<RecognitionMode>(() => recognitionModes.includes(route.params.tab as RecognitionMode) ? route.params.tab as RecognitionMode : 'spots')
const recognitionAnalysisItems = [
  { key: 'flight' as const, label: 'AI线索发现', disabled: false },
  { key: 'scene' as const, label: '场景异常识别', disabled: false },
  { key: 'task-review' as const, label: '核查任务研判', disabled: false },
]
const firstRecognitionMode: RecognitionAnalysisMode = 'flight'
function recognitionModeFromRoute(): RecognitionAnalysisMode {
  const rawQueryMode = typeof route.query.analysis === 'string' ? route.query.analysis : ''
  const queryMode = rawQueryMode === 'general' ? 'task-review' : rawQueryMode
  return recognitionAnalysisItems.find((item) => item.key === queryMode && !item.disabled)?.key || firstRecognitionMode
}
// 兼容主分支已有的 analysis 链接；新版专题导航使用独立的 dataTab 参数。
const activeDataTab = computed<DataTab>(() => dataNavItems.find(item => item.key === (route.query.dataTab ?? route.query.analysis) && !item.disabled)?.key || 'collection')
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
function setDataTab(tab: DataTab) {
  if (!dataNavItems.some(item => item.key === tab && !item.disabled)) return
  if (tab === 'topics' && activeDataTab.value === 'topics') { topicsExpanded.value = !topicsExpanded.value; return }
  topicsExpanded.value = true
  void router.push({name:'recognition',params:{tab:'data'},query:{dataTab:tab,...(tab === 'topics' ? {topic:selectedTopic.value.id} : {})}})
}
function selectTopic(id: string) {
  topicsExpanded.value = true
  void router.push({name:'recognition',params:{tab:'data'},query:{dataTab:'topics',topic:id}})
}
function openTopicDialog() {
  topicName.value = ''; topicDescription.value = ''; topicFormError.value = ''
  topicDialog.value?.showModal()
}
function createTopic() {
  try {
    const topic = topicStore.addTopic(topicName.value,topicDescription.value)
    topicDialog.value?.close(); selectTopic(topic.id)
  } catch (reason) { topicFormError.value = reason instanceof Error ? reason.message : '专题创建失败' }
}
watch(() => route.query.topic, () => { if (activeDataTab.value === 'topics') topicsExpanded.value = true })
watch(() => user.activeDeptId, () => {
  topicDialog.value?.close()
  if (mode.value === 'data' && activeDataTab.value === 'topics') {
    void router.replace({name:'recognition',params:{tab:'data'},query:{dataTab:'topics',topic:HIGH_STANDARD_TOPIC_ID}})
  }
})
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
  if (nextMode === 'spots') {
    const resolved = recognitionModeFromRoute()
    activeRecognitionMode.value = resolved
    if (route.query.analysis !== resolved) void router.replace({ name:'recognition', params:{ tab:'spots' }, query:{ ...route.query, analysis:resolved } })
  }
}, { immediate: true })
onMounted(() => void loadTasks())
</script>
<template>
  <div class="recognition-page">
    <main>
      <aside><nav>
        <template v-for="item in recognitionNavItems" :key="item.key">
          <button :class="{active:mode === item.key}" @click="setMode(item.key)"><i aria-hidden="true"><component :is="item.icon" /></i><span><b>{{ item.label }}</b></span><em>›</em></button>
          <div v-if="item.key === 'spots' && mode === 'spots'" class="recognition-task-submenu recognition-analysis-submenu">
            <button v-for="analysis in recognitionAnalysisItems" :key="analysis.key" class="task-button" :class="{selected:activeRecognitionMode === analysis.key,unavailable:analysis.disabled}" :disabled="analysis.disabled" @click="setRecognitionMode(analysis.key)"><b>{{ analysis.label }}</b></button>
          </div>
          <div v-if="item.key === 'data' && mode === 'data'" class="recognition-task-submenu recognition-data-submenu">
            <template v-for="tab in dataNavItems" :key="tab.key">
              <div v-if="tab.key === 'topics'" class="topic-menu-entry">
                <div class="topic-menu-row">
                  <button class="task-button" :class="{selected:activeDataTab === 'topics'}" :aria-expanded="activeDataTab === 'topics' && topicsExpanded" @click="setDataTab('topics')"><b>专题数据管理</b></button>
                  <button class="topic-add" aria-label="新增专题场景" title="新增专题场景" @click.stop="openTopicDialog"><Plus /></button>
                </div>
                <div v-if="activeDataTab === 'topics' && topicsExpanded" class="topic-scene-menu" aria-label="专题场景">
                  <button v-for="topic in topicStore.topics" :key="topic.id" :class="{selected:selectedTopic.id === topic.id}" :aria-current="selectedTopic.id === topic.id ? 'page' : undefined" :title="topic.name" @click="selectTopic(topic.id)">{{ topic.name }}</button>
                </div>
              </div>
              <button v-else class="task-button" :class="{selected:activeDataTab === tab.key,unavailable:tab.disabled}" :disabled="tab.disabled" @click="setDataTab(tab.key)"><b>{{ tab.label }}</b></button>
            </template>
          </div>
        </template>
      </nav></aside>
      <section class="recognition-content">
        <SpotIdentificationPanel v-if="mode === 'spots' && activeRecognitionMode === 'scene'" :task="selected" :tasks="governanceTasks" :selected-task-id="selectedId" :task-loading="loading" :task-error="error" :scene-name="selected?.sceneId" :node="spotNode" @select-task="selectedId = $event" />
        <GeneralSpotReviewPanel v-else-if="mode === 'spots' && activeRecognitionMode === 'task-review'" />
        <FlightTaskReviewPanel v-else-if="mode === 'spots' && activeRecognitionMode === 'flight'" />
        <AlgorithmRepositoryView v-else-if="mode === 'algorithms'" embedded />
        <GeographicTopicsView v-else-if="activeDataTab === 'topics'" :topic="selectedTopic" />
        <DataResultsView v-else embedded :active-tab="activeDataTab" />
      </section>
    </main>
    <dialog ref="topicDialog" class="topic-create-dialog" aria-labelledby="topic-create-title">
      <form @submit.prevent="createTopic">
        <header><h2 id="topic-create-title">新增专题场景</h2><button type="button" aria-label="关闭新增专题" @click="topicDialog?.close()">×</button></header>
        <p>专题与业务任务场景独立。当前保存到本机浏览器，按账号及部门隔离。</p>
        <label>专题名称<input v-model.trim="topicName" required maxlength="30" placeholder="输入专题名称" autofocus :aria-invalid="Boolean(topicFormError)" /></label>
        <span v-if="topicFormError" class="topic-form-error" role="alert">{{ topicFormError }}</span>
        <label>专题说明<textarea v-model="topicDescription" maxlength="200" rows="3" placeholder="选填，可描述这个专题展示的内容"></textarea></label>
        <p v-if="topicStore.storageError" class="topic-form-error" role="alert">{{ topicStore.storageError }}</p>
        <footer><button type="button" @click="topicDialog?.close()">取消</button><button type="submit">创建专题</button></footer>
      </form>
    </dialog>
  </div>
</template>
<style scoped lang="scss">
.topic-menu-row{display:flex;align-items:center;gap:4px;min-width:0}.recognition-page aside .topic-menu-row>.task-button{flex:1;min-width:0;width:auto}.topic-add{display:grid;place-items:center;flex:none;width:25px;height:25px;border:1px solid #276079;border-radius:5px;color:#7cdae9;background:#164a62;cursor:pointer;opacity:0;pointer-events:none;transition:opacity .15s,background .15s}.topic-add svg{width:15px;height:15px}.topic-menu-entry:hover .topic-add,.topic-menu-row:focus-within .topic-add{opacity:1;pointer-events:auto}.topic-add:hover{background:#236880}.topic-scene-menu{display:grid;gap:4px;min-width:0;margin:5px 0 8px 14px;padding-left:9px;border-left:1px solid #276079}.topic-scene-menu button{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:8px 7px;border:1px solid transparent;border-radius:4px;background:transparent;color:#9ec3d3;text-align:left;font:inherit;font-size:12px;cursor:pointer}.topic-scene-menu button:hover{background:#15445d;color:#fff}.topic-scene-menu button.selected{color:#8eeeff;background:#0b3952;border-color:#20637f}.topic-create-dialog{width:410px;max-width:calc(100vw - 40px);box-sizing:border-box;border:1px solid #36758b;border-radius:12px;padding:24px;background:#0c2c40;color:#e7f6fa;box-shadow:0 24px 80px #00111daa}.topic-create-dialog::backdrop{background:#00121e88;backdrop-filter:blur(3px)}.topic-create-dialog form{display:grid;gap:15px}.topic-create-dialog header{display:flex;align-items:center;justify-content:space-between}.topic-create-dialog h2{margin:0;font-size:18px}.topic-create-dialog header button{border:0;background:transparent;color:inherit;font-size:24px;cursor:pointer}.topic-create-dialog p{margin:0;color:#a4c6d3;font-size:12px;line-height:1.7}.topic-create-dialog label{display:grid;gap:9px;font-size:13px}.topic-create-dialog input,.topic-create-dialog textarea{width:100%;box-sizing:border-box;border:1px solid #36758b;border-radius:5px;background:#123b50;color:#effbff;padding:10px;font:inherit;resize:vertical}.topic-create-dialog input:focus,.topic-create-dialog textarea:focus{outline:2px solid #3fc8df55;border-color:#57cadb}.topic-create-dialog footer{display:flex;justify-content:flex-end;gap:10px;margin-top:5px}.topic-create-dialog footer button{padding:8px 16px;border:1px solid #36758b;border-radius:5px;background:transparent;color:inherit;cursor:pointer}.topic-create-dialog footer button[type=submit]{background:#168bad;border-color:#2bb8d0}.topic-create-dialog .topic-form-error{color:#f7a698;font-size:12px}@media(hover:none){.topic-add{opacity:1;pointer-events:auto}}
.recognition-page{width:100%;height:100dvh;min-height:0;display:flex;flex-direction:column;background:#e8eef3}.recognition-page main{flex:1;min-height:0;display:grid;grid-template-columns:220px minmax(0,1fr)}.recognition-page aside{min-height:0;overflow:auto;padding:15px 12px;background:linear-gradient(180deg,#06243e 0%,#031c33 100%);color:#d8edf4;border-right:1px solid #0b4969;box-shadow:inset -1px 0 #021426}.recognition-page aside nav{display:grid;gap:9px}.recognition-page aside nav>button{position:relative;z-index:1;width:100%;min-height:52px;display:grid;grid-template-columns:36px minmax(0,1fr) 12px;align-items:center;gap:10px;padding:8px 9px;border:1px solid transparent;border-radius:4px;color:#abc6d3;background:transparent;cursor:pointer;text-align:left;transition:border-color .18s,background .18s,box-shadow .18s,color .18s}.recognition-page aside nav>button::after{position:absolute;right:10px;bottom:-5px;left:10px;border-bottom:1px solid #0d3d59;content:''}.recognition-page aside nav>button:hover{color:#eafaff;background:#0a2d48}.recognition-page aside nav>button>i{width:34px;height:34px;display:grid;place-items:center;color:#61bfd6;background:#093b57;border:1px solid #0c5776;border-radius:5px;font-style:normal;font-size:19px}.recognition-page aside nav>button span,.recognition-page aside nav>button b{display:block;min-width:0}.recognition-page aside nav>button b{overflow:hidden;color:inherit;font-size:17px;text-overflow:ellipsis;white-space:nowrap}.recognition-page aside nav>button>em{color:#668fa1;font-size:22px;font-style:normal}.recognition-page aside nav>button.active{color:#fff;border-color:#1686a8;background:#082f4c;box-shadow:none}.recognition-page aside nav>button.active::before{display:none}.recognition-page aside nav>button.active>i{color:#e8fdff;background:#075a78;border-color:#1686a8}.recognition-page aside nav>button.active>em{color:#48d9eb}.recognition-task-submenu{display:grid;gap:4px;margin:2px 3px 1px 17px;padding:7px 0 5px 10px;border-left:1px solid #15516c}.recognition-task-submenu>small{margin:0 0 4px;color:#7fa8b8;font-size:12px;font-weight:600}.recognition-page aside .recognition-task-submenu .task-button{min-height:36px;display:block;margin:0;padding:7px 8px;color:#8fadb9;background:transparent;border:1px solid transparent;border-radius:4px;cursor:pointer;text-align:left;font-size:14px;font-weight:500}.recognition-page aside .recognition-task-submenu .task-button:hover{color:#fff;background:#0a304b}.recognition-page aside .recognition-task-submenu .task-button.selected{color:#fff;border-color:#1686a8;background:#082f4c;box-shadow:none}.task-button b,.task-button span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.task-button b::before{margin-right:6px;content:'•';color:#22d4ee}.task-button span{margin-top:3px;color:#678b9a;font-size:11px}.recognition-page aside .recognition-task-submenu p{margin:0;padding:6px 2px;color:#ffb7b7;font-size:12px}.recognition-content{min-width:0;min-height:0;overflow:hidden}.recognition-content>:deep(.governance-page),.recognition-content>:deep(.algorithm-page),.recognition-content>:deep(.results-page){height:100%;min-height:0}.empty{height:100%;display:grid;place-items:center;color:#6c8596;background:#f5f8fa}@media(max-width:1200px){.recognition-page main{grid-template-columns:190px minmax(0,1fr)}.recognition-page aside{padding:12px 8px}.recognition-page aside nav>button{grid-template-columns:34px minmax(0,1fr) 9px;gap:7px}}
.recognition-page aside{overflow-x:hidden}.recognition-page aside nav,.recognition-task-submenu{min-width:0}.recognition-page aside .recognition-task-submenu .task-button{width:100%;min-width:0;box-sizing:border-box}.task-button b{overflow:visible;text-overflow:clip;white-space:normal;overflow-wrap:anywhere;word-break:break-word;line-height:1.45}.task-button span{max-width:100%}
.recognition-data-submenu{padding-top:4px}.recognition-page aside .recognition-data-submenu .task-button{min-height:32px}.recognition-data-submenu .task-button b::before{content:'•'}
.recognition-page aside .recognition-data-submenu .task-button.unavailable{color:#577889;cursor:not-allowed;opacity:.58}.recognition-page aside .recognition-data-submenu .task-button.unavailable:hover{color:#577889;background:transparent}
.recognition-analysis-submenu{padding-top:5px}.recognition-page aside .recognition-analysis-submenu .task-button{min-height:38px}.recognition-page aside .recognition-analysis-submenu .task-button.unavailable{color:#577889;cursor:not-allowed;opacity:.58}.recognition-page aside .recognition-analysis-submenu .task-button.unavailable:hover{color:#577889;background:transparent}.recognition-analysis-submenu .task-button span{padding-left:13px}.recognition-analysis-submenu .task-button b::before{content:'•'}
.recognition-page aside nav>button>i { color:#9bd7e9; background:linear-gradient(145deg,#114762,#0b354e); border-color:#226682; border-radius:8px; box-shadow:inset 0 1px #ffffff12; transition:background .18s,border-color .18s,color .18s; }
.recognition-page aside nav>button>i svg { width:19px; height:19px; }
.recognition-page aside nav>button:hover>i { color:#e9faff; background:linear-gradient(145deg,#17607e,#0d4462); border-color:#4aacc8; }
.recognition-page aside nav>button.active>i { color:#fff; background:linear-gradient(145deg,#1685a6,#0e617f); border-color:#63cae2; }
</style>
