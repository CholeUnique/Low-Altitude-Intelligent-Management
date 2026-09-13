<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { PortalTask } from '@/types'
import { createLiveCruiseSnapshot } from '@/mocks/patrol-live'
import LiveCruiseMap from './LiveCruiseMap.vue'

const props = defineProps<{ task?: PortalTask }>()

const snapshot = ref(createLiveCruiseSnapshot(props.task))

watch(
  () => props.task?.id,
  () => {
    snapshot.value = createLiveCruiseSnapshot(props.task)
  },
)

const flownPct = computed(() => Math.round((snapshot.value.flownIndex / Math.max(snapshot.value.routeCoordinates.length - 1, 1)) * 100))
</script>

<template>
  <div class="live-cruise">
    <section class="top-grid">
      <aside class="panel task-panel">
        <div class="panel-title">当前飞行任务</div>
        <dl>
          <dt>任务</dt><dd>{{ snapshot.taskName }}</dd>
          <dt>飞行 ID</dt><dd>{{ snapshot.flightId }}</dd>
          <dt>无人机</dt><dd>{{ snapshot.aircraftName }}</dd>
          <dt>机号</dt><dd>{{ snapshot.aircraftId }}</dd>
          <dt>区域</dt><dd>{{ snapshot.area }}</dd>
          <dt>状态</dt><dd><em class="running">{{ snapshot.status }}</em></dd>
          <dt>进度</dt><dd>{{ snapshot.progress }}% · 已飞航段 {{ flownPct }}%</dd>
        </dl>
        <div class="progress-bar"><i :style="{ width: `${snapshot.progress}%` }"></i></div>
      </aside>

      <section class="map-panel panel">
        <div class="panel-title">
          巡航区域地图
          <small>绿=已飞 · 灰虚线=未飞</small>
        </div>
        <div class="map-wrap">
          <LiveCruiseMap
            :route-coordinates="snapshot.routeCoordinates"
            :flown-index="snapshot.flownIndex"
            :drone-position="snapshot.dronePosition"
          />
        </div>
      </section>

      <aside class="right-col">
        <div class="panel">
          <div class="panel-title">实时遥测</div>
          <div class="telemetry-grid">
            <div><b>{{ snapshot.telemetry.altitude }}</b><span>高度 m</span></div>
            <div><b>{{ snapshot.telemetry.speed }}</b><span>速度 m/s</span></div>
            <div><b>{{ snapshot.telemetry.heading }}°</b><span>航向</span></div>
            <div><b>{{ snapshot.telemetry.battery }}%</b><span>电池</span></div>
            <div class="wide"><b>{{ snapshot.telemetry.gps }}</b><span>GPS</span></div>
            <div><b>{{ snapshot.telemetry.rcLink }}</b><span>遥控链路</span></div>
            <div><b>{{ snapshot.telemetry.videoLink }}</b><span>图传链路</span></div>
          </div>
        </div>
        <div class="panel live-panel">
          <div class="panel-title">直播画面 <em class="online">● {{ snapshot.liveStatus }}</em></div>
          <div class="live-screen">
            <span>LIVE · {{ snapshot.aircraftId }}</span>
            <p>实时图传占位（正式环境由后端返回临时播放地址）</p>
          </div>
        </div>
      </aside>
    </section>

    <section class="bottom-grid">
      <div class="panel">
        <div class="panel-title">采集影像</div>
        <div class="media-grid">
          <div v-for="item in snapshot.media" :key="item.id" class="media-card" :class="`thumb-${item.thumbnail}`">
            <b>{{ item.name }}</b>
            <small>{{ item.capturedAt }}</small>
          </div>
        </div>
      </div>
      <div class="panel">
        <div class="panel-title">飞行事件记录</div>
        <div class="event-list">
          <div v-for="item in snapshot.events" :key="item.id" class="event-row">
            <time>{{ item.time }}</time>
            <em>{{ item.type }}</em>
            <span>{{ item.message }}</span>
          </div>
        </div>
      </div>
      <div class="panel">
        <div class="panel-title">待执行飞行计划</div>
        <div v-for="item in snapshot.pendingPlans" :key="item.id" class="plan-row">
          <b>{{ item.start }} · {{ item.title }}</b>
          <small>{{ item.area }} · {{ item.status }}</small>
        </div>
      </div>
      <div class="panel">
        <div class="panel-title">历史飞行记录</div>
        <table>
          <thead>
            <tr><th>航线</th><th>日期</th><th>时长</th><th>里程</th><th>状态</th></tr>
          </thead>
          <tbody>
            <tr v-for="item in snapshot.history" :key="item.id">
              <td>{{ item.title }}</td>
              <td>{{ item.date }}</td>
              <td>{{ item.durationMin }} min</td>
              <td>{{ item.distanceKm }} km</td>
              <td><em class="done">{{ item.status }}</em></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<style scoped lang="scss">
.live-cruise {
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-rows: minmax(360px, 1.35fr) minmax(220px, 0.95fr);
  gap: 8px;
  padding: 8px;
  background: #e8eef3;
}
.top-grid {
  min-height: 0;
  display: grid;
  grid-template-columns: 220px 1fr 280px;
  gap: 8px;
}
.right-col {
  min-height: 0;
  display: grid;
  grid-template-rows: auto 1fr;
  gap: 8px;
}
.bottom-grid {
  min-height: 0;
  display: grid;
  grid-template-columns: 1.1fr 1.2fr 0.9fr 1.2fr;
  gap: 8px;
}
.panel {
  overflow: hidden;
  background: #fff;
  border: 1px solid #d5e0e8;
  border-radius: 6px;
  box-shadow: 0 2px 8px #1c3b5210;
}
.panel-title {
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 10px;
  border-bottom: 1px solid #e6eef3;
  color: #1f3d52;
  font-size: 12px;
  font-weight: 700;
}
.panel-title small { color: #7a8f9e; font-weight: 500; font-size: 10px; }
.task-panel dl {
  display: grid;
  grid-template-columns: 64px 1fr;
  margin: 0;
  padding: 8px 10px;
}
.task-panel dt, .task-panel dd {
  margin: 0;
  padding: 6px 0;
  border-bottom: 1px solid #eef3f6;
  font-size: 11px;
}
.task-panel dt { color: #7a8f9e; }
.task-panel dd { color: #1f3d52; text-align: right; }
.running { color: #1f7fe0; font-style: normal; font-weight: 700; }
.done { color: #1fbf6a; font-style: normal; }
.progress-bar {
  height: 6px;
  margin: 0 10px 12px;
  background: #e8eef3;
  border-radius: 999px;
  overflow: hidden;
}
.progress-bar i {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, #13a6bb, #1fbf6a);
}
.map-panel { display: flex; flex-direction: column; }
.map-wrap { flex: 1; min-height: 0; }
.telemetry-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  padding: 8px 10px 12px;
}
.telemetry-grid > div {
  display: grid;
  justify-items: center;
  gap: 2px;
  padding: 8px 4px;
  background: #f4f8fb;
  border-radius: 4px;
}
.telemetry-grid .wide { grid-column: 1 / -1; }
.telemetry-grid b { color: #0b6f9a; font-size: 13px; text-align: center; }
.telemetry-grid span { color: #7a8f9e; font-size: 9px; }
.live-panel { display: flex; flex-direction: column; }
.online { color: #1fbf6a; font-style: normal; font-weight: 600; font-size: 11px; }
.live-screen {
  flex: 1;
  min-height: 120px;
  margin: 8px 10px 12px;
  display: grid;
  place-content: center;
  gap: 8px;
  color: #9fd7e8;
  background: linear-gradient(160deg, #082e47, #031a31);
  border: 1px solid #15597a;
  border-radius: 6px;
  text-align: center;
}
.live-screen span { color: #f17179; font-size: 12px; }
.live-screen p { margin: 0; color: #66bfd1; font-size: 11px; padding: 0 16px; }
.media-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  padding: 8px 10px 12px;
}
.media-card {
  min-height: 64px;
  display: grid;
  align-content: end;
  padding: 8px;
  border-radius: 4px;
  color: #fff;
  background: linear-gradient(#0006, #0009), #2a5a6e;
}
.media-card.thumb-forest { background: linear-gradient(#0007, #000a), #1f5a3a; }
.media-card.thumb-field { background: linear-gradient(#0007, #000a), #6a7a2a; }
.media-card.thumb-river { background: linear-gradient(#0007, #000a), #1a4a6a; }
.media-card b, .media-card small { display: block; font-size: 10px; }
.media-card small { margin-top: 2px; opacity: 0.85; }
.event-list { max-height: 180px; overflow: auto; }
.event-row {
  display: grid;
  grid-template-columns: 64px 44px 1fr;
  gap: 6px;
  padding: 8px 10px;
  border-bottom: 1px solid #eef3f6;
  font-size: 11px;
  color: #445868;
}
.event-row time { color: #7a8f9e; }
.event-row em {
  color: #0b6f9a;
  font-style: normal;
  font-weight: 700;
}
.plan-row {
  padding: 10px;
  border-bottom: 1px solid #eef3f6;
}
.plan-row b, .plan-row small { display: block; }
.plan-row b { color: #1f3d52; font-size: 12px; }
.plan-row small { margin-top: 4px; color: #7a8f9e; font-size: 10px; }
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
}
th, td {
  padding: 7px 8px;
  border-bottom: 1px solid #eef3f6;
  text-align: left;
  color: #445868;
}
th { color: #6f8393; background: #f7fafc; }
@media (max-width: 1450px) {
  .top-grid { grid-template-columns: 200px 1fr 250px; }
  .bottom-grid { grid-template-columns: 1fr 1fr 0.85fr 1fr; }
}
</style>
