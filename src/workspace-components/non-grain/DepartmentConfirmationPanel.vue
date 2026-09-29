<script setup lang="ts">
import { ref } from 'vue'
import type { NonGrainWorkspaceContext } from '@/mocks/non-grain-workspace'
import './workspace.scss'

defineProps<{ context: NonGrainWorkspaceContext; readonly: boolean; disabledReason: string }>()
const emit = defineEmits<{ advance: [] }>()
const workers = ref(['陈浩'])
const mode = ref('属地下发')
const remark = ref('请于规定时间内完成现场核查，重点确认实际用途、发生时间及责任主体。')
</script>

<template>
  <div class="ng-page">
    <div v-if="readonly" class="ng-readonly">{{ disabledReason || '已完成历史页只读' }}</div>
    <div class="ng-grid">
      <section class="ng-card span-7">
        <h3>待确认图斑（3）</h3>
        <div class="ng-plots">
          <article v-for="plot in context.plots" :key="plot.id" class="ng-plot active">
            <b>{{ plot.id }}<em>{{ plot.landType }}</em></b>
            <small>{{ plot.location }} · {{ plot.area }} 亩</small>
            <small>{{ plot.owner }}</small>
          </article>
        </div>

        <h4>部门确认依据</h4>
        <ul class="ng-list">
          <li><span>卫片变化监测成果</span><span class="ng-tag ok">已核验</span></li>
          <li><span>永久基本农田叠加分析</span><span class="ng-tag ok">已核验</span></li>
          <li><span>科室初核意见</span><span class="ng-tag ok">已接收</span></li>
        </ul>
      </section>

      <section class="ng-card span-5">
        <h3>指派网格员</h3>
        <input class="ng-search" placeholder="搜索姓名、网格或手机号" :disabled="readonly">

        <div class="ng-radio">
          <label v-for="worker in ['陈浩', '徐蕾', '张强']" :key="worker">
            <input v-model="workers" type="checkbox" :value="worker" :disabled="readonly"> {{ worker }}（九龙镇网格）
          </label>
        </div>

        <h4>指派方式</h4>
        <div class="ng-radio cols-2">
          <label><input v-model="mode" type="radio" value="属地下发" :disabled="readonly"> 属地下发</label>
          <label><input v-model="mode" type="radio" value="直接指派" :disabled="readonly"> 直接指派</label>
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
