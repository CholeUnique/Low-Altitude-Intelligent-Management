<script setup lang="ts">
defineProps<{title:string;message:string;canStop?:boolean;progress?:number}>()
defineEmits<{stop:[]}>()
</script>
<template>
  <div class="topic-analysis-progress" role="status" aria-live="polite">
    <div class="analysis-earth" aria-hidden="true"><div class="earth-land"></div><i></i><i></i></div>
    <div class="analysis-progress-content">
      <div class="analysis-progress-heading"><b :title="title">{{ title }}</b><small v-if="progress != null">{{ Math.round(progress) }}%</small></div>
      <span :title="message">{{ message }}</span>
      <div class="analysis-progress-track" role="progressbar" :aria-label="title" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="progress == null ? undefined : Math.round(progress)" :class="{indeterminate:progress == null}"><i :style="progress == null ? undefined : {width:`${Math.min(100,Math.max(0,progress))}%`}"></i></div>
    </div>
    <button v-if="canStop" type="button" aria-label="停止等待" title="停止等待" @click="$emit('stop')">×</button>
  </div>
</template>
<style scoped>
.analysis-progress-track{height:5px;border-radius:4px;background:#8bcbd326;overflow:hidden}.analysis-progress-track i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#36c9ed,#5aefd0);transition:width .35s ease}.analysis-progress-track.indeterminate i{width:35%;animation:progress-pending 1.5s ease-in-out infinite}.topic-analysis-progress small{font-size:12px;color:#69e3e0;font-variant-numeric:tabular-nums;text-align:right}@keyframes progress-pending{from{transform:translateX(-100%)}to{transform:translateX(390%)}}@media(prefers-reduced-motion:reduce){.analysis-progress-track i{transition:none}.analysis-progress-track.indeterminate i{animation:none}}
.topic-analysis-progress{position:absolute;right:8px;bottom:8px;z-index:575;display:flex;align-items:center;gap:10px;width:286px;max-width:calc(100% - 16px);box-sizing:border-box;padding:10px;border:1px solid #76cce33d;border-radius:10px;background:#0b2c40ed;backdrop-filter:blur(16px);box-shadow:0 10px 40px #00132166;color:#d6eef8}.analysis-progress-content{display:grid;gap:6px;flex:1;min-width:0}.analysis-progress-heading{display:flex;align-items:center;justify-content:space-between;gap:8px}.topic-analysis-progress b{font-size:14px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.topic-analysis-progress span{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-size:12px;line-height:18px;color:#93bfce}.topic-analysis-progress button{flex:none;align-self:flex-start;width:24px;height:24px;padding:0;border:0;border-radius:4px;background:none;color:#8bbaca;cursor:pointer;font:inherit;font-size:20px;line-height:24px}.topic-analysis-progress button:hover{color:#d6eef8;background:#70def018}.analysis-earth{position:relative;width:32px;height:32px;flex:none;border:1px solid #70def0;border-radius:50%;overflow:hidden;background:radial-gradient(circle at 30% 25%,#1a6f86,#0b2946 75%);box-shadow:inset -8px -2px 12px #001421aa,0 0 16px #3dc9ec24}.earth-land{position:absolute;inset:0;background:repeating-linear-gradient(90deg,transparent 0 24px,#60e8d0aa 25px 34px,transparent 36px 44px);clip-path:polygon(0 20%,15% 10%,24% 25%,38% 18%,44% 36%,59% 31%,67% 16%,86% 25%,100% 42%,100% 65%,85% 63%,76% 88%,62% 65%,43% 87%,38% 61%,21% 54%,0 70%);background-size:90px 100%;animation:earth-turn 4s linear infinite}.analysis-earth i{position:absolute;inset:0 8px;border:1px solid #8edff14a;border-radius:50%}.analysis-earth i+i{inset:9px -1px}@keyframes earth-turn{to{background-position:90px 0}}@media(prefers-reduced-motion:reduce){.earth-land{animation:none}}
</style>
