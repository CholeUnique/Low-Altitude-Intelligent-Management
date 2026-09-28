<script setup lang="ts">
import { ref } from 'vue'
import type { NonGrainWorkspaceContext } from '@/mocks/non-grain-workspace'
import NonGrainTaskSummary from './NonGrainTaskSummary.vue'
import './workspace.scss'

defineProps<{ context: NonGrainWorkspaceContext; readonly: boolean; disabledReason: string }>()
const emit = defineEmits<{ advance: [] }>()
const departments = ref(['九龙镇农业农村局', '耕地保护监督科'])
const dispatchMode = ref('逐级下发')
const remark = ref('请属地结合三处疑似变化图斑，组织网格员逐宗核实。')
</script>

<template>
  <div class="ng-page">
    <div v-if="readonly" class="ng-readonly">{{ disabledReason || '已完成历史页只读' }}</div>
    <div class="ng-grid">
      <NonGrainTaskSummary class="span-12" :context="context" />

      <section class="ng-card span-7">
        <h3>疑似图斑概览</h3>
        <div class="ng-plots">
          <article v-for="plot in context.plots" :key="plot.id" class="ng-plot">
            <b>{{ plot.id }}<em>{{ plot.area }} 亩</em></b>
            <small>{{ plot.location }}</small>
            <small>{{ plot.confirmation }}</small>
          </article>
        </div>

        <h4>影像初核</h4>
        <div class="ng-imagery current" data-label="三图斑疑似变化叠加图" />
      </section>

      <section class="ng-card span-5">
        <h3>下发部门</h3>
        <input class="ng-search" placeholder="搜索部门名称" :disabled="readonly">

        <div class="ng-radio">
          <label v-for="name in ['九龙镇农业农村局', '耕地保护监督科', '自然资源所']" :key="name">
            <input v-model="departments" type="checkbox" :value="name" :disabled="readonly"> {{ name }}
          </label>
        </div>

        <h4>下发方式</h4>
        <div class="ng-radio cols-2">
          <label><input v-model="dispatchMode" type="radio" value="逐级下发" :disabled="readonly"> 逐级下发</label>
          <label><input v-model="dispatchMode" type="radio" value="基层下发" :disabled="readonly"> 基层下发</label>
        </div>

        <label class="ng-field">
          <span>办理备注</span>
          <textarea v-model="remark" :disabled="readonly" />
        </label>

        <div class="ng-actions">
          <button class="primary" :disabled="readonly" :title="readonly ? disabledReason : ''" @click="emit('advance')">确认下发</button>
        </div>
      </section>
    </div>
  </div>
</template>
