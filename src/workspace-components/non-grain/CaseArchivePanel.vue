<script setup lang="ts">
import { ref } from 'vue'
import type { NonGrainWorkspaceContext } from '@/mocks/non-grain-workspace'
import './workspace.scss'

defineProps<{ context: NonGrainWorkspaceContext; readonly: boolean; disabledReason: string }>()
const emit = defineEmits<{ close: []; draft: [] }>()
const type = ref('整改完成结案')
const form = ref({
  result: '三处疑似非粮化图斑均已核查并完成闭环处置。',
  reason: '现场核查、整改及无人机复核材料完整，符合结案条件。',
  note: '建议纳入季度耕地用途变化动态巡查台账。',
})
</script>

<template>
  <div class="ng-page">
    <div v-if="readonly" class="ng-readonly">{{ disabledReason || '已结案，仅供查看' }}</div>
    <div class="ng-grid">
      <section class="ng-card span-5">
        <h3>结案依据</h3>
        <ul class="ng-list">
          <li><span>现场核查依据</span><span class="ng-tag ok">材料齐全</span></li>
          <li><span>整改处置依据</span><span class="ng-tag ok">材料齐全</span></li>
          <li><span>无人机复核依据</span><span class="ng-tag ok">复核通过</span></li>
        </ul>

        <h4>三图斑可结案状态</h4>
        <article v-for="plot in context.plots" :key="plot.id" class="ng-plot compact">
          <b>{{ plot.id }}<em>可结案</em></b>
          <small>{{ plot.location }} · {{ plot.area }} 亩</small>
        </article>
      </section>

      <section class="ng-card span-7">
        <h3>结案归档</h3>
        <div class="ng-decision">
          <label v-for="item in ['整改完成结案', '核查无问题结案', '其他情形结案']" :key="item">
            <input v-model="type" type="radio" :value="item" :disabled="readonly"> {{ item }}
          </label>
        </div>

        <div class="ng-form mt-14">
          <label class="ng-field wide"><span>处置结果 *</span><input v-model="form.result" :disabled="readonly"></label>
          <label class="ng-field wide"><span>结案原因 *</span><textarea v-model="form.reason" :disabled="readonly" /></label>
          <label class="ng-field wide"><span>结案说明</span><textarea v-model="form.note" :disabled="readonly" /></label>
        </div>

        <h4>归档材料</h4>
        <div class="ng-photo-grid">
          <div class="ng-photo">核查卷宗</div>
          <div class="ng-photo">闭环报告</div>
          <div class="ng-photo upload">+ 上传归档材料</div>
        </div>

        <div class="ng-actions">
          <button :disabled="readonly" :title="readonly ? disabledReason : ''" @click="emit('draft')">保存</button>
          <button class="primary" :disabled="readonly" :title="readonly ? disabledReason : ''" @click="emit('close')">确认结案</button>
        </div>
      </section>
    </div>
  </div>
</template>
