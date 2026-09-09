<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { useRouter } from 'vue-router'
import DashboardMap from '@/components/DashboardMap.vue'
import DomainProgressChart from '@/components/DomainProgressChart.vue'
import { useUserStore } from '@/stores/user'
import {
  aiCapabilities,
  aiMetrics,
  archivedCases,
  dashboardAlerts,
  dashboardStats,
  dashboardTaskList,
  droneFeeds,
  governanceFlow,
} from '@/mocks/data'

const router = useRouter()
const user = useUserStore()
const now = ref(new Date())
const timer = window.setInterval(() => { now.value = new Date() }, 1000)
const dateText = computed(() => new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }).format(now.value))
const timeText = computed(() => now.value.toLocaleTimeString('zh-CN', { hour12: false }))

function logout() {
  user.logout()
  router.replace('/login')
}

function openAlgorithm(id?: string) {
  router.push({ name: 'algorithms', query: id ? { algorithm: id } : undefined })
}

onBeforeUnmount(() => window.clearInterval(timer))
</script>

<template>
  <div class="cockpit">
    <header class="cockpit-header">
      <div class="cockpit-brand" @click="router.push('/dashboard')">
        <span class="cockpit-logo">◆</span>
        <h1>低空智慧服务运行中枢</h1>
      </div>
      <nav class="cockpit-nav">
        <button class="active">天地协同</button><i></i>
        <button>智慧感知</button><i></i>
        <button>精准治理</button><i></i>
        <button>服务发展</button>
      </nav>
      <div class="cockpit-user">
        <span class="online-dot"></span><span>系统运行正常</span>
        <time>{{ dateText }}　{{ timeText }}</time>
        <button class="notice">♟<b>3</b></button>
        <button class="avatar">●</button>
        <button @click="logout">{{ user.name }}　⌄</button>
      </div>
    </header>

    <main class="cockpit-body">
      <section class="cockpit-stats">
        <article v-for="stat in dashboardStats" :key="stat.label" class="cockpit-stat" :class="`is-${stat.tone}`">
          <div class="stat-icon"><span>{{ stat.icon === 'drone' ? '✦' : stat.icon === 'task' ? '▣' : stat.icon === 'pending' ? '◷' : '◉' }}</span></div>
          <div class="stat-copy"><label>{{ stat.label }}</label><strong>{{ stat.value }}<small>{{ stat.unit }}</small></strong><p>{{ stat.primary }} <em v-if="stat.secondary">｜ {{ stat.secondary }}</em></p></div>
          <div class="spark-bars"><i v-for="n in 12" :key="n" :style="{ height: `${22 + ((n * 13) % 38)}%` }"></i></div>
        </article>
      </section>

      <section class="cockpit-primary">
        <article class="cockpit-panel map-overview">
          <div class="cockpit-panel__title"><h2>城市低空综合监管一张图</h2><span>实时态势 · 数据每30秒更新</span></div>
          <DashboardMap />
        </article>

        <aside class="cockpit-side">
          <article class="cockpit-panel task-list-panel">
            <div class="cockpit-panel__title"><h2>任务列表</h2><router-link to="/taskLists">全部任务 〉</router-link></div>
            <div class="compact-list">
              <button v-for="task in dashboardTaskList" :key="task.id" class="task-list-item" @click="router.push(`/workspace/forestry/${task.id}`)">
                <span class="item-icon">{{ task.icon }}</span>
                <span class="item-main"><b>{{ task.title }}</b><small>⌖ {{ task.area }}　·　{{ task.time.slice(5) }}</small></span>
                <em :class="`tag-${task.tone}`">{{ task.status }}</em>
              </button>
            </div>
          </article>
          <article class="cockpit-panel alert-panel">
            <div class="cockpit-panel__title"><h2>异常告警</h2><span>全部告警 〉</span></div>
            <div class="compact-list">
              <div v-for="alert in dashboardAlerts" :key="`${alert.title}-${alert.time}`" class="alert-list-item">
                <span class="alert-icon" :class="alert.level">!</span>
                <span class="item-main"><b>{{ alert.title }}</b><small>{{ alert.description }}</small></span>
                <time>{{ alert.time }}</time><em :class="alert.level">{{ alert.tag }}</em>
              </div>
            </div>
          </article>
        </aside>
      </section>

      <section class="cockpit-secondary">
        <article class="cockpit-panel feed-panel">
          <div class="cockpit-panel__title"><h2>无人机直播</h2><span>全部直播 〉</span></div>
          <div class="feed-grid">
            <div v-for="feed in droneFeeds" :key="feed.id" class="feed-card" :class="`feed-${feed.image}`">
              <span class="feed-state">● {{ feed.status }}</span><span class="feed-expand">⌗</span>
              <div class="feed-info"><b>{{ feed.id }}</b><span>⌖ {{ feed.area }}　　高度 {{ feed.altitude }}　{{ feed.speed }}</span></div>
            </div>
          </div>
        </article>

        <article class="cockpit-panel ai-panel">
          <div class="cockpit-panel__title"><h2>智能识别能力中心</h2><router-link to="/algorithms">全部能力 〉</router-link></div>
          <div class="ai-capability-grid">
            <button v-for="item in aiCapabilities" :key="item.name" class="ai-capability" :class="`capability-${item.visual}`" @click="openAlgorithm(item.id)"><i>{{ item.icon }}</i><b>{{ item.name }}</b><small>{{ item.description }}</small></button>
          </div>
          <div class="ai-metric-row">
            <div v-for="metric in aiMetrics" :key="metric.label"><span>{{ metric.label }}</span><b>{{ metric.value }}<small>{{ metric.unit }}</small></b></div>
          </div>
        </article>

        <article class="cockpit-panel chart-panel">
          <div class="cockpit-panel__title"><h2>多领域业务完成度</h2><span>本月　⌄</span></div>
          <DomainProgressChart />
        </article>

        <article class="cockpit-panel archive-panel">
          <div class="cockpit-panel__title"><h2>已办结案例轮播</h2><span>更多案例 〉</span></div>
          <div class="archive-list">
            <div v-for="item in archivedCases" :key="item.title" class="archive-item">
              <span class="archive-thumb" :class="`thumb-${item.image}`"></span>
              <div><b>{{ item.title }}</b><small>{{ item.area }}　{{ item.date }}</small></div><em>已办结</em>
            </div>
          </div>
        </article>
      </section>

      <section class="governance-flow">
        <div class="flow-caption"><b>闭环治理流程</b><span>全流程闭环 · 让管理更高效</span></div>
        <template v-for="(item, index) in governanceFlow" :key="item.step">
          <div class="flow-item">
            <i>{{ item.icon }}</i><span><small>{{ item.step }}</small><b>{{ item.name }}</b><em>{{ item.description }}</em></span>
          </div>
          <div v-if="index < governanceFlow.length - 1" class="flow-arrow">›</div>
        </template>
      </section>
    </main>
  </div>
</template>

<style scoped src="@/styles/dashboard.scss" lang="scss"></style>
