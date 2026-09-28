<script setup lang="ts">
import { ref } from 'vue'
import type { NonGrainWorkspaceContext } from '@/mocks/non-grain-workspace'
import NonGrainTaskSummary from './NonGrainTaskSummary.vue'
import './workspace.scss'

defineProps<{ context: NonGrainWorkspaceContext; readonly: boolean; disabledReason: string }>()
const emit = defineEmits<{ advance: [] }>()
const selectedPlot = ref(0)
const phase = ref<'history' | 'current'>('history')
</script>

<template>
  <div class="ng-page ng-page-acceptance">
    <div v-if="readonly" class="ng-readonly">??????????</div>

    <div class="ng-grid">
      <NonGrainTaskSummary class="span-12" :context="context" />

      <section class="ng-card span-4 ng-map-panel">
        <h3>???? <small class="ng-sub-time">2025-06-18</small></h3>
        <div class="ng-map-figure history">
          <aside class="ng-map-tools">
            <button>+</button>
            <button>?</button>
            <button>?</button>
          </aside>
          <p>?????????????</p>
        </div>
      </section>

      <section class="ng-card span-4 ng-map-panel">
        <h3>???? <small class="ng-sub-time">2026-09-22</small></h3>
        <div class="ng-tabs compact">
          <button :class="{ active: phase === 'current' }" @click="phase = 'current'">????</button>
          <button :class="{ active: phase === 'history' }" @click="phase = 'history'">????</button>
        </div>
        <div class="ng-map-figure current">
          <p>???????????????</p>
        </div>
      </section>

      <section class="ng-card span-4 ng-side-diagnosis">
        <h3>??????</h3>
        <ul class="ng-list dense">
          <li><span>????</span><b>{{ context.plots[selectedPlot]?.id }}</b></li>
          <li><span>????</span><b>{{ context.plots[selectedPlot]?.area }} ?</b></li>
          <li><span>????</span><b>{{ context.plots[selectedPlot]?.location }}</b></li>
          <li><span>????</span><b>??</b></li>
          <li><span>??????</span><b>????</b></li>
          <li><span>????</span><b class="ng-kpi-emphasis">???</b></li>
        </ul>

        <h4>??????</h4>
        <div class="ng-ai-block">
          <div class="ng-ai-row"><span>AI ???</span><b>89.4%</b></div>
          <div class="ng-ai-progress"><i /></div>
          <ol>
            <li>?????????????</li>
            <li>??????????????????</li>
            <li>???????????????</li>
          </ol>
        </div>
      </section>

      <section class="ng-card span-6 ng-issue-panel">
        <h3>???????? {{ context.plots.length }} ??</h3>
        <div class="ng-plots">
          <article
            v-for="(plot, index) in context.plots"
            :key="plot.id"
            class="ng-plot clickable"
            :class="{ active: selectedPlot === index }"
            @click="selectedPlot = index"
          >
            <b>??{{ index + 1 }}<em>{{ plot.area }} ?</em></b>
            <small>{{ plot.id }}</small>
            <small>{{ plot.landType }}</small>
          </article>
        </div>
      </section>

      <section class="ng-card span-3 ng-analysis-panel">
        <h3>????</h3>
        <div class="ng-accept-kpi">
          <p><span>???</span><b>2025-06-18</b></p>
          <p><span>???</span><b>2026-09-22</b></p>
          <p><span>????</span><b>8.42 ?</b></p>
          <p><span>????</span><b>100%</b></p>
        </div>
      </section>

      <section class="ng-card span-3 ng-explain-panel">
        <h3>???? / ????</h3>
        <ol class="ng-desc-list">
          <li>????????????????????????????</li>
          <li>???????????????????????????</li>
          <li>?????????????????????????</li>
        </ol>

        <div class="ng-actions">
          <button class="primary" :disabled="readonly" :title="readonly ? disabledReason : ''" @click="emit('advance')">
            ?????????
          </button>
        </div>
      </section>
    </div>
  </div>
</template>
