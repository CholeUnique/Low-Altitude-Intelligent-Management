<script setup lang="ts">
import type { PortalTask, WorkspaceNodeConfig } from '@/types'

defineProps<{
  sceneName: string
  node: WorkspaceNodeConfig
  governanceIndex: number
  governanceTotal: number
  task?: PortalTask
}>()
</script>

<template>
  <section class="placeholder">
    <div class="placeholder-card">
      <span class="scene-label">{{ sceneName }}</span>
      <div class="node-number">{{ governanceIndex }}<small>/{{ governanceTotal }}</small></div>
      <h3>{{ node.name }}</h3>
      <p>{{ node.description || '该治理节点将承载对应场景的业务处理能力。' }}</p>

      <dl v-if="task" class="task-summary">
        <div><dt>关联任务</dt><dd>{{ task.name }}</dd></div>
        <div><dt>任务区域</dt><dd>{{ task.area }}</dd></div>
        <div><dt>当前进度</dt><dd>{{ task.progress }}%</dd></div>
        <div><dt>负责人</dt><dd>{{ task.assignee }}</dd></div>
      </dl>

      <div class="notice">
        <i>i</i>
        <div>
          <b>场景流程已接入</b>
          <span>该节点业务页面后续完善，当前可继续查看流程状态与任务上下文。</span>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss">
.placeholder {
  height: 100%;
  display: grid;
  place-items: center;
  padding: 28px;
  background:
    radial-gradient(circle at 78% 15%, #0ba0ba12, transparent 28%),
    linear-gradient(145deg, #edf4f7, #f7fafb);
}
.placeholder-card {
  width: min(720px, 100%);
  padding: 42px 48px;
  border: 1px solid #d8e5eb;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 14px 38px #173b4c14;
}
.scene-label {
  display: inline-block;
  padding: 5px 10px;
  color: #087b91;
  border: 1px solid #9cd6df;
  border-radius: 999px;
  background: #eaf9fb;
  font-size: 12px;
}
.node-number {
  float: right;
  color: #0e91a8;
  font-size: 30px;
  font-weight: 700;
}
.node-number small { color: #9aaeb9; font-size: 14px; font-weight: 400; }
h3 { margin: 24px 0 8px; color: #16384c; font-size: 26px; }
p { margin: 0; color: #708795; line-height: 1.7; }
.task-summary {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1px;
  margin: 30px 0;
  overflow: hidden;
  border: 1px solid #e0e9ee;
  border-radius: 8px;
  background: #e0e9ee;
}
.task-summary div { display: flex; justify-content: space-between; padding: 14px 16px; background: #f8fbfc; }
dt { color: #8798a3; font-size: 12px; }
dd { margin: 0; color: #284a5b; font-size: 13px; font-weight: 600; }
.notice { display: flex; gap: 12px; padding: 16px; border-left: 3px solid #0ea4b8; background: #eef9fa; }
.notice i { width: 22px; height: 22px; display: grid; place-items: center; color: white; border-radius: 50%; background: #0ea4b8; font-style: normal; }
.notice b, .notice span { display: block; }
.notice b { margin-bottom: 4px; color: #245466; font-size: 13px; }
.notice span { color: #718c98; font-size: 12px; }
</style>
