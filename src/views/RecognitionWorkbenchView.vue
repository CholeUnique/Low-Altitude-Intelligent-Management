<script setup lang="ts">
import PlatformLayout from '@/layouts/PlatformLayout.vue'
import SpotIdentificationPanel from '@/workspace-components/spot-identification/SpotIdentificationPanel.vue'
const menu=[{label:'飞行结果',path:'/recognition/flight-results',icon:'飞'},{label:'智能识别',path:'/recognition/intelligent',icon:'识'},{label:'算法仓库',path:'/algorithms',icon:'算'}]
</script>
<template><PlatformLayout section="recognition" title="识别研判" subtitle="将飞行影像转化为问题图斑与治理任务" :menu="menu">
  <div class="page-head"><div><h2>智能识别</h2><p>AI 自动识别、人工上传与多期影像研判统一工作区</p></div><div class="actions"><button>上传疑似图斑</button><button class="primary">选中图斑创建任务（2）</button></div></div>
  <section class="summary"><article><span>待研判图斑</span><b>86</b><small>今日新增 12</small></article><article><span>高风险</span><b>18</b><small>优先核验</small></article><article><span>AI 平均置信度</span><b>92.6%</b><small>8 个在线算法</small></article><article><span>今日形成任务</span><b>9</b><small>合并 24 个图斑</small></article></section>
  <div class="recognition-panel"><SpotIdentificationPanel scene-name="林业执法监管" /></div>
</PlatformLayout></template>
<style scoped lang="scss">
.actions{display:flex;gap:8px}.actions button{padding:8px 12px;color:#52717e;background:#fff;border:1px solid #cadde4;border-radius:4px;font-size:9px}.actions .primary{color:#fff;background:#0b91ad;border-color:#0b91ad}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin-bottom:9px}.summary article{padding:10px 14px;background:#fff;border:1px solid #dbe6eb;border-radius:6px}.summary span{color:#718792;font-size:9px}.summary b{display:block;margin-top:4px;color:#183f52;font-size:21px}.summary small{float:right;margin-top:-16px;color:#84969e;font-size:8px}.recognition-panel{height:calc(100vh - 214px);min-height:470px;overflow:hidden}.recognition-panel :deep(.spot-identification){height:100%;padding:0!important;background:transparent}.recognition-panel :deep(.panel){border-radius:6px;box-shadow:none}
.recognition-panel :deep(.spot-page){height:100%;padding:0!important;background:transparent}
</style>
