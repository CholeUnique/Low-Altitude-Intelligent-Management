import { onBeforeUnmount } from 'vue'
import { ElMessage } from 'element-plus'
import 'element-plus/es/components/message/style/css'

/** 组件授权失败只显示短时浮层，不挤压选择列表或地图区域。 */
export function useComponentFeedback() {
  let message: ReturnType<typeof ElMessage> | undefined
  onBeforeUnmount(() => message?.close())
  return (text: string) => {
    message?.close()
    message = ElMessage({
      type: 'error',
      message: text,
      duration: 3000,
      placement: 'top',
      customClass: 'component-feedback-message',
      offset: 80,
      appendTo: document.fullscreenElement as HTMLElement || document.body,
    })
  }
}
