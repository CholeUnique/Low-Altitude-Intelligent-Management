<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { resolveFacilityReportUrl, getFacilityQrcode, type FacilityRecord } from '@/api/facility'

const props = defineProps<{ record: FacilityRecord; deptId: string }>()
const emit = defineEmits<{ close: [] }>()

const reportUrl = resolveFacilityReportUrl()

const imageUrl = ref('')
const busy = ref(true)
const error = ref('')

async function readBlobError(blob: Blob) {
  try {
    const parsed = JSON.parse(await blob.text()) as { msg?: string; message?: string }
    return parsed.msg || parsed.message || '二维码生成失败'
  } catch { return '二维码生成失败' }
}

async function load() {
  busy.value = true
  error.value = ''
  try {
    const blob = await getFacilityQrcode({ deptId: props.deptId, id: props.record.id })
    if (blob.type.includes('json')) { error.value = await readBlobError(blob); return }
    imageUrl.value = URL.createObjectURL(blob)
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '二维码生成失败'
  } finally {
    busy.value = false
  }
}

function download() {
  if (!imageUrl.value) return
  const link = document.createElement('a')
  link.href = imageUrl.value
  link.download = `设施二维码-${props.record.facilityNo || props.record.id}.png`
  link.click()
}

onMounted(() => void load())
onBeforeUnmount(() => { if (imageUrl.value) URL.revokeObjectURL(imageUrl.value) })
</script>

<template>
  <div class="backdrop" @click.self="emit('close')">
    <section class="dialog" role="dialog" aria-modal="true" aria-labelledby="facility-qrcode-title">
      <header>
        <div>
          <h2 id="facility-qrcode-title">设施二维码</h2>
          <p>{{ record.name || record.facilityNo || '未命名设施' }}{{ record.facilityNo ? ` · ${record.facilityNo}` : '' }}</p>
        </div>
        <button type="button" aria-label="关闭" @click="emit('close')">×</button>
      </header>

      <div class="body">
        <div v-if="busy" class="state">正在生成二维码…</div>
        <div v-else-if="error" class="state error" role="alert">{{ error }}<button type="button" @click="load">重试</button></div>
        <template v-else>
          <div class="qrcode"><img :src="imageUrl" alt="设施二维码" /></div>
          <p class="tip">扫码后可打开移动端问题上报页（签名默认 24 小时内有效），提交的问题会自动生成核查任务。</p>
          <p class="url">上报页地址：{{ reportUrl }}</p>
        </template>
      </div>

      <footer>
        <button type="button" @click="emit('close')">关闭</button>
        <button type="button" class="primary" :disabled="!imageUrl" @click="download">下载图片</button>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.backdrop{position:fixed;z-index:1000;inset:0;display:grid;place-items:center;padding:24px;background:#00131bbd}
.dialog{width:min(420px,94vw);max-height:calc(100vh - 48px);overflow:auto;border:1px solid #3f8297;border-radius:8px;background:#103445;color:#d9eff3;box-shadow:0 20px 58px #000a}
.dialog header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:18px 22px;border-bottom:1px solid #315e6e}
.dialog h2{margin:0;font-size:19px}
.dialog header p{margin:7px 0 0;color:#8db6c1;font-size:13px}
.dialog header>button{border:0;background:transparent;color:#cfeaf0;font-size:26px;line-height:1;cursor:pointer}
.body{padding:20px 22px 4px;display:grid;gap:14px;justify-items:center}
.state{padding:36px 0;color:#8db6c1;font-size:13px;text-align:center}
.state.error{color:#ffb6ad}
.state.error button{margin-left:8px;border:0;background:none;color:#9ce4ed;font:inherit;cursor:pointer}
.qrcode{width:260px;height:260px;display:grid;place-items:center;padding:12px;box-sizing:border-box;border-radius:10px;background:#fff;box-shadow:0 10px 26px #00131f66}
.qrcode img{width:100%;height:100%;object-fit:contain;display:block}
.tip{margin:0;color:#8db6c1;font-size:12px;line-height:1.65;text-align:center}
.url{margin:0;color:#6f93a2;font-size:11px;word-break:break-all;text-align:center}
.dialog footer{display:flex;justify-content:flex-end;gap:10px;padding:16px 22px 20px}
.dialog footer button{min-width:88px;padding:9px 16px;border:1px solid #3a7386;border-radius:4px;background:#123a4c;color:#d7eef4;font:inherit;font-size:13px;cursor:pointer}
.dialog footer button.primary{border-color:#1f9dbc;background:linear-gradient(135deg,#12789c,#1aa4bd);color:#f2fdff}
.dialog footer button:disabled{opacity:.6;cursor:default}
</style>
