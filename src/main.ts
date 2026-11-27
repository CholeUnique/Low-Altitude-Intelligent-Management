import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './styles/index.scss'
import './styles/system.scss'
import App from './App.vue'
import router from './router'
import { installMapTownshipLabels } from './utils/map-township-labels'

const pinia = createPinia()
const app = createApp(App).use(pinia).use(router)
installMapTownshipLabels(pinia)
app.mount('#app')
