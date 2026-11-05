<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { reportFacilityIssue, type FacilityReportResult } from '@/api/facility'

const route = useRoute()
const facilityId = computed(() => String(route.query.facilityId || '').trim())
const ts = computed(() => Number(route.query.ts) || undefined)
const sign = computed(() => String(route.query.sign || '').trim())
/** 二维码签名是匿名上报的凭据，三者缺一不可。 */
const credentialReady = computed(() => Boolean(facilityId.value && ts.value && sign.value))

const content = ref('')
const reporterName = ref('')
const reporterPhone = ref('')
const busy = ref(false)
const error = ref('')
const result = ref<FacilityReportResult>()

const errorHints: Record<string, string> = {
  '10801': '设施不存在，请核对二维码是否为最新版本',
  '10807': '二维码已过期或失效，请联系管理人员重新生成',
  '10810': '该设施已废弃，无需再上报问题',
}

async function submit() {
  if (busy.value || !credentialReady.value) return
  const text = content.value.trim()
  if (!text) { error.value = '请填写问题描述'; return }
  if (text.length > 1000) { error.value = '问题描述不能超过 1000 字'; return }
  busy.value = true
  error.value = ''
  try {
    result.value = await reportFacilityIssue({
      facilityId: facilityId.value,
      reportContent: text,
      ...(reporterName.value.trim() ? { reporterName: reporterName.value.trim() } : {}),
      ...(reporterPhone.value.trim() ? { reporterPhone: reporterPhone.value.trim() } : {}),
      ts: ts.value,
      sign: sign.value,
    })
  } catch (reason) {
    const code = (reason as { code?: string }).code || ''
    error.value = errorHints[code] || (reason instanceof Error ? reason.message : '提交失败，请稍后重试')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="report-page">
    <section class="card">
      <header>
        <span>高标准农田 · 工程设施</span>
        <h1>设施问题上报</h1>
        <p v-if="facilityId">设施编号 #{{ facilityId }}</p>
      </header>

      <div v-if="!credentialReady" class="state invalid" role="alert">
        <strong>二维码无效</strong>
        <p>缺少设施标识或签名参数，请重新扫描现场张贴的设施二维码。</p>
      </div>

      <div v-else-if="result" class="state success" role="status">
        <strong>上报成功</strong>
        <dl>
          <div><dt>工单编号</dt><dd>{{ result.taskNo || result.taskId || '—' }}</dd></div>
          <div><dt>设施当前状态</dt><dd class="warn">{{ result.facilityBizStatusName || result.facilityBizStatus || '异常' }}</dd></div>
        </dl>
        <p>系统已自动创建核查任务，处置人员会跟进处理，请保持电话畅通。</p>
        <button type="button" class="ghost" @click="result = undefined; content = ''">继续上报</button>
      </div>

      <form v-else @submit.prevent="submit">
        <label>问题描述 <b>*</b>
          <textarea v-model="content" maxlength="1000" rows="5" :disabled="busy" placeholder="请描述发现的问题，例如：泵站外墙开裂、闸门无法启闭…" />
          <small>{{ content.trim().length }} / 1000</small>
        </label>
        <label>上报人<input v-model.trim="reporterName" maxlength="50" :disabled="busy" placeholder="选填" /></label>
        <label>联系电话<input v-model.trim="reporterPhone" type="tel" maxlength="32" :disabled="busy" placeholder="选填，便于核查人员联系" /></label>
        <p v-if="error" class="error" role="alert">{{ error }}</p>
        <button type="submit" class="primary" :disabled="busy">{{ busy ? '正在提交…' : '提交上报' }}</button>
        <p class="tip">提交后设施状态将转为「异常」，并自动生成核查任务。</p>
      </form>
    </section>
  </div>
</template>

<style scoped>
.report-page{height:100%;min-height:100%;overflow-y:auto;box-sizing:border-box;padding:20px 16px 32px;background:radial-gradient(circle at 20% 0,#12394d 0,transparent 46%),#081c2b;color:#d7edf3}
.card{width:100%;max-width:520px;margin:0 auto;padding:22px 18px 24px;box-sizing:border-box;border:1px solid rgba(105,182,217,.22);border-radius:14px;background:linear-gradient(135deg,rgba(8,37,58,.85),rgba(5,24,41,.75));box-shadow:0 16px 40px #00101d66}
header{display:grid;gap:6px;padding-bottom:16px;border-bottom:1px solid #1e4d62}
header span{color:#7fb3c6;font-size:11px;letter-spacing:1px}
header h1{margin:0;font-size:20px;color:#eaf8ff}
header p{margin:0;color:#7fa2b1;font-size:12px}
form{display:grid;gap:14px;padding-top:16px}
label{display:grid;gap:7px;color:#a9ccd6;font-size:13px;position:relative}
label b{color:#ff9e78}
label small{position:absolute;right:2px;bottom:-14px;color:#6f93a2;font-size:11px}
textarea,input{width:100%;box-sizing:border-box;padding:11px 12px;border:1px solid #35687a;border-radius:8px;background:#0a2634;color:#e6f7fb;font:inherit;font-size:15px}
textarea{resize:vertical;min-height:118px;line-height:1.6}
textarea:focus,input:focus{outline:2px solid #2ba6c4;outline-offset:1px}
.primary{margin-top:6px;padding:14px;border:0;border-radius:10px;background:linear-gradient(135deg,#12789c,#1aa4bd);color:#f2fdff;font:inherit;font-size:16px;font-weight:600;cursor:pointer}
.primary:disabled{opacity:.6}
.tip{margin:0;color:#7fa2b1;font-size:12px;line-height:1.6;text-align:center}
.error{margin:0;padding:9px 11px;border:1px solid #8a4d48;border-radius:8px;background:#482d31;color:#ffb6ad;font-size:13px}
.state{display:grid;gap:12px;padding-top:18px;font-size:14px}
.state strong{font-size:17px}
.state.invalid strong{color:#ffb6ad}
.state.success strong{color:#6ff0bd}
.state p{margin:0;color:#8fb0c2;font-size:13px;line-height:1.7}
.state dl{margin:0;display:grid;gap:10px;padding:14px;border:1px solid #2b6274;border-radius:10px;background:#0c2c3c}
.state dl div{display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:14px}
.state dt{color:#8db6c1}
.state dd{margin:0;color:#eaf8ff;font-weight:600;word-break:break-all}
.state dd.warn{color:#ffb0a0}
.ghost{padding:12px;border:1px solid #3a7386;border-radius:10px;background:#123a4c;color:#d7eef4;font:inherit;font-size:15px;cursor:pointer}
</style>
