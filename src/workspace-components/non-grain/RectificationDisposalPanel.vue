<script setup lang="ts">
import { ref } from 'vue'
import type { NonGrainWorkspaceContext } from '@/mocks/non-grain-workspace'
import NonGrainTaskSummary from './NonGrainTaskSummary.vue'
import NonGrainUploadTile from './NonGrainUploadTile.vue'
import './workspace.scss'

defineProps<{ context: NonGrainWorkspaceContext; readonly: boolean; disabledReason: string }>()
const emit = defineEmits<{ submit: []; draft: [] }>()
const result = ref('完成整改')
const form = ref({
  parcel: 'TB-NFNL-001 等 3 宗',
  measure: '清除非粮作物并恢复耕作层',
  recovery: '已复耕 11.58 亩',
  use: '水稻种植',
  note: '责任主体已按要求完成阶段性治理。',
})
</script>

<template>
  <div class="ng-page ng-page-stage">
    <div v-if="readonly" class="ng-readonly">{{ disabledReason || '当前页面只读' }}</div>
    <div class="ng-grid">
      <NonGrainTaskSummary class="span-12" :context="context" node="rectification-disposal" />
      <section class="ng-card span-6 ng-stage-card">
        <h3><i>比</i>整改前后对比</h3>
        <div class="ng-grid">
          <div class="span-6"><div class="ng-imagery img-nursery has-boundary" data-label="整改前 · 2026-07-28" /></div>
          <div class="span-6"><div class="ng-imagery img-field-cleared has-boundary" data-label="整改后 · 2026-10-19" /></div>
        </div>

        <h4>三图斑整改状态</h4>
        <div class="ng-plots">
          <article v-for="(plot, index) in context.plots" :key="plot.id" class="ng-plot">
            <b>{{ plot.id }}<em>{{ index === 2 ? '部分完成' : '已完成' }}</em></b>
            <small>{{ plot.landType }} · {{ plot.area }} 亩</small>
            <small>治理进度 {{ index === 2 ? '76%' : '100%' }}</small>
          </article>
        </div>
      </section>

      <section class="ng-card span-6 ng-stage-card">
        <h3><i>填</i>整改结果填报</h3>
        <div class="ng-record-bar"><span>任务编号<b>{{ context.task.taskNo }}</b></span><span>当前图斑<b>图斑1</b></span><span>填报人<b>乡镇治理员01</b></span><span>填报日期<b>2026-10-19</b></span></div>
        <div class="ng-decision">
          <label v-for="item in ['完成整改', '部分整改', '无法整改']" :key="item">
            <input v-model="result" type="radio" :value="item" :disabled="readonly"> {{ item }}
          </label>
        </div>

        <div class="ng-form mt-14">
          <label class="ng-field wide"><span>涉及地块 *</span><input v-model="form.parcel" :disabled="readonly"></label>
          <label class="ng-field"><span>治理措施 *</span><input v-model="form.measure" :disabled="readonly"></label>
          <label class="ng-field"><span>复耕情况 *</span><input v-model="form.recovery" :disabled="readonly"></label>
          <label class="ng-field"><span>恢复用途 *</span><input v-model="form.use" :disabled="readonly"></label>
          <label class="ng-field wide"><span>处置说明</span><textarea v-model="form.note" :disabled="readonly" /></label>
        </div>

        <h4>整改材料</h4>
        <div class="ng-photo-grid">
          <div class="ng-photo img-nursery"><span>整改照片1</span></div>
          <div class="ng-photo img-field-cleared"><span>整改照片2</span></div>
          <NonGrainUploadTile label="补充整改材料" accept="image/*,.pdf,.doc,.docx" :readonly="readonly" />
        </div>

        <div class="ng-actions">
          <button :aria-disabled="readonly" :data-permission-tip="readonly ? '无权限操作' : ''" @click="!readonly && emit('draft')">保存草稿</button>
          <button class="primary" :aria-disabled="readonly" :data-permission-tip="readonly ? '无权限操作' : ''" @click="!readonly && emit('submit')">提交处置</button>
        </div>
      </section>
    </div>
  </div>
</template>
