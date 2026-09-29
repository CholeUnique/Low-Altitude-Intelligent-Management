<script setup lang="ts">
import { ref } from 'vue'
import type { NonGrainWorkspaceContext } from '@/mocks/non-grain-workspace'
import NonGrainTaskSummary from './NonGrainTaskSummary.vue'
import NonGrainUploadTile from './NonGrainUploadTile.vue'
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
  <div class="ng-page ng-page-stage">
    <div v-if="readonly" class="ng-readonly">{{ disabledReason || '已结案，仅供查看' }}</div>
    <div class="ng-grid">
      <NonGrainTaskSummary class="span-12" :context="context" node="case-archive" />
      <section class="ng-card span-5 ng-stage-card">
        <h3><i>据</i>结案依据概览</h3>
        <ul class="ng-list">
          <li><span>现场核查<small>图斑1：现场核查确认存在非粮化问题</small></span><span class="ng-tag ok">已完成</span></li>
          <li><span>整改处置<small>已清除苗木并翻耕整地</small></span><span class="ng-tag ok">已完成</span></li>
          <li><span>无人机复核<small>复核确认已恢复粮食生产条件</small></span><span class="ng-tag ok">已完成</span></li>
        </ul>

        <h4>三图斑可结案状态</h4>
        <article v-for="plot in context.plots" :key="plot.id" class="ng-plot compact">
          <b>{{ plot.id }}<em>可结案</em></b>
          <small>{{ plot.location }} · {{ plot.area }} 亩</small>
        </article>
      </section>

      <section class="ng-card span-7 ng-stage-card">
        <h3><i>填</i>结案信息填报</h3>
        <div class="ng-record-bar"><span>任务编号<b>{{ context.task.taskNo }}</b></span><span>当前图斑<b>图斑1</b></span><span>结案人<b>农业农村局管理员01</b></span><span>结案日期<b>2026-10-21</b></span></div>
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
        <div class="ng-photo-grid four">
          <div class="ng-photo img-road"><span>现场核查照片</span></div>
          <div class="ng-photo img-field-cleared"><span>整改结果照片</span></div>
          <div class="ng-photo img-restored"><span>无人机复核影像</span></div>
          <NonGrainUploadTile label="上传归档材料" accept="image/*,.pdf,.doc,.docx,.zip" :readonly="readonly" />
        </div>

        <div class="ng-actions">
          <button :aria-disabled="readonly" :data-permission-tip="readonly ? '无权限操作' : ''" @click="!readonly && emit('draft')">保存</button>
          <button class="primary" :aria-disabled="readonly" :data-permission-tip="readonly ? '无权限操作' : ''" @click="!readonly && emit('close')">确认结案</button>
        </div>
      </section>
    </div>
  </div>
</template>
