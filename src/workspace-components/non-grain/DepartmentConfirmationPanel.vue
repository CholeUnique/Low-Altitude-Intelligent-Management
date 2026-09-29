<script setup lang="ts">
import { ref } from 'vue'
import type { NonGrainWorkspaceContext } from '@/mocks/non-grain-workspace'
import NonGrainTaskSummary from './NonGrainTaskSummary.vue'
import './workspace.scss'

defineProps<{ context: NonGrainWorkspaceContext; readonly: boolean; disabledReason: string }>()
const emit = defineEmits<{ advance: [] }>()
const workers = ref(['陈浩'])
const mode = ref('属地下发')
const remark = ref('请于规定时间内完成现场核查，重点确认实际用途、发生时间及责任主体。')
</script>

<template>
  <div class="ng-page ng-page-stage">
    <div v-if="readonly" class="ng-readonly">{{ disabledReason || '已完成历史页只读' }}</div>
    <div class="ng-grid">
      <NonGrainTaskSummary class="span-12" :context="context" node="department-confirmation" />
      <section class="ng-card span-6 ng-stage-card">
        <h3><i>斑</i>待核查图斑概览</h3>
        <div class="ng-plot-list">
          <article v-for="(plot, index) in context.plots" :key="plot.id" class="ng-plot active">
            <div class="ng-thumb" :class="['img-nursery', 'img-orchard', 'img-pond'][index]"><i>{{ index + 1 }}</i></div>
            <span><b>图斑{{ index + 1 }}：{{ plot.landType }}种植</b><small>面积：{{ plot.area }} 亩</small><small>{{ plot.confirmation }}</small></span>
          </article>
        </div>

        <h4>部门确认依据</h4>
        <ul class="ng-list">
          <li><span>卫片变化监测成果</span><span class="ng-tag ok">已核验</span></li>
          <li><span>永久基本农田叠加分析</span><span class="ng-tag ok">已核验</span></li>
          <li><span>科室初核意见</span><span class="ng-tag ok">已接收</span></li>
        </ul>
      </section>

      <section class="ng-card span-6 ng-stage-card">
        <h3><i>发</i>{{ context.task.taskNo }} 下发</h3>
        <h4>选择下发对象</h4>
        <input class="ng-search" placeholder="搜索姓名、网格或手机号" :disabled="readonly">

        <div class="ng-radio">
          <label v-for="worker in ['陈浩', '徐蕾', '张强']" :key="worker">
            <input v-model="workers" type="checkbox" :value="worker" :disabled="readonly"> <b>{{ worker }}（九龙镇网格员）</b><small>负责属地图斑现场核查</small>
          </label>
        </div>

        <h4>指派方式</h4>
        <div class="ng-radio cols-2">
          <label><input v-model="mode" type="radio" value="属地下发" :disabled="readonly"> <b>属地下发</b><small>按图斑所在地自动分派</small></label>
          <label><input v-model="mode" type="radio" value="直接指派" :disabled="readonly"> <b>直接指派</b><small>手动选择网格员接收任务</small></label>
        </div>

        <label class="ng-field">
          <span>办理备注</span>
          <textarea v-model="remark" :disabled="readonly" />
        </label>

        <div class="ng-actions">
          <button class="primary" :aria-disabled="readonly" :data-permission-tip="readonly ? '无权限操作' : ''" @click="!readonly && emit('advance')">确认下发</button>
        </div>
      </section>
    </div>
  </div>
</template>
