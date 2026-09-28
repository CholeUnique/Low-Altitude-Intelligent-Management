<script setup lang="ts">
import { ref } from 'vue'
import type { NonGrainWorkspaceContext } from '@/mocks/non-grain-workspace'
import './workspace.scss'

defineProps<{ context: NonGrainWorkspaceContext; readonly: boolean; disabledReason: string }>()
const emit = defineEmits<{ submit: [hasProblem: boolean]; draft: [] }>()
const selected = ref(0)
const result = ref<'problem' | 'clear'>('problem')
const useType = ref('景观苗木种植')
const crop = ref('香樟、桂花')
const note = ref('现场边界与疑似图斑基本一致，地块内种植景观苗木。')
</script>

<template>
  <div class="ng-page">
    <div v-if="readonly" class="ng-readonly">{{ disabledReason || '当前页面只读' }}</div>
    <div class="ng-grid">
      <section class="ng-card span-4">
        <h3>图斑列表</h3>
        <article
          v-for="(plot, index) in context.plots"
          :key="plot.id"
          class="ng-plot clickable"
          :class="{ active: index === selected }"
          @click="selected = index"
        >
          <b>{{ plot.id }}<em>{{ plot.area }} 亩</em></b>
          <small>{{ plot.location }}</small>
          <small>{{ plot.confirmation }}</small>
        </article>

        <h4>现场联络</h4>
        <ul class="ng-list">
          <li><span>定位坐标</span><b>119.9214, 32.4698</b></li>
          <li><span>责任人电话</span><b>138****6042</b></li>
        </ul>
      </section>

      <section class="ng-card span-8">
        <h3>现场核查记录 · {{ context.plots[selected]?.id }}</h3>
        <div class="ng-radio cols-2">
          <label><input v-model="result" type="radio" value="problem" :disabled="readonly"> 发现问题</label>
          <label><input v-model="result" type="radio" value="clear" :disabled="readonly"> 无问题</label>
        </div>

        <div v-if="result === 'problem'" class="ng-form">
          <label class="ng-field">
            <span>实际用途 *</span>
            <select v-model="useType" :disabled="readonly">
              <option>景观苗木种植</option>
              <option>果园种植</option>
              <option>养殖坑塘</option>
            </select>
          </label>
          <label class="ng-field">
            <span>季节作物</span>
            <input v-model="crop" :disabled="readonly">
          </label>
          <label class="ng-field wide">
            <span>核查说明 *</span>
            <textarea v-model="note" :disabled="readonly" />
          </label>
        </div>

        <div v-else class="ng-form">
          <label class="ng-field wide">
            <span>无问题说明 *</span>
            <textarea v-model="note" :disabled="readonly" placeholder="填写排除依据和现场情况" />
          </label>
        </div>

        <h4>现场照片</h4>
        <div class="ng-photo-grid">
          <div class="ng-photo">地块全景<br>已定位</div>
          <div class="ng-photo">现状近景<br>2026-09-25</div>
          <div class="ng-photo upload">+ 上传照片</div>
        </div>

        <div class="ng-actions">
          <button :disabled="readonly" :title="readonly ? disabledReason : ''" @click="emit('draft')">保存草稿</button>
          <button class="primary" :disabled="readonly" :title="readonly ? disabledReason : ''" @click="emit('submit', result === 'problem')">提交核查</button>
        </div>
      </section>
    </div>
  </div>
</template>
