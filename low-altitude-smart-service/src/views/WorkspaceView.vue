<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { forestryConfig } from '@/workspace/config/forestry'
import { nodeFixtures, workflowEvents } from '@/mocks/data'
import { useUserStore } from '@/stores/user'

const route = useRoute()
const router = useRouter()
const user = useUserStore()
const firstNode = forestryConfig.nodes[0]!
const activeKey = computed(() => {
  const key = typeof route.query.node === 'string' ? route.query.node : firstNode.key
  return forestryConfig.nodes.some((node) => node.key === key) ? key : firstNode.key
})
const activeNode = computed(() => forestryConfig.nodes.find((node) => node.key === activeKey.value)!)
const fixture = computed(() => nodeFixtures[activeKey.value as keyof typeof nodeFixtures])
const isReviewNode = computed(() => ['spot-identification', 'review-archive'].includes(activeKey.value))

function selectNode(key: string) {
  router.replace({ query: { ...route.query, node: key } })
}
</script>

<template>
  <div class="workspace">
    <header class="workspace-header">
      <div class="workspace-brand" @click="$router.push('/dashboard')"><span class="brand-mark">翼</span><div><b>林业执法监管工作台</b><small>{{ route.params.taskId || '综合工作台' }}</small></div></div>
      <div class="flow-nav">
        <button v-for="node in forestryConfig.nodes" :key="node.key" :class="{ active: node.key === activeKey, done: node.order < activeNode.order }" @click="selectNode(node.key)">
          <i>{{ node.order < activeNode.order ? '✓' : node.order }}</i><span>{{ node.shortName }}</span>
        </button>
      </div>
      <div class="workspace-user"><span>今日任务 <b>18</b></span><span>待办 <b>12</b></span><span>{{ user.name }}</span></div>
    </header>
    <div class="workspace-title">
      <div><span>节点 {{ activeNode.order }}</span><h2>{{ activeNode.name }}</h2><p>{{ activeNode.description }}</p></div>
      <div class="workspace-actions"><el-button>保存草稿</el-button><el-button type="primary">{{ activeKey === 'review-archive' ? '确认归档' : activeKey === 'task-dispatch' ? '确认下发' : '保存并进入下一步' }}</el-button></div>
    </div>
    <main class="work-grid">
      <aside class="work-panel left-panel">
        <div class="work-panel-title">{{ activeKey === 'route-planning' ? '图层与规划工具' : activeKey === 'change-detection' ? '影像期次' : '作业对象' }}<span>⌄</span></div>
        <div class="left-search">⌕ 搜索内容</div>
        <button v-for="(item, index) in fixture.left" :key="item" class="list-item" :class="{ selected: index === 0 }"><i>{{ index + 1 }}</i><span>{{ item }}<small>{{ index === 0 ? '当前选中 · 数据正常' : '等待处理' }}</small></span></button>
        <div class="left-tools"><b>快捷工具</b><div><button>测距</button><button>绘面</button><button>定位</button><button>图层</button></div></div>
      </aside>
      <section class="work-center">
        <div class="map-toolbar"><span>二维地图</span><button>＋</button><button>－</button><button>⌖</button><button>全屏</button></div>
        <div class="work-map" :class="`map-${activeKey}`">
          <div class="terrain"></div><div class="route-line"></div>
          <span v-for="n in 6" :key="n" class="waypoint" :style="{ left: `${13 + n * 11}%`, top: `${30 + (n % 3) * 13}%` }">{{ n }}</span>
          <div v-if="activeKey === 'cruise-capture'" class="video-float"><span>● LIVE · DR-017</span><div>实时视频回传</div></div>
          <div v-if="['change-detection','spot-identification','review-archive'].includes(activeKey)" class="polygon">疑似变化<br><b>3.26 ha</b></div>
          <div class="map-coordinates">天地图 UI 占位 · CGCS2000　E 119.3268° N 26.0812°　1:25000</div>
        </div>
      </section>
      <aside class="work-panel right-panel">
        <div class="work-panel-title">{{ activeKey === 'review-archive' ? '复核与归档详情' : '当前任务详情' }}<span>···</span></div>
        <div class="detail-state"><span>当前状态</span><el-tag type="success">{{ activeKey === 'review-archive' ? '待复核' : '处理中' }}</el-tag></div>
        <dl><template v-for="item in fixture.right" :key="item[0]"><dt>{{ item[0] }}</dt><dd>{{ item[1] }}</dd></template></dl>
        <template v-if="isReviewNode">
          <div class="timeline-title">完整处理历史</div>
          <div class="mini-timeline" v-for="event in workflowEvents" :key="event.id"><i></i><div><b>{{ event.name }}</b><small>{{ event.time }} · {{ event.operator }}</small></div></div>
        </template>
        <template v-else><div class="summary-box"><b>任务提示</b><p>当前页面使用 Mock 数据。正式接口交付后由 Adapter 完成领域模型映射。</p></div></template>
      </aside>
      <section class="bottom-panel">
        <div class="bottom-tabs"><button v-for="(tab, index) in fixture.bottom" :key="tab" :class="{ active: index === 0 }">{{ tab }} <small>{{ index === 0 ? '12' : '' }}</small></button></div>
        <div class="bottom-content">
          <div v-for="n in 4" :key="n" class="data-cell"><span>{{ activeKey === 'cruise-capture' ? `IMG_0908_${128 + n}.JPG` : activeKey === 'review-archive' ? `归档材料 ${n}` : `作业记录 ${String(n).padStart(2, '0')}` }}</span><small>{{ 10 + n }}:{{ 12 + n * 3 }} · 数据状态正常</small></div>
        </div>
      </section>
    </main>
  </div>
</template>
