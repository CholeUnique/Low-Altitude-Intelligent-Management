<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { PortalTask, WorkspaceNodeConfig } from '@/types'
import { problemSpots } from '@/mocks/governance'

const props = defineProps<{ task?: PortalTask; node?: WorkspaceNodeConfig }>()
const director = computed(() => props.node?.key === 'director-review')
const stage = computed(() => director.value ? '分管局长审核' : '分管科长审核')
const nextStage = computed(() => director.value ? '分管科长审核' : '核查任务派发')
const recipient = ref('')
const opinion = ref('同意进入下一环节，请结合图斑范围及影像材料组织现场核查，注意留存前后对比影像。')
const decision = ref('同意流转')
watch(decision, () => { recipient.value = '' })
const notice = ref('')
const plots = problemSpots.filter(item => item.status !== '已排除')
const checklist = [
  { label: '图斑位置及面积', value: '4 个待核查 · 7.87 ha', status: '已核对' },
  { label: '多期影像与识别依据', value: '前后对比 12 组 / 关联成果 3 份', status: '待复核' },
  { label: '用途管制及审批信息', value: '需与审批台账进行人工比对', status: '待确认' },
  { label: '属地及核查责任', value: '建议按图斑属地分配核查', status: '已核对' },
]
function submit() {
  notice.value = !recipient.value ? '请先选择下一环节办理人。' :
    !opinion.value.trim() ? '请填写审核意见。' :
      `演示确认：${decision.value}，拟流转至 ${recipient.value}；未写入实际业务系统。`
}
</script>

<template>
  <div class="approval-page">
    <div class="approval-heading">
      <div><small>FORESTRY SUPERVISION · REVIEW / DEMO</small><h1>{{ stage }}</h1><p>基于疑似图斑研判材料进行人工审核，确认后选择下一环节办理人</p></div>
      <div class="heading-state"><i></i>待人工审核 <span>流程示意 · 岗位待确认</span></div>
    </div>

    <div class="approval-metrics">
      <article><span>关联任务</span><b>01</b><small>{{ task?.name || '海陵区林地变化疑似图斑核查' }}</small></article>
      <article><span>待审核图斑</span><b>04<em>个</em></b><small>高风险 2 个 · 中风险 2 个</small></article>
      <article><span>涉及面积</span><b>7.87<em>ha</em></b><small>以现场测绘结果为准</small></article>
      <article><span>待核材料</span><b>12<em>组</em></b><small>影像对比 · 识别成果</small></article>
    </div>

    <div class="approval-columns">
      <section class="approval-card dossier">
        <header><div><b>审核材料 / 图斑清单</b><small>任务编号：LY-2026-0918-001 · 资料示意</small></div><span>查看全部 ›</span></header>
        <div class="map-preview"><div class="map-grid"></div><div class="map-boundary"></div><i class="pin pin-a">01</i><i class="pin pin-b">02</i><i class="pin pin-c">03</i><strong>海陵区 · 影像叠加预览</strong><small>示意图层 / 非实际测绘底图</small></div>
        <div class="plot-list"><div v-for="item in plots" :key="item.id" class="plot-item"><span class="plot-icon">▣</span><div><b>{{ item.id }} <em>{{ item.type }}</em></b><small>{{ item.source }} · {{ item.area }} ha · 识别置信度 {{ item.confidence }}%</small></div><span class="risk" :class="item.risk === '高' ? 'high' : ''">{{ item.risk }}风险</span></div></div>
      </section>

      <section class="approval-card evidence">
        <header><div><b>审核要点</b><small>逐项核实来源、范围与交办依据</small></div><span>4 / 4 项</span></header>
        <div class="review-note"><i>ⓘ</i><span>疑似图斑不等于违法认定；现场核查与审批材料比对后再形成正式结论。</span></div>
        <div class="checklist"><article v-for="(item,index) in checklist" :key="item.label"><span class="check-number">0{{ index+1 }}</span><div><b>{{ item.label }}</b><small>{{ item.value }}</small></div><em :class="item.status === '已核对' ? 'checked' : ''">{{ item.status }}</em></article></div>
        <div class="summary"><b>内业研判摘要</b><p>无人机巡查、卫片比对发现疑似林地变化。建议结合土地审批、林地使用手续和现场位置进行核实，并针对每个图斑留存定位、全景和细节影像。</p><div><span>影像成果 12 组</span><span>图斑矢量 4 个</span><span>研判报告 1 份</span></div></div>
        <div class="route"><b>当前流转路径</b><p>任务详情 <i>→</i> <strong>{{ stage }}</strong> <i>→</i> {{ nextStage }} <i>→</i> 实地核查</p></div>
      </section>

      <aside class="approval-card routing">
        <header><div><b>审核意见与流转</b><small>选定下一环节办理人后确认</small></div></header>
        <div class="routing-body"><label>审核决定<div class="choices"><button v-for="option in ['同意流转','退回补充材料']" :key="option" :class="{selected: decision===option}" @click="decision=option">{{ option }}</button></div></label>
          <label>下一环节<span class="next-stage">{{ decision === '同意流转' ? nextStage : '退回任务详情补充材料' }}</span></label>
          <label>选择办理人 <small>演示岗位，实际名单待配置</small><select v-model="recipient"><option value="">请选择下一环节办理人</option><option v-if="decision !== '同意流转'" value="任务发起人（示例）">任务发起人（示例）</option><option v-if="director && decision === '同意流转'" value="业务科室负责人 A（示例）">业务科室负责人 A（示例）</option><option v-if="director && decision === '同意流转'" value="业务科室负责人 B（示例）">业务科室负责人 B（示例）</option><option v-if="!director && decision === '同意流转'" value="核查任务经办人 A（示例）">核查任务经办人 A（示例）</option><option v-if="!director && decision === '同意流转'" value="核查任务经办人 B（示例）">核查任务经办人 B（示例）</option></select></label>
          <label>办理期限 <input type="date" value="2026-09-25" /></label>
          <label>审核意见 <textarea v-model="opinion" rows="5" placeholder="请输入审核意见和核查要求"></textarea></label>
          <div class="handoff"><b>流转提醒</b><p>确认后将生成下一环节待办；演示版仅展示交互反馈，不会实际发送通知。</p></div>
        </div>
        <footer><p>{{ notice || '请核对审核意见和接收人，再确认流转。' }}</p><button @click="notice='演示草稿已暂存于当前页面。'">暂存意见</button><button class="primary" @click="submit">{{ decision === '同意流转' ? '确认审核并流转' : '确认退回补充' }} →</button></footer>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.approval-page{height:100%;min-height:0;display:flex;flex-direction:column;gap:11px;padding:14px 16px 16px;color:#233f51;background:#eef3f6;box-sizing:border-box}.approval-heading{display:flex;justify-content:space-between;align-items:center}.approval-heading small{font-size:9px;letter-spacing:2px;color:#1394a9}.approval-heading h1{margin:3px 0;font-size:23px;color:#123b50}.approval-heading p{margin:0;color:#8499a5;font-size:11px}.heading-state{padding:9px 13px;border:1px solid #d4e5e7;border-radius:22px;background:white;color:#ad7124;font-size:12px}.heading-state i{display:inline-block;width:7px;height:7px;margin-right:6px;background:#efa943;border-radius:50%}.heading-state span{margin-left:8px;color:#92a5ae;font-size:10px}.approval-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.approval-metrics article{height:72px;box-sizing:border-box;padding:10px 14px;border:1px solid #d8e6eb;border-radius:7px;background:#fff;box-shadow:0 3px 12px #173b5010}.approval-metrics span,.approval-metrics small{display:block;color:#8398a4;font-size:10px}.approval-metrics b{display:block;color:#087ea0;font-size:22px;line-height:25px}.approval-metrics em{margin-left:3px;font-size:11px;font-style:normal}.approval-metrics small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.approval-columns{flex:1;min-height:0;display:grid;grid-template-columns:minmax(320px,1fr) minmax(340px,1fr) 330px;gap:10px}.approval-card{min-height:0;overflow:hidden;border:1px solid #d8e4e9;border-radius:7px;background:#fff;box-shadow:0 3px 12px #173b5010}.approval-card header{height:49px;box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;padding:0 14px;border-bottom:1px solid #e8eff2}.approval-card header b,.approval-card header small{display:block}.approval-card header b{font-size:13px}.approval-card header small{margin-top:3px;color:#98aab2;font-size:9px}.approval-card header>span{color:#1593aa;font-size:10px}.map-preview{height:230px;position:relative;overflow:hidden;background:radial-gradient(ellipse at 65% 32%,#b5c99b 0 15%,transparent 50%),radial-gradient(ellipse at 22% 72%,#698d65,transparent 54%),#89a87e}.map-grid{position:absolute;inset:0;opacity:.45;background:repeating-linear-gradient(12deg,transparent 0 46px,#ecddaa 47px 50px,transparent 52px 94px),repeating-linear-gradient(112deg,transparent 0 60px,#d9cf9d 62px 64px,transparent 66px 126px)}.map-boundary{position:absolute;inset:13% 18% 18% 23%;border:3px dashed #f7f38a;transform:rotate(-15deg);border-radius:36% 55% 20% 40%;box-shadow:0 0 0 120px #143c321f}.pin{position:absolute;width:29px;height:29px;display:grid;place-items:center;background:#dc6d48;border:2px solid white;border-radius:50%;color:white;font-size:10px;font-style:normal;box-shadow:0 3px 12px #0008}.pin-a{top:25%;left:37%}.pin-b{top:48%;left:64%}.pin-c{top:66%;left:44%}.map-preview strong,.map-preview small{position:absolute;left:12px;bottom:12px;padding:6px 9px;background:#153c48c9;color:white;font-size:10px}.map-preview small{left:auto;right:12px;font-size:9px}.plot-list{overflow:auto;max-height:calc(100% - 280px)}.plot-item{display:flex;align-items:center;gap:9px;padding:12px;border-bottom:1px solid #eef2f4}.plot-icon{padding:7px;color:#1688a4;background:#e9f6f8;border-radius:4px}.plot-item div{min-width:0;flex:1}.plot-item b,.plot-item small{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.plot-item b{font-size:10px}.plot-item em{margin-left:3px;color:#496a79;font-style:normal;font-weight:400}.plot-item small{margin-top:5px;color:#93a4ad;font-size:9px}.risk{padding:3px 5px;background:#fff5dd;color:#b07b1d;font-size:9px}.risk.high{background:#fff0ed;color:#db6e4b}.review-note{display:flex;gap:8px;margin:12px;padding:10px;background:#eef9fb;color:#488394;font-size:10px;line-height:1.5}.review-note i{font-size:15px;font-style:normal}.checklist{padding:0 14px}.checklist article{display:flex;align-items:center;gap:10px;padding:14px 0;border-bottom:1px dashed #e5ecef}.check-number{width:25px;height:25px;display:grid;place-items:center;background:#eaf7fa;color:#1b9bb1;border-radius:50%;font-size:10px}.checklist article div{flex:1}.checklist b,.checklist small{display:block}.checklist b{font-size:11px}.checklist small{margin-top:5px;color:#9aadb5;font-size:9px}.checklist em{color:#b0782c;font-size:10px;font-style:normal}.checklist em.checked{color:#24a084}.summary{margin:13px;padding:12px;background:#f7fafb;border:1px solid #e5eef1}.summary b,.route b{font-size:11px}.summary p{font-size:10px;line-height:1.7;color:#6b8591}.summary div{display:flex;flex-wrap:wrap;gap:5px}.summary span{padding:5px;color:#2389a3;background:#e8f4f8;font-size:9px}.route{margin:13px;padding:11px;border-left:3px solid #1aa7b5;background:#f2f9fa}.route p{color:#738d98;font-size:10px}.route strong{color:#058da3}.route i{font-style:normal;color:#24a8b4}.routing{display:flex;flex-direction:column}.routing-body{flex:1;min-height:0;overflow:auto;padding:15px}.routing-body label{display:block;margin-bottom:15px;color:#546f7e;font-size:11px;font-weight:600}.routing-body label small{margin-left:5px;color:#a4b1b8;font-size:9px;font-weight:400}.routing-body input,.routing-body select,.routing-body textarea{display:block;box-sizing:border-box;width:100%;margin-top:7px;padding:9px;border:1px solid #cfdee5;border-radius:4px;background:#fbfdfe;color:#345667;font:inherit;font-weight:400}.routing-body textarea{resize:none;line-height:1.6}.choices{display:flex;gap:6px;margin-top:7px}.choices button{flex:1;padding:9px 4px;border:1px solid #d5e1e7;border-radius:4px;background:white;color:#748d9a;font-size:10px;cursor:pointer}.choices button.selected{border-color:#17a6be;background:#e8f8fb;color:#07849d}.next-stage{display:block;margin-top:7px;padding:10px;background:#eef8fa;color:#138ca3;font-size:11px}.handoff{padding:11px;border:1px dashed #8ec9d5;background:#f6fbfc}.handoff b{font-size:11px}.handoff p{margin:7px 0 0;color:#8aa1aa;line-height:1.6;font-size:10px}.routing footer{padding:12px 14px;border-top:1px solid #e6eff2}.routing footer p{height:27px;margin:0;color:#718a96;font-size:10px}.routing footer button{padding:9px 13px;border:1px solid #cbdce5;border-radius:4px;background:#fff;color:#517388;font-size:11px;cursor:pointer}.routing footer button.primary{float:right;background:#078cac;border-color:#078cac;color:#fff}
</style>
