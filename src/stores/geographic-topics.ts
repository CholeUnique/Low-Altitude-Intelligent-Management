import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { useUserStore } from './user'
import type { TopicDisplayMode } from '@/utils/topic-renderer'

export const HIGH_STANDARD_TOPIC_ID = 'HIGH_STANDARD_FARMLAND'
export interface GeographicTopic { id: string; name: string; description: string }
export interface TopicLayerPreference { visible?: boolean; mode?: TopicDisplayMode; categoryModes?: Record<string, TopicDisplayMode> }
interface TopicProfile { topics: GeographicTopic[]; preferences: Record<string,Record<string,TopicLayerPreference>> }
const defaultTopic: GeographicTopic = { id:HIGH_STANDARD_TOPIC_ID,name:'高标准农田',description:'展示高标准农田项目、工程设施、耕地与国土调查数据。' }
const emptyProfile = (): TopicProfile => ({topics:[{...defaultTopic}],preferences:{}})

/** 专题与任务业务场景独立。独立接口上线前，配置只保存到本机、按账号及部门隔离。 */
export const useGeographicTopicsStore = defineStore('geographic-topics', () => {
  const user = useUserStore()
  const storageKey = computed(() => `geographic-topics:v1:${user.currentUser?.id || 'anonymous'}:${user.activeDeptId || user.organizationId}`)
  const profile = ref<TopicProfile>(emptyProfile())
  const storageError = ref('')
  watch(storageKey, key => {
    profile.value = emptyProfile(); storageError.value = ''
    try {
      const stored = JSON.parse(localStorage.getItem(key) || 'null')
      if (!stored || typeof stored !== 'object') return
      const ids = new Set([HIGH_STANDARD_TOPIC_ID]), names = new Set([defaultTopic.name])
      const topics: GeographicTopic[] = [{...defaultTopic}]
      for (const item of Array.isArray(stored.topics) ? stored.topics.slice(0,100) : []) {
        if (typeof item.id !== 'string' || !/^topic-[\w-]+$/.test(item.id) || typeof item.name !== 'string') continue
        const name = item.name.trim()
        if (!name || name.length > 30 || ids.has(item.id) || names.has(name)) continue
        topics.push({id:item.id,name,description:typeof item.description === 'string' ? item.description.slice(0,200) : ''})
        ids.add(item.id); names.add(name)
      }
      const preferences: TopicProfile['preferences'] = {}
      if (stored.preferences && typeof stored.preferences === 'object') {
        for (const topic of topics) {
          const source = stored.preferences[topic.id]
          if (!source || typeof source !== 'object') continue
          const entries: Record<string,TopicLayerPreference> = {}
          for (const [key,value] of Object.entries(source).slice(0,1000)) {
            if (!/^[\w-]+\/(?:\d+|root)$/.test(key) || !value || typeof value !== 'object') continue
            const preference = value as TopicLayerPreference
            entries[key] = {
              ...(typeof preference.visible === 'boolean' ? {visible:preference.visible} : {}),
              ...(preference.mode === 'filled' || preference.mode === 'boundary' ? {mode:preference.mode} : {}),
              ...(preference.categoryModes && typeof preference.categoryModes === 'object' ? {
                categoryModes:Object.fromEntries(Object.entries(preference.categoryModes).slice(0,10000).filter(([,mode]) => mode === 'filled' || mode === 'boundary')),
              } : {}),
            }
          }
          preferences[topic.id] = entries
        }
      }
      profile.value = {topics,preferences}
    } catch { storageError.value = '本机专题配置无法读取，已显示默认专题。' }
  }, {immediate:true})
  function persist() {
    try { localStorage.setItem(storageKey.value,JSON.stringify(profile.value)); storageError.value = '' }
    catch { storageError.value = '当前浏览器无法保存专题配置，本次修改仅在当前页面有效。' }
  }
  function addTopic(name: string, description: string) {
    const title = name.trim()
    if (!title || title.length > 30) throw new Error('请输入 1—30 个字的专题名称。')
    if (profile.value.topics.some(item => item.name === title)) throw new Error('专题名称已存在，请更换名称。')
    const id = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
    const topic = {id:`topic-${id}`,name:title,description:description.trim().slice(0,200)}
    profile.value.topics.push(topic); persist()
    return topic
  }
  function getPreference(topicId: string, layerKey: string) { return profile.value.preferences[topicId]?.[layerKey] }
  function setPreference(topicId: string, layerKey: string, preference: TopicLayerPreference) {
    if (!profile.value.topics.some(item => item.id === topicId)) return
    const entries = profile.value.preferences[topicId] ||= {}
    entries[layerKey] = {...entries[layerKey],...preference}; persist()
  }
  return {topics:computed(() => profile.value.topics),storageError,addTopic,getPreference,setPreference}
})
