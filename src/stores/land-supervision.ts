import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { useUserStore } from './user'
import * as api from '@/api/land-supervision'
import { LAND_WARNING_SCENE, LAND_RECTIFICATION_SCENE, type LandTask, type LandTaskAction, type LandTaskCreate, type LandEvidence, type LandSceneCode, type SupervisionRegion, type LandTopicObject } from '@/types/land-supervision'
import { validateLandAction, newLandRequestId, demoLandStatistics } from '@/utils/land-supervision'
import { isNaturalResourcesTopicDepartment } from '@/utils/topic-access'
import { geodesicArea } from '@/utils/map-measurement'

const polygon = (x: number, y: number, size: number): GeoJSON.Polygon => ({ type: 'Polygon', coordinates: [[[x,y],[x+size,y],[x+size,y+size],[x,y+size],[x,y]]] })
const now = () => new Date().toISOString()
const uid = newLandRequestId
export const useLandSupervisionStore = defineStore('land-supervision', () => {
  const user = useUserStore()
  const demo = ref(false), demoRegions = ref<SupervisionRegion[]>([]), demoTasks = ref<LandTask[]>([])
  const temporaryRegions = ref<SupervisionRegion[]>([])
  const urls = new Set<string>()
  const context = computed(() => `${user.currentUser?.id}:${user.activeDeptId}:${user.organizationId}`)
  watch(context, () => { demo.value = false; demoRegions.value = []; demoTasks.value = []; temporaryRegions.value=[]; api.clearLandSession(); urls.forEach(url => URL.revokeObjectURL(url)); urls.clear() })
  function assertAccess() { if (!isNaturalResourcesTopicDepartment(user)) throw new Error('请切换到自然资源和规划局。') }
  function assertLive() { assertAccess(); if (!api.landSupervisionEnabled) throw new Error('当前环境尚未开启场景接口，可打开交互演示预览页面。') }
  function disableDemo(){demo.value=false;demoRegions.value=[];demoTasks.value=[];urls.forEach(url=>URL.revokeObjectURL(url));urls.clear()}
  function enableDemo() {
    assertAccess()
    if (demo.value) return
    demo.value = true
    demoRegions.value = [
      { id: 'demo-region-1', name: '城北重点巡查片区（演示）', geometry: polygon(119.907,32.510,.018) },
      { id: 'demo-region-2', name: '城中建设监管片区（演示）', geometry: polygon(119.920,32.486,.018) },
      { id: 'demo-region-3', name: '城南用地监管片区（演示）', geometry: polygon(119.910,32.462,.018) },
    ]
    demoTasks.value = []
    const names = ['疑似新增硬化地面', '疑似临时建筑', '地块恢复整改']
    names.forEach((name, i) => {
      const region = demoRegions.value[i]!
      const [x,y] = region.geometry.type === 'Polygon' ? region.geometry.coordinates[0]![0]! : [119.92,32.48]
      const task = demoCreate({ sceneCode: i === 2 ? LAND_RECTIFICATION_SCENE : LAND_WARNING_SCENE, resultTypeCode: i === 2 ? 'RECTIFY_PROGRESS' : 'SUSPECT_PATCH', name: `${name}（演示）`, description: '用于页面交互演示的样例，不代表真实违法事实。', priority: 2, regionIds: [region.id], geometry: polygon(x!+.005,y!+.005,.0015), requestId: uid() })
      if (i === 1) {
        task.stage = 'INSPECTION'; task.version=2; task.currentHandlerName = '演示核查人'
        task.currentNode = {id:`${task.id}:INSPECTION`,key:'INSPECTION',assigneeName:'演示核查人',canOperate:true}
        task.history.push({id:uid(),nodeKey:'DISPATCH',action:'DISPATCH',actorId:'demo-manager',actorName:'演示场景负责人',time:now(),description:'演示派发记录，请核查现场。',evidence:[]})
      }
    })
  }
  function demoCreate(input: LandTaskCreate) {
    const id = `demo-${uid()}`, time = now()
    const outer = input.geometry.type === 'Polygon' ? input.geometry.coordinates[0]! : input.geometry.coordinates[0]![0]!
    const areaSqm = geodesicArea(outer.map(p => ({ lng: p[0]!, lat: p[1]! })))
    const task: LandTask = { ...input, id, taskNo: `DEMO-${demoTasks.value.length+1}`, stage: 'DISPATCH', version: 1, areaSqm, createTime: time,
      currentHandlerName: '演示场景负责人', currentNode: { id: `${id}:DISPATCH`, key: 'DISPATCH', assigneeName: '演示场景负责人', canOperate: true },
      history: [{ id: uid(), nodeKey: 'ACCEPTANCE', action: 'CREATE', actorId:String(user.currentUser?.id||''), actorName: user.name, time, description: input.description, evidence: [] }] }
    demoTasks.value.unshift(task)
    return task
  }
  async function regions(sceneCode: LandSceneCode) {
    assertAccess(); if (demo.value) return demoRegions.value
    assertLive(); return [...await api.listSupervisionRegions(user.activeDeptId || '', sceneCode),...temporaryRegions.value]
  }
  async function objects(sceneCode: LandSceneCode): Promise<LandTopicObject[]> {
    assertAccess()
    if(demo.value)return demoRegions.value.map(item=>({...item,objectType:'SCOPE' as const}))
    assertLive(); return [...await api.listLandObjects(user.activeDeptId || '',sceneCode),...temporaryRegions.value.map(item=>({...item,objectType:'SCOPE' as const}))]
  }
  async function page(sceneCode: LandSceneCode, regionIds: string[], keyword = '', stage = '', pageNum = 1) {
    assertAccess()
    if (!demo.value) { assertLive(); return api.listLandTasks({ deptId: user.activeDeptId || '', sceneCode, regionIds, keyword, stage: stage || undefined, pageNum, pageSize: 10 }) }
    const scoped = demoTasks.value.filter(t => t.sceneCode === sceneCode && t.regionIds.some(id => regionIds.includes(id)))
    const records = scoped.filter(t => `${t.name} ${t.taskNo}`.includes(keyword) && (!stage || t.stage === stage))
    return { records: records.slice((pageNum-1)*10,pageNum*10), total: records.length, pageNum, pageSize: 10, statistics: demoLandStatistics(sceneCode, scoped) }
  }
  async function create(input: LandTaskCreate) { assertAccess(); if (demo.value) return demoCreate(input); assertLive(); return api.createLandTask(user.activeDeptId || '',input) }
  async function detail(id: string) {
    assertAccess()
    if(!demo.value&&id.startsWith('demo-'))throw new Error('演示任务已因刷新而清空，请返回专题重新打开交互演示。')
    if(demo.value&&!id.startsWith('demo-'))throw new Error('请先在专题页退出演示，再查看真实任务。')
    if (demo.value && id.startsWith('demo-')) { const task = demoTasks.value.find(t => t.id === id); if (!task) throw new Error('演示任务已失效，请返回专题重新打开演示。'); return task }
    assertLive(); return api.getLandTask(user.activeDeptId || '',id,String(user.currentUser?.id||''))
  }
  async function upload(task: LandTask, file: File, kind: LandEvidence['kind'], mediaId?: string): Promise<LandEvidence> {
    assertAccess()
    if (!task.currentNode?.canOperate) throw new Error('当前节点不可上传材料。')
    if (!demo.value) { assertLive(); const item=await api.uploadLandEvidence(user.activeDeptId || '',task.id,task.currentNode.id,file,kind,mediaId);if(item.url?.startsWith('blob:'))urls.add(item.url);return item }
    const url = URL.createObjectURL(file); urls.add(url)
    return { id: uid(), name: file.name, kind, url, mediaId }
  }
  async function action(input: LandTaskAction, evidence: LandEvidence[]) {
    assertAccess()
    if (!demo.value) { assertLive(); return api.actOnLandTask(user.activeDeptId || '',input) }
    const task = await detail(input.taskId)
    validateLandAction(task,input,evidence)
    const previous = task.stage
    if (input.action === 'DISPATCH') { task.stage = task.sceneCode === LAND_WARNING_SCENE ? 'INSPECTION' : 'RECTIFY'; task.deadline = input.deadline; task.currentHandlerName = input.assigneeName || '演示办理人' }
    if (input.action === 'SUBMIT_INSPECTION') { task.stage = 'CONFIRM'; task.conclusion = input.conclusion }
    if (input.action === 'RETURN_INSPECTION') task.stage = 'INSPECTION'
    if (input.action === 'CONFIRM_CLOSE' || input.action === 'APPROVE_CLOSE') task.stage = 'CLOSED'
    if (input.action === 'SUBMIT_RECTIFICATION') task.stage = 'REVIEW'
    if (input.action === 'RETURN_RECTIFICATION') task.stage = 'RECTIFY'
    if (input.action === 'CONFIRM_TRANSFER') {
      if(!task.geometry)throw new Error('来源任务缺少图斑几何，无法转入整改。')
      const next = demoCreate({ sceneCode: LAND_RECTIFICATION_SCENE, resultTypeCode: 'RECTIFY_PROGRESS', name: `${task.name} · 整改`, description: task.description, priority: task.priority, geometry: task.geometry, regionIds: [...task.regionIds], beforeImageId: task.beforeImageId, afterImageId: task.afterImageId, requestId: uid() })
      next.sourceTaskId = task.id; task.linkedTaskId = next.id; task.stage = 'TRANSFERRED'
    }
    task.history.push({ id: uid(), nodeKey: previous, action: input.action, actorId:String(user.currentUser?.id||''), actorName: user.name, time: now(), description: input.description, conclusion: input.conclusion, evidence: [...evidence] })
    task.version++
    if (['CONFIRM','REVIEW'].includes(task.stage)) task.currentHandlerName = '演示场景负责人'
    task.currentNode = ['TRANSFERRED','CLOSED'].includes(task.stage) ? undefined : { id: `${task.id}:${task.stage}:${task.version}`, key: task.stage, assigneeName: task.currentHandlerName, canOperate: true }
    return task
  }
  function addTemporaryRegion(name: string, geometry: SupervisionRegion['geometry']) {
    assertAccess()
    const region = { id: `temporary-${uid()}`, name: `${name}（临时）`, geometry }; (demo.value?demoRegions.value:temporaryRegions.value).push(region); return region
  }
  return { demo, enableDemo, disableDemo, regions, objects, page, create, detail, upload, action, addTemporaryRegion }
})
