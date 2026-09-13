<script setup lang="ts">
import { computed, ref } from 'vue'
import type { PortalTask } from '@/types'
import { archiveMaterials, operationLogs, reviewCases, reviewWorkflow } from '@/mocks/governance'

defineProps<{ task?: PortalTask }>()
const tab = ref('待复核')
const activeId = ref(reviewCases[0]!.id)
const conclusion = ref('经复核，现场整改范围与问题图斑一致，林地植被恢复措施基本到位，建议通过复核。')
const result = ref('整改完成')
const feedback = ref('')
const compare = ref(52)
const cases = computed(() => reviewCases.filter((item) => item.status === tab.value))
const active = computed(() => reviewCases.find((item) => item.id === activeId.value) || cases.value[0] || reviewCases[0]!)
function act(name: string) { feedback.value = `${active.value.id}：${name}操作已记录` }
</script>

<template>
  <div class="review-page">
    <aside class="panel case-list">
      <div class="tabs"><button v-for="name in ['待复核','待归档','已归档']" :key="name" :class="{active:tab===name}" @click="tab=name">{{ name }} <small>{{ reviewCases.filter(i=>i.status===name).length }}</small></button></div>
      <button v-for="item in cases" :key="item.id" class="case-row" :class="{active:item.id===activeId}" @click="activeId=item.id">
        <i>案</i><span><b>{{ item.title }}</b><small>{{ item.id }} · {{ item.area }}</small><em>{{ item.assignee }} · {{ item.updatedAt }}</em></span>
      </button>
      <div v-if="!cases.length" class="empty">暂无{{ tab }}案件</div>
    </aside>

    <section class="center-col">
      <div class="panel compare-panel">
        <div class="panel-title">整改前后影像对比 <small>{{ active.title }}</small></div>
        <div class="compare-view">
          <div class="before"><span>整改前影像</span></div>
          <div class="after" :style="{ width: `${compare}%` }"><span>整改后影像</span></div>
          <i :style="{ left: `${compare}%` }"></i>
        </div>
        <input v-model.number="compare" type="range" min="10" max="90" />
        <div class="image-strip"><button class="active">整改前</button><button>整改后</button><button>无人机复核影像</button><p>变化说明：裸土区域已完成补植复绿，临时构筑物已拆除。</p></div>
      </div>
      <div class="panel materials">
        <div class="panel-title">归档材料</div>
        <table><thead><tr><th>材料名称</th><th>类型</th><th>大小</th><th>状态</th><th>操作</th></tr></thead><tbody><tr v-for="item in archiveMaterials" :key="item.name"><td>{{ item.name }}</td><td>{{ item.type }}</td><td>{{ item.size }}</td><td><em :class="{pending:item.status!=='完整'}">{{ item.status }}</em></td><td><button>查看</button></td></tr></tbody></table>
      </div>
    </section>

    <aside class="right-col">
      <div class="panel result-panel">
        <div class="panel-title">复核结论</div>
        <dl><dt>案件编号</dt><dd>{{ active.id }}</dd><dt>核查人员</dt><dd>{{ active.assignee }}</dd><dt>核查结果</dt><dd>问题属实</dd><dt>整改结果</dt><dd><select v-model="result"><option>整改完成</option><option>部分整改</option><option>未整改</option></select></dd></dl>
        <label>复核意见<textarea v-model="conclusion"></textarea></label>
      </div>
      <div class="panel workflow">
        <div class="panel-title">历史流程</div>
        <div v-for="item in reviewWorkflow" :key="item.time" class="flow-row"><i></i><div><b>{{ item.name }}</b><small>{{ item.time }} · {{ item.operator }}</small></div></div>
      </div>
      <div class="panel logs">
        <div class="panel-title">操作日志</div>
        <div v-for="item in operationLogs" :key="item.time" class="log-row"><time>{{ item.time }}</time><span>{{ item.operator }}</span><b>{{ item.action }}</b></div>
      </div>
    </aside>

    <footer class="action-bar panel"><span>{{ feedback || '复核通过后可确认归档并导出完整案卷' }}</span><button @click="act('退回补充')">退回补充</button><button @click="act('复核通过')">复核通过</button><button class="primary" @click="act('确认归档')">确认归档</button><button @click="act('导出档案')">导出档案</button></footer>
  </div>
</template>

<style scoped lang="scss">
.review-page{height:100%;min-height:0;display:grid;grid-template-columns:280px 1fr 330px;grid-template-rows:1fr 54px;gap:8px;padding:8px;background:#e8eef3;color:#29475a}.panel{min-height:0;overflow:hidden;background:#fff;border:1px solid #d5e0e8;border-radius:6px;box-shadow:0 2px 8px #1c3b5210}.panel-title{height:36px;display:flex;align-items:center;justify-content:space-between;padding:0 11px;border-bottom:1px solid #e6eef3;color:#1f3d52;font-size:13px;font-weight:700}.panel-title small{color:#7a8f9e;font-weight:500}
.case-list{overflow:auto}.tabs{height:42px;display:grid;grid-template-columns:repeat(3,1fr);border-bottom:1px solid #dce7ed}.tabs button{border:0;background:#f4f8fa;color:#637b8b;font-size:10px;cursor:pointer}.tabs button.active{color:#1585b4;background:#fff;border-bottom:2px solid #1585b4}.tabs small{padding:1px 4px;background:#dfeaf0;border-radius:8px}.case-row{width:100%;display:flex;gap:9px;padding:12px 10px;border:0;border-bottom:1px solid #edf2f5;background:#fff;text-align:left;cursor:pointer}.case-row.active{background:#eaf6fc;border-left:3px solid #168db7}.case-row>i{width:34px;height:34px;display:grid;place-items:center;flex:none;color:#fff;background:#168db7;border-radius:4px;font-style:normal}.case-row b,.case-row small,.case-row em{display:block}.case-row b{font-size:11px}.case-row small{margin-top:4px;color:#708695;font-size:9px}.case-row em{margin-top:4px;color:#9a7b44;font-style:normal;font-size:9px}.empty{padding:50px 10px;color:#8999a4;text-align:center}
.center-col{min-height:0;display:grid;grid-template-rows:1fr auto;gap:8px}.compare-panel{display:flex;flex-direction:column}.compare-view{position:relative;flex:1;min-height:240px;margin:10px 10px 4px;overflow:hidden;background:linear-gradient(145deg,#856b43,#4e6d42)}.before,.after{position:absolute;inset:0;display:flex;align-items:flex-end;padding:10px;box-sizing:border-box;background:linear-gradient(#0001,#0008),repeating-linear-gradient(135deg,#795f3c 0 24px,#8f7448 24px 48px)}.after{right:auto;overflow:hidden;background:linear-gradient(#0001,#0008),repeating-linear-gradient(135deg,#32613d 0 24px,#47784b 24px 48px)}.before span,.after span{color:#fff;white-space:nowrap;font-size:11px}.compare-view>i{position:absolute;top:0;bottom:0;width:3px;background:#fff;box-shadow:0 0 8px #000}.compare-panel>input{margin:0 10px}.image-strip{display:flex;gap:6px;align-items:center;padding:6px 10px 10px}.image-strip button{padding:6px 8px;color:#587184;background:#f3f7f9;border:1px solid #d3e1e8}.image-strip button.active{color:#fff;background:#168db7}.image-strip p{flex:1;margin:0 0 0 8px;color:#6e8190;font-size:10px}
table{width:100%;border-collapse:collapse;font-size:10px}th,td{padding:7px 9px;border-bottom:1px solid #edf2f5;text-align:left}th{color:#668090;background:#f5f8fa}td em{color:#1a9a63;font-style:normal}td em.pending{color:#ca871a}td button{color:#1684b0;border:0;background:transparent;cursor:pointer}
.right-col{min-height:0;display:grid;grid-template-rows:auto 1fr auto;gap:8px}.result-panel dl{display:grid;grid-template-columns:78px 1fr;margin:0;padding:7px 11px}.result-panel dt,.result-panel dd{margin:0;padding:6px 0;border-bottom:1px solid #edf2f5;font-size:10px}.result-panel dt{color:#7c8e9a}.result-panel dd{text-align:right;font-weight:600}.result-panel select{height:25px;border:1px solid #ccdce6}.result-panel label{display:grid;gap:5px;padding:0 11px 11px;color:#708592;font-size:10px}.result-panel textarea{height:64px;padding:7px;border:1px solid #ccdce6;resize:none}.workflow{overflow:auto}.flow-row{display:grid;grid-template-columns:12px 1fr;gap:7px;margin-left:15px;padding:8px 10px;border-left:1px solid #cddde7}.flow-row i{width:7px;height:7px;margin-left:-14px;border-radius:50%;background:#17a7bd}.flow-row b,.flow-row small{display:block;font-size:10px}.flow-row small{margin-top:3px;color:#8496a3}.log-row{display:grid;grid-template-columns:58px 42px 1fr;gap:6px;padding:7px 10px;border-bottom:1px solid #edf2f5;font-size:9px}.log-row time,.log-row span{color:#80939f}.log-row b{font-weight:500}
.action-bar{grid-column:1/-1;display:flex;align-items:center;justify-content:flex-end;gap:8px;padding:8px 12px}.action-bar span{margin-right:auto;color:#66808f;font-size:11px}.action-bar button{height:34px;padding:0 16px;color:#426174;background:#fff;border:1px solid #c8d9e4;border-radius:4px;cursor:pointer}.action-bar button.primary{color:#fff;background:#168bd2;border-color:#168bd2}
</style>
