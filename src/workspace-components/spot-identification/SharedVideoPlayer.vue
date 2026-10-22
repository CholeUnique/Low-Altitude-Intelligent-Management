<script setup lang="ts">
import { defineAsyncComponent, ref, watch } from 'vue'
import type { FlightReviewMedia } from '@/api/flight-review'
import { toggleVideoSurfacePlayback } from '@/utils/video-playback'

const VideoTelemetryOverlay = defineAsyncComponent(() => import('./VideoTelemetryOverlay.vue'))

const props = withDefaults(defineProps<{
  media: FlightReviewMedia
  mediaList: FlightReviewMedia[]
  src: string
  autoplay?: boolean
  fullscreen?: boolean
  collaborationAvailable?: boolean
}>(), { autoplay: false, fullscreen: false, collaborationAvailable: true })
const emit = defineEmits<{ ready: []; error: [] }>()

const videoElement = ref<HTMLVideoElement>()
const playbackStarted = ref(false)
const collaborationVisible = ref(false)
const playbackError = ref('')

// The initial play belongs to the video element, even if the map is opened later.
watch(videoElement, (video, _previous, onCleanup) => {
  playbackStarted.value = !!video && (!video.paused || video.played.length > 0)
  if (!video || playbackStarted.value) return
  const markStarted = () => { playbackStarted.value = true }
  video.addEventListener('play', markStarted, { once: true })
  onCleanup(() => video.removeEventListener('play', markStarted))
}, { flush: 'sync' })
watch(() => props.collaborationAvailable, available => {
  if (!available) collaborationVisible.value = false
})

async function togglePlayback(event: MouseEvent) {
  const video = videoElement.value
  playbackError.value = ''
  try { await toggleVideoSurfacePlayback(event) }
  catch {
    if (video && videoElement.value === video) playbackError.value = '视频暂时无法播放，请使用底部播放按钮重试。'
  }
}
function pause() { videoElement.value?.pause() }
defineExpose({ pause })
</script>

<template>
  <div class="shared-video-player">
    <video ref="videoElement" :src="src" controls controlslist="nofullscreen" :autoplay="autoplay" playsinline preload="auto"
      @loadeddata="emit('ready')" @canplay="emit('ready')" @playing="emit('ready')" @error="emit('error')" @click="togglePlayback" />
    <button v-if="collaborationAvailable" type="button" class="collaboration-toggle" :aria-pressed="collaborationVisible"
      @click.stop="collaborationVisible = !collaborationVisible">⌖ {{ collaborationVisible ? '关闭协同展示' : '协同展示' }}</button>
    <VideoTelemetryOverlay v-if="collaborationAvailable && collaborationVisible && videoElement" :key="`${media.taskId}:${media.id}`"
      :media="media" :media-list="mediaList" :video="videoElement" :playback-started="playbackStarted"
      :fullscreen="fullscreen" @close="collaborationVisible = false" />
    <span v-if="playbackError" class="playback-notice" role="status">{{ playbackError }}</span>
  </div>
</template>

<style scoped>
.shared-video-player { position:absolute; inset:0; width:100%; height:100%; }
.shared-video-player video { display:block; width:100%; height:100%; max-width:none; max-height:none; object-fit:contain; background:#000; cursor:pointer; }
.collaboration-toggle { position:absolute; z-index:3; top:6px; left:6px; padding:8px 12px; border:1px solid #7fdde8aa; border-radius:5px; color:#e6fbff; background:#0c344be6; font-size:12px; font-weight:700; cursor:pointer; }
.collaboration-toggle:hover,.collaboration-toggle[aria-pressed="true"] { background:#147c9d; }
.playback-notice { position:absolute; z-index:3; bottom:72px; left:50%; max-width:calc(100% - 32px); transform:translateX(-50%); padding:8px 12px; border-radius:5px; color:#fff; background:#102d40e8; font-size:13px; pointer-events:none; }
</style>
