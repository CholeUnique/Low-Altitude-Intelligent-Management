<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PrimaryHeader from '@/components/PrimaryHeader.vue'
import { useUserStore } from '@/stores/user'

defineProps<{
  title: string
  subtitle?: string
}>()

const route = useRoute()
const router = useRouter()
const user = useUserStore()
const entries = computed(() => [
  { label: '任务总览', icon: '▦', name: 'task-overview', permission: 'task-overview' as const },
  { label: '任务列表', icon: '☷', name: 'task-list', permission: 'task-list' as const },
  { label: '我的待办', icon: '✓', name: 'task-todo', permission: 'task-todo' as const },
].filter((entry) => user.hasPermission(entry.permission)))
const activeEntry = computed(() => entries.value.find((entry) => entry.name === route.name)?.name)
</script>

<template>
  <div class="task-center-layout">
    <PrimaryHeader />
    <div class="task-center-shell">
      <aside class="task-center-sidebar">
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
  width: 220px;
  flex: 0 0 220px;
  min-height: 0;
  overflow: auto;
  padding: 15px 12px;
  box-sizing: border-box;
  color: #d8edf4;
  background: linear-gradient(180deg, #06243e 0%, #031c33 100%);
  border-right: 1px solid #0b4969;
  box-shadow: inset -1px 0 #021426;
}
.task-center-sidebar nav { display: grid; gap: 9px; }
.task-center-sidebar button {
  position: relative;
  z-index: 1;
  width: 100%;
  min-height: 52px;
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr) 12px;
  align-items: center;
  gap: 10px;
  padding: 8px 9px;
  color: #abc6d3;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 4px;
  cursor: pointer;
  font-size: 17px;
  text-align: left;
  transition: border-color .18s, background .18s, color .18s;
}
.task-center-sidebar button::after {
  position: absolute;
  right: 10px;
  bottom: -5px;
  left: 10px;
  border-bottom: 1px solid #0d3d59;
  content: '';
}
.task-center-sidebar button i {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  color: #61bfd6;
  background: #093b57;
  border: 1px solid #0c5776;
  border-radius: 5px;
  font-size: 19px;
  font-style: normal;
  text-align: center;
}
.task-center-sidebar button span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
.task-center-sidebar button b { color: #668fa1; font-size: 22px; font-weight: 400; }
.task-center-sidebar button:hover { color: #eafaff; background: #0a2d48; }
.task-center-sidebar button.active {
  color: #fff;
  background: #082f4c;
  border-color: #1686a8;
  box-shadow: none;
}
.task-center-sidebar button.active i { color: #e8fdff; background: #075a78; border-color: #1686a8; }
.task-center-sidebar button.active b { color: #48d9eb; }
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
  .task-center-sidebar { width: 190px; flex-basis: 190px; padding: 12px 8px; }
  .task-center-sidebar button { grid-template-columns: 34px minmax(0, 1fr) 9px; gap: 7px; }
  .content-body { padding-inline: 18px; }
}
</style>
