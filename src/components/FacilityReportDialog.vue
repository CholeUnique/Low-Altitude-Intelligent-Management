<script setup lang="ts">
import { ref } from 'vue'
import { reportFacilityIssue, type FacilityRecord, type FacilityReportResult } from '@/api/facility'

const props = defineProps<{ record: FacilityRecord; deptId?: string }>()
const emit = defineEmits<{ close: []; reported: [FacilityReportResult] }>()

const content = ref('')
const reporterName = ref('')
const reporterPhone = ref('')
const busy = ref(false)
const error = ref('')
const result = ref<FacilityReportResult>()

async function submit() {
  if (busy.value) return
  const text = content.value.trim()
  if (!text) { error.value = '请填写问题描述'; return }
  if (text.length > 1000) { error.value = '问题描述不能超过 1000 字'; return }
  busy.value = true
  error.value = ''
  try {
    const payload = await reportFacilityIssue({
      facilityId: props.record.id,
      reportContent: text,
      ...(reporterName.value.trim() ? { reporterName: reporterName.value.trim() } : {}),
      ...(reporterPhone.value.trim() ? { reporterPhone: reporterPhone.value.trim() } : {}),
    })
    result.value = payload
    emit('reported', payload)
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '问题上报失败，请稍后重试'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="backdrop" @click.self="!busy && emit('close')">
    <section class="dialog" role="dialog" aria-modal="true" aria-labelledby="report-facility-title">
      <header>
        <div>
          <h2 id="report-facility-title">设施问题上报</h2>
          <p>{{ record.name || record.facilityNo || '未命名设施' }}{{ record.regionName ? ` · ${record.regionName}` : '' }}</p>
        </div>
        <button type="button" :disabled="busy" aria-label="关闭" @click="emit('close')">×</button>
      </header>

      <div v-if="result" class="result" role="status">
        <strong>上报成功，系统已生成核查任务</strong>
        <dl>
          <div><dt>任务编号</dt><dd>{{ result.taskNo || result.taskId || '—' }}</dd></div>
          <div><dt>设施最新状态</dt><dd class="status">{{ result.facilityBizStatusName || result.facilityBizStatus || '异常' }}</dd></div>
        </dl>
        <p>任务已进入任务中心，可在「任务中心 / 我的待办」中跟进处置进度。</p>
        <footer><button type="button" class="primary" @click="emit('close')">完成</button></footer>
      </div>

      <form v-else @submit.prevent="submit">
        <div class="fields">
          <label class="wide">问题描述 <b>*</b>
            <textarea v-model="content" :disabled="busy" maxlength="1000" rows="4" placeholder="请描述发现的问题，例如：泵站外墙开裂、闸门无法启闭…" />
            <span class="counter">{{ content.trim().length }} / 1000</span>
          </label>
          <label>上报人<input v-model.trim="reporterName" :disabled="busy" maxlength="50" placeholder="选填" /></label>
          <label>联系电话<input v-model.trim="reporterPhone" :disabled="busy" maxlength="32" placeholder="选填" /></label>
        </div>
        <p v-if="error" class="error" role="alert">{{ error }}</p>
        <p class="hint">提交后系统会自动创建核查任务并触发处置流程，该设施状态将变为「异常」。</p>
        <footer>
          <button type="button" :disabled="busy" @click="emit('close')">取消</button>
          <button type="submit" class="primary" :disabled="busy">{{ busy ? '正在上报…' : '确认上报' }}</button>
        </footer>
      </form>
    </section>
  </div>
</template>

<style scoped>
.backdrop{position:fixed;z-index:1000;inset:0;display:grid;place-items:center;padding:24px;background:#00131bbd}
.dialog{width:min(560px,96vw);max-height:calc(100vh - 48px);overflow:auto;border:1px solid #3f8297;border-radius:8px;background:#103445;color:#d9eff3;box-shadow:0 20px 58px #000a}
.dialog header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:18px 22px;border-bottom:1px solid #315e6e}
.dialog h2{margin:0;font-size:19px}
.dialog header p{margin:7px 0 0;color:#8db6c1;font-size:13px}
.dialog header>button{border:0;background:transparent;color:#cfeaf0;font-size:26px;line-height:1;cursor:pointer}
.fields{display:grid;grid-template-columns:1fr 1fr;gap:14px;padding:18px 22px 4px}
.fields label{display:grid;gap:7px;color:#a9ccd6;font-size:12px}
.fields label.wide{grid-column:1 / -1;position:relative}
.fields b{color:#ff9e78}
.fields input,.fields textarea{width:100%;box-sizing:border-box;padding:9px 11px;border:1px solid #35687a;border-radius:4px;background:#0a2634;color:#e6f7fb;font:inherit;font-size:13px}
.fields textarea{resize:vertical;min-height:96px;line-height:1.6}
.fields input:focus,.fields textarea:focus{outline:2px solid #2ba6c4;outline-offset:1px}
.counter{position:absolute;right:2px;bottom:-16px;color:#7597a5;font-size:11px}
.error{margin:16px 22px 0;padding:8px 11px;border:1px solid #8a4d48;border-radius:4px;background:#482d31;color:#ffb6ad;font-size:12px}
.hint{margin:22px 22px 0;color:#7fa2b1;font-size:12px;line-height:1.6}
.dialog footer{display:flex;justify-content:flex-end;gap:10px;padding:16px 22px 20px}
.dialog footer button{min-width:88px;padding:9px 16px;border:1px solid #3a7386;border-radius:4px;background:#123a4c;color:#d7eef4;font:inherit;font-size:13px;cursor:pointer}
.dialog footer button.primary{border-color:#1f9dbc;background:linear-gradient(135deg,#12789c,#1aa4bd);color:#f2fdff}
.dialog footer button:disabled{opacity:.6;cursor:default}
.result{padding:20px 22px 0;display:grid;gap:14px}
.result>strong{color:#6ff0bd;font-size:15px}
.result dl{margin:0;display:grid;gap:10px;padding:14px;border:1px solid #2b6274;border-radius:6px;background:#0c2c3c}
.result dl div{display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:13px}
.result dt{color:#8db6c1}
.result dd{margin:0;color:#eaf8ff;font-weight:600;word-break:break-all}
.result dd.status{color:#ffb0a0}
.result p{margin:0;color:#7fa2b1;font-size:12px;line-height:1.6}
</style>
