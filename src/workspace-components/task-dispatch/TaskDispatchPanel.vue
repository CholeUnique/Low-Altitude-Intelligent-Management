<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import type { PortalTask, WorkspaceNodeConfig } from '@/types'
import { dispatchRecords, problemSpots } from '@/mocks/governance'

const props = defineProps<{ task?: PortalTask; sceneName?: string; node?: WorkspaceNodeConfig }>()
const isForestry = computed(() => props.node?.key === 'task-dispatch')
const objectLabel = computed(() => isForestry.value ? '图斑' : '业务对象')
const selected = ref<string[]>([problemSpots.find((item) => item.status === '已确认')?.id || problemSpots[0]!.id])
const preview = ref(false)
const feedback = ref('')
const form = reactive({
  area: props.task?.area || '任务巡查区域',
  unit: '九龙镇自然资源所',
  receiver: '王强',
  deadline: '2026-09-18',
  contact: '张明',
  phone: '138****6812',
  priority: '高',
  requirement: '请现场核实业务对象范围与现状，拍摄全景及细节照片并在期限内反馈。',
})
const selectedSpots = computed(() => problemSpots.filter((item) => selected.value.includes(item.id)))
function action(text: string) { feedback.value = `${text}成功：已选择 ${selected.value.length} 个${objectLabel.value}` }
</script>

<template>
  <div class="dispatch-page">
    <aside class="panel spots">
      <div class="panel-title">待下发{{ objectLabel }} <small>已选 {{ selected.length }}</small></div>
      <label v-for="item in problemSpots.filter(s => s.status === '已确认')" :key="item.id" class="spot-row">
        <input v-model="selected" type="checkbox" :value="item.id" />
        <i></i><span><b>{{ item.type }}</b><small>{{ item.id }} · {{ item.area }} ha</small></span>
        <em>{{ item.risk }}</em>
      </label>
      <div class="batch-tip">支持勾选多个已确认{{ objectLabel }}，统一生成{{ node?.name || '核查' }}任务。</div>
    </aside>

    <section class="panel form-panel">
      <div class="panel-title">核查任务编制 <small>{{ task?.name }}</small></div>
      <div class="form-grid">
        <label class="wide">核查区域<input v-model="form.area" /></label>
        <label>接收单位<select v-model="form.unit"><option>九龙镇自然资源所</option><option>城西街道综合执法队</option><option>苏陈镇林业站</option></select></label>
        <label>接收人员<select v-model="form.receiver"><option>王强</option><option>李宁</option><option>赵峰</option></select></label>
        <label>核查期限<input v-model="form.deadline" type="date" /></label>
        <label>优先级<select v-model="form.priority"><option>高</option><option>中</option><option>低</option></select></label>
        <label>联系人<input v-model="form.contact" /></label>
        <label>联系方式<input v-model="form.phone" /></label>
        <label class="wide">核查要求<textarea v-model="form.requirement"></textarea></label>
        <label class="wide upload">附件<input type="file" multiple /><span>＋ 上传任务附件（支持图片、PDF、文档）</span></label>
      </div>
      <div class="selected-summary">
        <b>关联{{ objectLabel }}</b><span v-for="item in selectedSpots" :key="item.id">{{ item.id }} · {{ item.type }}</span>
      </div>
    </section>

    <aside class="right-col">
      <section class="panel preview">
        <div class="panel-title">任务预览</div>
        <dl><dt>任务标题</dt><dd>{{ form.area }}{{ isForestry ? '林业问题核查' : (node?.name || '现场处置') }}</dd><dt>接收对象</dt><dd>{{ form.unit }} / {{ form.receiver }}</dd><dt>期限</dt><dd>{{ form.deadline }}</dd><dt>优先级</dt><dd>{{ form.priority }}</dd><dt>{{ objectLabel }}数量</dt><dd>{{ selected.length }} 个</dd></dl>
        <p v-if="preview">{{ form.requirement }}</p>
      </section>
      <section class="panel records">
        <div class="panel-title">下发记录</div>
        <div v-for="item in dispatchRecords" :key="item.id" class="record"><b>{{ item.id }} · {{ item.status }}</b><span>{{ item.unit }} / {{ item.receiver }}</span><small>{{ item.spotId }} · {{ item.time }}</small></div>
      </section>
    </aside>

    <footer class="action-bar panel">
      <span>{{ feedback || '填写完整后可保存草稿、预览或确认下发' }}</span>
      <button @click="action('保存草稿')">保存草稿</button><button @click="preview = true">预览任务</button>
      <button class="primary" :disabled="!selected.length" @click="action('确认下发')">确认下发</button>
      <button class="primary" :disabled="selected.length < 2" @click="action('批量下发')">批量下发</button>
    </footer>
  </div>
</template>

<style scoped lang="scss">
.dispatch-page{height:100%;min-height:0;display:grid;grid-template-columns:270px 1fr 330px;grid-template-rows:1fr 54px;gap:8px;padding:8px;background:#e8eef3;color:#29475a}.panel{min-height:0;overflow:hidden;background:#fff;border:1px solid #d5e0e8;border-radius:6px;box-shadow:0 2px 8px #1c3b5210}.panel-title{height:36px;display:flex;align-items:center;justify-content:space-between;padding:0 11px;border-bottom:1px solid #e6eef3;color:#1f3d52;font-size:13px;font-weight:700}.panel-title small{color:#7a8f9e;font-weight:500}
.spots{overflow:auto}.spot-row{display:grid;grid-template-columns:18px 46px 1fr 20px;gap:7px;align-items:center;padding:10px;border-bottom:1px solid #edf2f5;cursor:pointer}.spot-row>i{width:46px;height:36px;border-radius:3px;background:linear-gradient(145deg,#426b45,#927d4e)}.spot-row b,.spot-row small{display:block}.spot-row b{font-size:12px}.spot-row small{margin-top:3px;color:#7a8f9e;font-size:9px}.spot-row em{color:#d44646;font-style:normal;font-size:10px}.batch-tip{margin:10px;padding:10px;color:#6e7d42;background:#f6f9e9;border-left:3px solid #9bb43b;font-size:10px;line-height:1.6}
.form-panel{overflow:auto}.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:13px;padding:14px}.form-grid label{display:grid;gap:6px;color:#607788;font-size:11px}.form-grid .wide{grid-column:1/-1}.form-grid input,.form-grid select,.form-grid textarea{box-sizing:border-box;width:100%;padding:0 9px;border:1px solid #ccdce6;border-radius:4px;color:#29475a;background:#fbfdfe}.form-grid input,.form-grid select{height:34px}.form-grid textarea{height:82px;padding-top:8px;resize:vertical}.upload{position:relative}.upload input{position:absolute;opacity:0;pointer-events:none}.upload span{height:42px;display:grid;place-items:center;color:#1985b5;border:1px dashed #87bfd7;border-radius:4px;background:#f4fafc;cursor:pointer}.selected-summary{margin:0 14px 14px;padding:10px;background:#f5f8fa;font-size:10px}.selected-summary b{margin-right:10px}.selected-summary span{display:inline-block;margin:3px;padding:4px 7px;color:#177ca6;background:#e3f3fa;border-radius:3px}
.right-col{min-height:0;display:grid;grid-template-rows:auto 1fr;gap:8px}.preview dl{display:grid;grid-template-columns:82px 1fr;margin:0;padding:9px 12px}.preview dt,.preview dd{margin:0;padding:7px 0;border-bottom:1px solid #edf2f5;font-size:11px}.preview dt{color:#7a8f9e}.preview dd{text-align:right;font-weight:600}.preview p{margin:0 12px 12px;padding:9px;color:#6b7f8c;background:#f5f8fa;font-size:10px;line-height:1.6}.records{overflow:auto}.record{padding:10px 12px;border-bottom:1px solid #edf2f5}.record b,.record span,.record small{display:block;font-size:10px}.record b{color:#187caa}.record span{margin-top:4px}.record small{margin-top:3px;color:#8294a1}
.action-bar{grid-column:1/-1;display:flex;align-items:center;justify-content:flex-end;gap:8px;padding:8px 12px}.action-bar span{margin-right:auto;color:#66808f;font-size:11px}.action-bar button{height:34px;padding:0 16px;color:#426174;background:#fff;border:1px solid #c8d9e4;border-radius:4px;cursor:pointer}.action-bar button.primary{color:#fff;background:#168bd2;border-color:#168bd2}.action-bar button:disabled{opacity:.45;cursor:not-allowed}
</style>
