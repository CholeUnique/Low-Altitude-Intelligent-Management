<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import CockpitPageLayout from '@/layouts/CockpitPageLayout.vue'
import TaskRangeMap from '@/components/TaskRangeMap.vue'
import { getOrganization, getScene, getTask } from '@/mocks/portal'

const route = useRoute()
const router = useRouter()
const tab = ref('飞行记录')
const task = computed(() => getTask(String(route.params.taskId)))
const organization = computed(() => task.value ? getOrganization(task.value.organizationId) : undefined)
const scene = computed(() => organization.value && task.value ? getScene(organization.value, task.value.sceneId) : undefined)
const metrics = computed(() => task.value ? [
  { label: '飞行架次', value: task.value.metrics.flights, unit: '架次', icon: '✦' },
  { label: '飞行时长', value: task.value.metrics.flightHours, unit: '小时', icon: '◷' },
  { label: '巡查面积', value: task.value.metrics.patrolArea, unit: 'km²', icon: '△' },
  { label: '发现问题数', value: task.value.metrics.issues, unit: '个', icon: '!' },
  { label: '已完成节点数', value: `${task.value.metrics.completedNodes}/${task.value.metrics.totalNodes}`, unit: '', icon: '▣' },
] : [])
const flightRows = computed(() => Array.from({ length: Math.max(task.value?.metrics.flights || 3, 3) }, (_, index) => ({
  time: `2026-09-${String(9 - Math.floor(index / 3)).padStart(2, '0')} ${String(8 + index).padStart(2, '0')}:30`,
  drone: `大疆 Mavic 3E`,
  route: `${task.value?.area || '任务区域'}-${String(index + 1).padStart(2, '0')}`,
  duration: `${18 + index * 3} min`,
  distance: `${(4.8 + index * .7).toFixed(1)} km`,
  area: `${(.62 + index * .06).toFixed(2)} km²`,
})))
</script>

<template>
  <CockpitPageLayout title="低空治理任务详情" back-to="/tasks">
    <template #action><button v-if="task" class="enter-workspace" @click="router.push(`/workspace/${task.sceneId}/${task.id}`)">进入工作台 →</button></template>
    <div v-if="task && organization" class="detail-layout">
      <aside class="detail-left">
        <section class="detail-panel basic-info">
          <div class="detail-title">任务基本信息 <button>编辑</button></div>
          <h2>{{ task.name }}</h2><div><em>{{ task.priority }}优先级</em><em>{{ task.status }}</em></div>
          <dl>
            <dt>任务编号</dt><dd>{{ task.id }}</dd><dt>所属单位</dt><dd>{{ organization.shortName }}</dd>
            <dt>业务场景</dt><dd>{{ scene?.name }}</dd><dt>当前状态</dt><dd>{{ task.status }}</dd>
            <dt>创建单位</dt><dd>{{ task.owner }}</dd><dt>需求单位</dt><dd>{{ organization.name }}</dd>
            <dt>负责人</dt><dd>{{ task.assignee }}</dd><dt>联系方式</dt><dd>{{ task.phone }}</dd>
            <dt>起止时间</dt><dd>{{ task.plannedStart }} 至 {{ task.plannedEnd }}</dd><dt>优先级</dt><dd>{{ task.priority }}</dd>
            <dt>成果要求</dt><dd>{{ task.resultRequirements.join('、') }}</dd><dt>任务描述</dt><dd>{{ task.description }}</dd>
          </dl>
        </section>
        <section class="detail-panel related-resources"><div class="detail-title">相关资源</div><button>◇ 航线规划　{{ Math.max(task.metrics.flights,1) }}条　〉</button><button>✦ 使用设备　2个　〉</button><button>⇧ 作业人员　3人　〉</button><button>▰ 存储空间　12.5GB　〉</button><button>⌘ 关联项目　{{ task.area }}　〉</button></section>
      </aside>

      <main class="detail-main">
        <section class="metric-grid"><article v-for="item in metrics" :key="item.label"><i>{{ item.icon }}</i><span>{{ item.label }}<b>{{ item.value }}<small>{{ item.unit }}</small></b></span></article></section>
        <section class="map-info-grid">
          <article class="detail-panel task-map-panel"><div class="detail-title">任务范围图</div><TaskRangeMap :coordinates="task.coordinates" /></article>
          <article class="detail-panel area-info"><div class="detail-title">任务区域信息</div><dl><dt>任务区域</dt><dd>{{ task.area }}（约{{ task.areaSize }}km²）</dd><dt>行政区划</dt><dd>{{ organization.shortName }}辖区</dd><dt>地形类型</dt><dd>山地丘陵</dd><dt>海拔范围</dt><dd>120 - 680m</dd><dt>主要任务</dt><dd>{{ scene?.description }}</dd></dl><div class="photo-strip"><i></i><i></i><i></i></div></article>
        </section>
        <section class="detail-panel process-panel">
          <div class="detail-title">任务流程总览 <span>查看流程图 〉</span></div>
          <div class="process-flow"><template v-for="(node,index) in task.workflow" :key="node.key"><div :class="node.status"><i>{{ node.status === 'done' ? '✓' : index + 1 }}</i><b>{{ node.name }}</b><small>{{ node.time || '待开始' }}</small></div><span v-if="index < task.workflow.length - 1" :class="node.status"></span></template></div>
        </section>
        <section class="detail-bottom">
          <article class="detail-panel records-panel">
            <div class="record-tabs"><button v-for="item in ['飞行记录','成果记录','处理历史']" :key="item" :class="{ active: tab === item }" @click="tab = item">{{ item }}</button><span></span><button>⇩ 导出记录</button></div>
            <table><thead><tr><th>序号</th><th>执行时间</th><th>设备名称</th><th>航线名称</th><th>飞行时长</th><th>航程</th><th>覆盖面积</th><th>状态</th><th>操作</th></tr></thead><tbody><tr v-for="(row,index) in flightRows.slice(0,5)" :key="index"><td>{{ index + 1 }}</td><td>{{ row.time }}</td><td>{{ row.drone }}</td><td>{{ row.route }}</td><td>{{ row.duration }}</td><td>{{ row.distance }}</td><td>{{ row.area }}</td><td><em>● 执行成功</em></td><td><a>查看</a></td></tr></tbody></table>
          </article>
          <article class="detail-panel progress-panel"><div class="detail-title">重要进展 <select><option>全部</option></select></div><div v-for="(node,index) in task.workflow.filter(item => item.status !== 'pending').slice(0,5)" :key="node.key" class="progress-item"><i></i><div><b>{{ node.name }}{{ node.status === 'active' ? '进行中' : '完成' }}</b><small>{{ node.time }}　{{ index ? task.assignee : '系统' }}</small></div></div></article>
        </section>
      </main>
    </div>
    <div v-else class="task-not-found"><h2>未找到任务</h2><button @click="router.push('/tasks')">返回任务总览</button></div>
  </CockpitPageLayout>
</template>

<style scoped lang="scss">
.enter-workspace { padding: 8px 16px; color: white; background: #087fe7; border: 1px solid #2fa9ff; box-shadow: 0 0 10px #138deb66; cursor: pointer; }
.detail-layout { height: calc(100vh - 70px); display: grid; grid-template-columns: 240px 1fr; gap: 7px; }.detail-left { display: grid; grid-template-rows: 1fr 190px; gap: 7px; min-height: 0; }.detail-main { min-width: 0; display: grid; grid-template-rows: 76px minmax(205px,1fr) 88px minmax(180px,.85fr); gap: 7px; }
.detail-panel { min-width: 0; min-height: 0; overflow: hidden; background: linear-gradient(145deg,#042440,#03182d); border: 1px solid #0c557b; }.detail-title { height: 34px; display: flex; align-items: center; justify-content: space-between; padding: 0 10px; color: #bce7f2; background: #06385a; border-bottom: 1px solid #0b5477; font-size: 10px; font-weight: bold; }.detail-title button,.detail-title select { padding: 3px 8px; color: #74dcef; background: #052842; border: 1px solid #146284; font-size: 7px; }.detail-title span { color: #278db0; font-size: 7px; }
.basic-info { padding-bottom: 8px; }.basic-info h2 { margin: 13px 12px 7px; font-size: 13px; }.basic-info>div:nth-of-type(2) { margin: 0 12px 9px; }.basic-info em { margin-right: 5px; padding: 3px 6px; color: #65dded; background: #07516c; border: 1px solid #14718e; font-size: 7px; font-style: normal; }.basic-info dl { display: grid; grid-template-columns: 65px 1fr; margin: 0 12px; }.basic-info dt,.basic-info dd { margin: 0; padding: 5px 0; border-bottom: 1px solid #0a3b56; font-size: 8px; line-height: 1.5; }.basic-info dt { color: #628b9d; }.basic-info dd { color: #b6d7e1; }
.related-resources button { width: 100%; padding: 8px 10px; color: #87adbc; background: transparent; border: 0; border-bottom: 1px solid #0a3b56; text-align: left; font-size: 8px; cursor: pointer; }
.metric-grid { display: grid; grid-template-columns: repeat(5,1fr); gap: 7px; }.metric-grid article { display: flex; align-items: center; gap: 10px; padding: 8px 12px; background: linear-gradient(120deg,#07385a,#04243e); border: 1px solid #0b5982; }.metric-grid i { width: 36px; height: 36px; display: grid; place-items: center; color: #58e7f1; background: #075274; border-radius: 50%; font-style: normal; }.metric-grid span,.metric-grid b { display: block; }.metric-grid span { color: #78a4b5; font-size: 8px; }.metric-grid b { margin-top: 4px; color: #a4f4fb; font-size: 18px; }.metric-grid small { margin-left: 4px; color: #648d9d; font-size: 7px; }
.map-info-grid { min-height: 0; display: grid; grid-template-columns: 2.15fr 1fr; gap: 7px; }.task-map-panel { display: grid; grid-template-rows: 34px 1fr; }.area-info dl { display: grid; grid-template-columns: 75px 1fr; margin: 7px 10px; }.area-info dt,.area-info dd { margin: 0; padding: 6px 0; border-bottom: 1px solid #0a3c57; font-size: 8px; }.area-info dt { color: #62899b; }.area-info dd { color: #aed2dc; }.photo-strip { display: grid; grid-template-columns: repeat(3,1fr); gap: 4px; margin: 8px; }.photo-strip i { height: 45px; background: linear-gradient(145deg,#547963,#173c49); border: 1px solid #155f7d; }
.process-panel { display: grid; grid-template-rows: 34px 1fr; }.process-flow { display: flex; align-items: center; justify-content: center; padding: 7px 12px; }.process-flow>div { width: 70px; display: grid; justify-items: center; gap: 3px; color: #5f8494; }.process-flow>div i { width: 20px; height: 20px; display: grid; place-items: center; border: 1px solid #356178; border-radius: 50%; font-size: 7px; font-style: normal; }.process-flow>div b { font-size: 7px; }.process-flow>div small { font-size: 6px; }.process-flow>div.done,.process-flow>div.active { color: #5ce8c0; }.process-flow>div.active { color: #4dbfff; }.process-flow>span { width: 40px; height: 1px; background: #214a60; }.process-flow>span.done { background: #36cfa8; }
.detail-bottom { min-height: 0; display: grid; grid-template-columns: 2.2fr .85fr; gap: 7px; }.record-tabs { height: 34px; display: flex; border-bottom: 1px solid #0b4c6d; }.record-tabs button { padding: 0 15px; color: #668fa1; background: transparent; border: 0; font-size: 8px; }.record-tabs button.active { color: #78e8f5; border-bottom: 2px solid #18c5df; }.record-tabs span { flex: 1; }.records-panel table { width: 100%; border-collapse: collapse; font-size: 7px; }.records-panel th,.records-panel td { padding: 6px 7px; border-bottom: 1px solid #0a3b55; text-align: left; }.records-panel th { color: #7ca7b7; background: #063452; }.records-panel td { color: #8fb2bf; }.records-panel em { color: #55ddb5; font-style: normal; }.records-panel a { color: #33b8e4; }
.progress-item { display: grid; grid-template-columns: 12px 1fr; gap: 7px; padding: 7px 12px; }.progress-item>i { width: 7px; height: 7px; margin-top: 2px; background: #22cfab; border-radius: 50%; box-shadow: 0 0 7px #22cfab; }.progress-item b,.progress-item small { display: block; font-size: 7px; }.progress-item small { margin-top: 3px; color: #597f91; }.task-not-found { padding: 100px; text-align: center; }.task-not-found button { padding: 8px 16px; color: white; background: #087ee0; border: 1px solid #24a4ed; }
</style>
