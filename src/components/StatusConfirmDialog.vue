<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'

const props = defineProps<{
  open: boolean
  action: 'enable' | 'disable'
  subject: string
  target: string
  description: string
  disableLabel?: string
  busy?: boolean
}>()

const emit = defineEmits<{ cancel: []; confirm: [] }>()
const cancelButton = ref<HTMLButtonElement | null>(null)

watch(() => props.open, async (open) => {
  if (open) {
    await nextTick()
    cancelButton.value?.focus()
  }
})

function cancel() {
  if (!props.busy) emit('cancel')
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="status-dialog-mask" @mousedown.self="cancel">
      <section class="status-dialog" :class="`status-dialog--${action}`" role="alertdialog" aria-modal="true" aria-labelledby="status-dialog-title" aria-describedby="status-dialog-description" @keydown.esc.stop="cancel">
        <div class="status-dialog__heading">
          <span class="status-dialog__icon" aria-hidden="true">{{ action === 'enable' ? '✓' : '!' }}</span>
          <div>
            <small>状态变更</small>
            <h2 id="status-dialog-title">确认{{ action === 'enable' ? '启用' : (disableLabel || '停用') }}{{ subject }}？</h2>
          </div>
          <button class="status-dialog__close" type="button" aria-label="关闭弹窗" :disabled="busy" @click="cancel">×</button>
        </div>
        <div class="status-dialog__content">
          <div class="status-dialog__target"><span>{{ subject }}名称</span><strong :title="target">{{ target }}</strong></div>
          <p id="status-dialog-description">{{ description }}</p>
        </div>
        <footer class="status-dialog__actions">
          <button ref="cancelButton" class="status-dialog__cancel" type="button" :disabled="busy" @click="cancel">取消</button>
          <button class="status-dialog__confirm" type="button" :disabled="busy" @click="$emit('confirm')">{{ busy ? '处理中…' : `确认${action === 'enable' ? '启用' : (disableLabel || '停用')}` }}</button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.status-dialog-mask { position: fixed; inset: 0; z-index: 3000; padding: 20px; display: grid; place-items: center; background: #00111cce; backdrop-filter: blur(4px); }
.status-dialog { width: min(460px, 100%); overflow: hidden; color: #dceef5; background: #0b2638; border: 1px solid #28657d; border-radius: 10px; box-shadow: 0 25px 80px #000c, 0 0 0 1px #ffffff08 inset; font-family: "Microsoft YaHei", sans-serif; }
.status-dialog--disable { border-color: #855960; }
.status-dialog__heading { padding: 22px 22px 18px; display: flex; align-items: center; gap: 13px; background: linear-gradient(115deg, #103b50, #0d2b3e); border-bottom: 1px solid #20566d; }
.status-dialog--disable .status-dialog__heading { background: linear-gradient(115deg, #443039, #112c3e); border-bottom-color: #684751; }
.status-dialog__icon { width: 42px; height: 42px; flex: 0 0 42px; display: grid; place-items: center; color: #eaffff; background: #157b96; border: 1px solid #43bdd9; border-radius: 50%; font-size: 22px; font-weight: 700; }
.status-dialog--disable .status-dialog__icon { color: #ffe9e4; background: #884e52; border-color: #d27d80; }
.status-dialog__heading > div { min-width: 0; flex: 1; }
.status-dialog__heading small { display: block; margin-bottom: 5px; color: #88bac9; font-size: 11px; letter-spacing: 1px; }
.status-dialog__heading h2 { margin: 0; color: #f3fbff; font-size: 18px; font-weight: 600; }
.status-dialog__close { width: 28px; height: 28px; align-self: start; color: #8cb5c3; background: transparent; border: 0; border-radius: 4px; font-size: 23px; line-height: 1; cursor: pointer; }
.status-dialog__close:hover { color: #fff; background: #ffffff14; }
.status-dialog__content { padding: 20px 22px 17px; }
.status-dialog__target { min-height: 52px; padding: 10px 13px; display: flex; align-items: center; justify-content: space-between; gap: 14px; background: #081f2e; border: 1px solid #1e536a; border-radius: 5px; box-sizing: border-box; }
.status-dialog__target span { flex: none; color: #82a9b8; font-size: 12px; }
.status-dialog__target strong { min-width: 0; overflow: hidden; color: #e9f8fd; font-size: 14px; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
.status-dialog__content p { margin: 14px 0 0; color: #a4c1cc; font-size: 13px; line-height: 1.65; }
.status-dialog__actions { padding: 15px 22px 20px; display: flex; justify-content: flex-end; gap: 10px; border-top: 1px solid #17475d; }
.status-dialog__actions button { min-width: 92px; min-height: 38px; padding: 0 16px; border-radius: 4px; font-size: 13px; cursor: pointer; }
.status-dialog__cancel { color: #acd1df; background: #0a2738; border: 1px solid #29677f; }
.status-dialog__cancel:hover { color: #fff; border-color: #3aa9d0; }
.status-dialog__confirm { color: #fff; background: linear-gradient(135deg, #137fa7, #16a8c0); border: 1px solid #42cbe9; }
.status-dialog--disable .status-dialog__confirm { background: linear-gradient(135deg, #9f555b, #bd6971); border-color: #d4848b; }
.status-dialog__confirm:hover { filter: brightness(1.1); }
.status-dialog__actions button:disabled, .status-dialog__close:disabled { opacity: .5; cursor: wait; }
@media (max-width: 480px) { .status-dialog-mask { padding: 14px; }.status-dialog__heading { padding: 18px; }.status-dialog__content { padding: 18px; }.status-dialog__actions { padding: 14px 18px 18px; } }
</style>
