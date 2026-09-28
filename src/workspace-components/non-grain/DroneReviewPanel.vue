<script setup lang="ts">
import { ref } from 'vue'
import type { NonGrainWorkspaceContext } from '@/mocks/non-grain-workspace'
import './workspace.scss'

defineProps<{ context: NonGrainWorkspaceContext; readonly: boolean; disabledReason: string }>()
const emit = defineEmits<{ pass: []; reject: [] }>()
const conclusion = ref<'pass' | 'reject'>('pass')
const recovery = ref('复耕面积 13.21 亩，耕作层恢复完整，已种植当季水稻。')
const note = ref('三时相比对显示苗木及附属设施已清除，坑塘已回填。')
</script>

<template>
  <div class="ng-page">
    <div v-if="readonly" class="ng-readonly">{{ disabledReason || '当前页面只读' }}</div>
    <div class="ng-grid">
      <section class="ng-card span-8">
        <h3>三时相影像比对</h3>
        <div class="ng-grid">
          <div v-for="(label, index) in ['历史基准 · 2025-08', '问题发现 · 2026-09', '复核航拍 · 2026-10']" :key="label" class="span-4">
            <div class="ng-imagery triptych" :class="{ current: index === 1, after: index === 2 }" :data-label="label" />
          </div>
        </div>

        <h4>复核成果</h4>
        <div class="ng-plots">
          <article v-for="plot in context.plots" :key="plot.id" class="ng-plot">
            <b>{{ plot.id }}<em>边界吻合</em></b>
            <small>复核面积 {{ plot.area }} 亩</small>
            <small>变化消除率 96.8%</small>
          </article>
        </div>
      </section>

      <section class="ng-card span-4">
        <h3>无人机复核结论</h3>
        <div class="ng-decision cols-2">
          <label><input v-model="conclusion" type="radio" value="pass" :disabled="readonly"> 完成治理</label>
          <label><input v-model="conclusion" type="radio" value="reject" :disabled="readonly"> 整改不到位</label>
        </div>

        <div class="ng-form mt-14">
          <label class="ng-field wide"><span>复耕信息 *</span><textarea v-model="recovery" :disabled="readonly" /></label>
          <label class="ng-field wide"><span>复核说明 *</span><textarea v-model="note" :disabled="readonly" /></label>
        </div>

        <h4>复核材料</h4>
        <div class="ng-photo-grid">
          <div class="ng-photo">正射影像</div>
          <div class="ng-photo">飞行报告</div>
          <div class="ng-photo upload">+ 上传</div>
        </div>

        <div class="ng-actions">
          <button class="danger" :disabled="readonly" :title="readonly ? disabledReason : ''" @click="emit('reject')">返回整改</button>
          <button class="primary" :disabled="readonly" :title="readonly ? disabledReason : ''" @click="conclusion === 'pass' ? emit('pass') : emit('reject')">确认复核</button>
        </div>
      </section>
    </div>
  </div>
</template>
