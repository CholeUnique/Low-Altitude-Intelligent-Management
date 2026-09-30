<script setup lang="ts">
import { ref } from 'vue'
import type { NonGrainWorkspaceContext } from '@/mocks/non-grain-workspace'
import NonGrainTaskSummary from './NonGrainTaskSummary.vue'
import NonGrainUploadTile from './NonGrainUploadTile.vue'
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
  <div class="ng-page ng-page-stage ng-page-onsite">
    <div v-if="readonly" class="ng-readonly">{{ disabledReason || '当前页面只读' }}</div>
    <div class="ng-grid">
      <NonGrainTaskSummary class="span-12" :context="context" node="on-site-verification" />
      <section class="ng-card span-3 ng-stage-card">
        <h3><i>斑</i>待核查图斑（{{ context.plots.length }}个）</h3>
        <div class="ng-plot-list ng-plot-list--side">
          <article
            v-for="(plot, index) in context.plots"
            :key="plot.id"
            class="ng-plot clickable"
            :class="{ active: index === selected }"
            @click="selected = index"
          >
            <div class="ng-thumb" :class="['img-paddy', 'img-orchard', 'img-pond'][index]" />
            <span><b>图斑{{ index + 1 }}</b><small>{{ plot.landType === '养殖坑塘' ? plot.landType : `${plot.landType}种植` }}</small><small>面积：{{ plot.area }} 亩</small></span>
          </article>
        </div>

        <div class="ng-info-box"><h4>填写说明</h4><p>选择核查结论并补充说明；上传现场照片与定位信息；提交后进入整改环节。</p></div>
      </section>

      <section class="ng-card span-9 ng-stage-card">
        <h3><i>填</i>现场核查填报</h3>
        <div class="ng-record-bar"><span>任务编号<b>{{ context.task.taskNo }}</b></span><span>当前图斑<b>图斑{{ selected + 1 }}</b></span><span>核查人<b>区县核查员01</b></span><span>核查日期<b>2026-07-28</b></span></div>
        <h4>核查结论</h4>
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
          <div class="ng-photo img-field-cleared"><span>拍摄点位1<br>已记录定位</span></div>
          <div class="ng-photo img-road"><span>拍摄点位2<br>2026-07-28</span></div>
          <NonGrainUploadTile label="上传现场照片" :readonly="readonly" />
        </div>

        <h4>现场定位与附加信息</h4>
        <div class="ng-form ng-form--three"><label class="ng-field"><span>经纬度 *</span><input value="32.4861, 119.9234" disabled></label><label class="ng-field"><span>所属村组 *</span><input value="姚家村" disabled></label><label class="ng-field"><span>联系电话 *</span><input value="138****5621" disabled></label></div>

        <div class="ng-actions">
          <button :aria-disabled="readonly" :data-permission-tip="readonly ? '无权限操作' : ''" @click="!readonly && emit('draft')">保存草稿</button>
          <button class="primary" :aria-disabled="readonly" :data-permission-tip="readonly ? '无权限操作' : ''" @click="!readonly && emit('submit', result === 'problem')">提交核查</button>
        </div>
      </section>
    </div>
  </div>
</template>
