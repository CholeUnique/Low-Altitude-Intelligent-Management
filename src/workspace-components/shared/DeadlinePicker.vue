<script setup lang="ts">
import { ref } from 'vue'

const value = defineModel<string>({ default: '' })
defineProps<{ disabled?: boolean; required?: boolean }>()
const visible = ref(false)
const day = ref(new Date())
const time = ref('12:00')

function open() {
  if (visible.value) { visible.value = false; return }
  const current = value.value ? new Date(value.value) : new Date()
  day.value = Number.isFinite(current.getTime()) ? current : new Date()
  time.value = value.value && Number.isFinite(current.getTime())
    ? `${String(current.getHours()).padStart(2, '0')}:${String(current.getMinutes()).padStart(2, '0')}`
    : '12:00'
  visible.value = true
}
function confirm() {
  if (!time.value) return
  const date = day.value
  value.value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${time.value}`
  visible.value = false
}
</script>

<template>
  <el-popover v-model:visible="visible" placement="bottom-start" :width="340" trigger="manual" :disabled="disabled" popper-class="deadline-picker-popover">
    <template #reference>
      <button type="button" class="deadline-trigger" :disabled="disabled" :aria-required="required" aria-label="选择办理期限" @click="open">{{ value ? value.replace('T', ' ') : '选择日期和时间' }} <span aria-hidden="true">▦</span></button>
    </template>
    <el-calendar v-model="day" />
    <label class="deadline-time">时间 <input v-model="time" type="time" /></label>
    <div class="deadline-actions"><button type="button" @click="visible = false">取消</button><button type="button" class="confirm" :disabled="!time" @click="confirm">确定</button></div>
  </el-popover>
</template>

<style scoped>
.deadline-trigger{display:flex;justify-content:space-between;align-items:center;width:100%;padding:8px;border:1px solid #cbdce6;border-radius:4px;background:#fff;color:#29475a;font:inherit;text-align:left;cursor:pointer}.deadline-trigger:disabled{opacity:.6;cursor:not-allowed}.deadline-time{display:flex;align-items:center;gap:10px;margin:8px 0;color:#405e70}.deadline-time input{padding:4px;border:1px solid #cbdce6;border-radius:4px;font:inherit}.deadline-actions{display:flex;justify-content:flex-end;gap:8px}.deadline-actions button{padding:6px 14px;border:1px solid #cbdce6;border-radius:4px;background:#fff;color:#405e70;cursor:pointer}.deadline-actions .confirm{border-color:#168bd2;background:#168bd2;color:#fff}.deadline-actions button:disabled{opacity:.5;cursor:not-allowed}
:deep(.el-calendar__header){padding:8px}:deep(.el-calendar__body){padding:0}:deep(.el-calendar-day){height:32px;padding:4px}
</style>
