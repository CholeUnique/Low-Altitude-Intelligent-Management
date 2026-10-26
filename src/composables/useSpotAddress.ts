import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { getTiandituAddress } from '@/api/geocoding'
import { createTelemetryLocationResolver, type TelemetryLocationState } from '@/utils/telemetry-location'

/**
 * 将当前图斑中心坐标解析为地址。请求带取消和位置缓存，避免切换图斑时旧结果覆盖新结果。
 */
export function useSpotAddress(
  longitude: () => number | undefined,
  latitude: () => number | undefined,
) {
  const token = import.meta.env.VITE_TIANDITU_TOKEN || ''
  const state = ref<TelemetryLocationState>({ status: 'idle', text: '未提供有效坐标' })
  const resolver = createTelemetryLocationResolver(
    (point, signal) => getTiandituAddress(token, point.longitude, point.latitude, signal),
    value => { state.value = value },
    { minIntervalMs: 0 },
  )

  watch([longitude, latitude], ([nextLongitude, nextLatitude]) => {
    if (nextLongitude === undefined || nextLatitude === undefined
      || !Number.isFinite(nextLongitude) || !Number.isFinite(nextLatitude)) {
      resolver.suspend()
      state.value = { status: 'idle', text: '未提供有效坐标' }
      return
    }
    if (!token) {
      resolver.suspend()
      state.value = { status: 'error', text: '未配置位置查询密钥' }
      return
    }
    resolver.update({ longitude: nextLongitude, latitude: nextLatitude })
  }, { immediate: true })

  onBeforeUnmount(() => resolver.dispose())

  return {
    spotAddress: computed(() => state.value.text),
    spotAddressLoading: computed(() => state.value.status === 'loading'),
    spotAddressError: computed(() => state.value.status === 'error'),
  }
}
