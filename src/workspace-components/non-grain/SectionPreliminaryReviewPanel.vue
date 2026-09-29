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
  <div class="ng-page ng-page-stage">
    <div v-if="readonly" class="ng-readonly">{{ disabledReason || '已完成历史页只读' }}</div>
    <div class="ng-grid">
      <NonGrainTaskSummary class="span-12" :context="context" node="section-preliminary-review" />

      <section class="ng-card span-6 ng-stage-card">
        <h3><i>斑</i>初核图斑概览</h3>
        <div class="ng-plot-list">
          <article v-for="(plot, index) in context.plots" :key="plot.id" class="ng-plot">
            <div class="ng-thumb" :class="['img-nursery', 'img-orchard', 'img-pond'][index]"><i>{{ index + 1 }}</i></div>
            <span><b>图斑{{ index + 1 }}：{{ plot.landType === '养殖坑塘' ? plot.landType : `${plot.landType}种植` }}</b><small>面积：{{ plot.area }} 亩</small><small>建议区级进一步核实现状与种植用途。</small></span>
          </article>
        </div>
        <div class="ng-info-box"><h4>初核说明</h4><p>通过多时相影像对比，发现上述图斑存在由粮食作物种植转为苗木、果园、坑塘等其他用途的情况。</p><p>初步判断为疑似非粮化，建议下发区级农业农村部门进一步核实。</p></div>
      </section>

      <section class="ng-card span-6 ng-stage-card">
        <h3><i>发</i>{{ context.task.taskNo }} 下发</h3>
        <h4>选择下发部门</h4>
        <input class="ng-search" placeholder="搜索部门名称" :disabled="readonly">

        <div class="ng-radio">
          <label v-for="(name, index) in ['海陵区农业农村局', '九龙镇农业农村局', '耕地保护监督科']" :key="name">
            <input v-model="departments" type="checkbox" :value="name" :disabled="readonly"> <b>{{ name }}</b><small>将接收 {{ index === 0 ? 3 : 1 }} 条</small>
          </label>
        </div>

        <h4>下发方式</h4>
        <div class="ng-radio cols-2">
          <label><input v-model="dispatchMode" type="radio" value="逐级下发" :disabled="readonly"> <b>逐级下发</b><small>发给区级部门，由其接收后继续组织核查</small></label>
          <label><input v-model="dispatchMode" type="radio" value="基层下发" :disabled="readonly"> <b>直接下发至基层</b><small>跳过区级部门，直接发给基层核查单位</small></label>
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
