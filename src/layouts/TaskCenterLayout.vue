<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PrimaryHeader from '@/components/PrimaryHeader.vue'

defineProps<{
  title: string
  subtitle?: string
}>()

const route = useRoute()
const router = useRouter()
const entries = [
  { label: '任务总览', icon: '▦', name: 'task-overview' },
  { label: '任务列表', icon: '☷', name: 'task-list' },
  { label: '我的待办', icon: '✓', name: 'task-todo' },
]
const activeEntry = computed(() => entries.find((entry) => entry.name === route.name)?.name)
</script>

<template>
  <div class="task-center-layout">
    <PrimaryHeader />
    <div class="task-center-shell">
      <aside class="task-center-sidebar">
        <div class="sidebar-heading">
          <i>任</i>
          <div><strong>任务中心</strong><small>TASK CENTER</small></div>
        </div>
        <nav aria-label="任务中心导航">
          <button
            v-for="entry in entries"
            :key="entry.name"
            type="button"
            :class="{ active: activeEntry === entry.name }"
            @click="router.push({ name: entry.name })"
          >
            <i>{{ entry.icon }}</i><span>{{ entry.label }}</span><b>›</b>
          </button>
        </nav>
      </aside>

      <main class="task-center-content">
        <header class="content-heading">
          <div>
            <h1>{{ title }}</h1>
            <p v-if="subtitle">{{ subtitle }}</p>
          </div>
          <slot name="actions" />
        </header>
        <div class="content-body"><slot /></div>
      </main>
    </div>
  </div>
</template>

<style scoped lang="scss">
.task-center-layout {
  min-width: 1024px;
  min-height: 100dvh;
  height: 100dvh;
  display: flex;
  flex-direction: column;
  color: #25364d;
  background: #f2f5f9;
  font-family: "Microsoft YaHei", "PingFang SC", sans-serif;
}
.task-center-shell { flex: 1; min-height: 0; display: flex; }
.task-center-sidebar {
  width: 218px;
  flex: 0 0 218px;
  color: #d7e9f5;
  background: linear-gradient(180deg, #123f66, #0b3154 62%, #092c4b);
  box-shadow: 3px 0 14px #193a5530;
}
.sidebar-heading {
  height: 88px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 22px;
  border-bottom: 1px solid #ffffff17;
}
.sidebar-heading > i {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  color: #fff;
  background: linear-gradient(135deg, #35a7e8, #1778c5);
  border-radius: 8px;
  box-shadow: 0 5px 12px #001b3155;
  font-style: normal;
  font-weight: 700;
}
.sidebar-heading strong, .sidebar-heading small { display: block; }
.sidebar-heading strong { color: #fff; font-size: 18px; letter-spacing: 2px; }
.sidebar-heading small { margin-top: 4px; color: #769bb9; font-size: 9px; letter-spacing: 1.5px; }
.task-center-sidebar nav { padding: 18px 12px; }
.task-center-sidebar button {
  width: 100%;
  height: 48px;
  display: grid;
  grid-template-columns: 28px 1fr auto;
  align-items: center;
  gap: 8px;
  padding: 0 15px;
  color: #a9c4d8;
  background: transparent;
  border: 0;
  border-radius: 5px;
  cursor: pointer;
  font-size: 15px;
  text-align: left;
}
.task-center-sidebar button i { color: #82b2d1; font-size: 17px; font-style: normal; text-align: center; }
.task-center-sidebar button b { color: #6f94af; font-size: 20px; font-weight: 400; }
.task-center-sidebar button:hover { color: #fff; background: #ffffff0d; }
.task-center-sidebar button.active {
  color: #fff;
  background: linear-gradient(90deg, #168bda, #187cc2);
  box-shadow: 0 5px 12px #001b3140;
}
.task-center-sidebar button.active i, .task-center-sidebar button.active b { color: #fff; }
.task-center-content { flex: 1; min-width: 0; min-height: 0; overflow: auto; background: #f3f6fa; }
.content-heading {
  min-height: 78px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 0 28px;
  background: #fff;
  border-bottom: 1px solid #e3e9ef;
}
.content-heading h1 { margin: 0; color: #21354c; font-size: 23px; font-weight: 600; }
.content-heading p { margin: 7px 0 0; color: #8a99a9; font-size: 13px; }
.content-body { padding: 20px 24px 26px; }
@media (max-width: 1200px) {
  .task-center-sidebar { width: 190px; flex-basis: 190px; }
  .content-body { padding-inline: 18px; }
}
</style>
