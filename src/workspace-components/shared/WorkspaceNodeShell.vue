<script setup lang="ts">
import type { PortalTask } from '@/types'

defineProps<{
  title: string
  description: string
  task?: PortalTask
}>()
</script>

<template>
  <div class="node-shell">
    <div class="shell-card">
      <span class="badge">节点占位</span>
      <h2>{{ title }}</h2>
      <p>{{ description }}</p>
      <dl v-if="task">
        <div><dt>任务</dt><dd>{{ task.name }}</dd></div>
        <div><dt>区域</dt><dd>{{ task.area }}</dd></div>
        <div><dt>负责人</dt><dd>{{ task.assignee || task.owner }}</dd></div>
        <div><dt>进度</dt><dd>{{ task.progress }}%</dd></div>
      </dl>
      <div class="hint">该节点能力后续完善，当前仅保证流程切换与布局一致。</div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.node-shell {
  height: 100%;
  min-height: 0;
  display: grid;
  place-items: center;
  padding: 24px;
  background:
    radial-gradient(circle at 20% 20%, #d9eef8 0, transparent 42%),
    radial-gradient(circle at 80% 10%, #e8f4ec 0, transparent 36%),
    #eef3f6;
}
.shell-card {
  width: min(720px, 100%);
  padding: 28px 32px;
  background: #fff;
  border: 1px solid #d7e3eb;
  border-radius: 8px;
  box-shadow: 0 8px 24px #12344714;
}
.badge {
  display: inline-block;
  padding: 3px 8px;
  color: #0b6f9a;
  background: #e8f5fb;
  border-radius: 4px;
  font-size: 16px;
  font-weight: 700;
}
h2 {
  margin: 12px 0 8px;
  color: #16384c;
  font-size: 22px;
}
p {
  margin: 0;
  color: #6f8393;
  font-size: 15px;
  line-height: 1.6;
}
dl {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin: 18px 0 0;
}
dl > div {
  padding: 10px 12px;
  background: #f5f8fa;
  border-radius: 6px;
}
dt, dd { margin: 0; }
dt { color: #7a8f9e; font-size: 16px; }
dd { margin-top: 4px; color: #1f3d52; font-size: 15px; font-weight: 700; }
.hint {
  margin-top: 16px;
  padding: 12px 14px;
  color: #8a6a2b;
  background: #fff8e9;
  border-left: 3px solid #f0b429;
  border-radius: 0 6px 6px 0;
  font-size: 16px;
}
</style>
