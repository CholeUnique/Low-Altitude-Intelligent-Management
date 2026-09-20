/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TIANDITU_TOKEN?: string
  readonly VITE_USE_MOCK?: string
  readonly VITE_API_BASE_URL?: string
  readonly VITE_DOM_XYZ_TILE_URL?: string
  readonly VITE_DAS_FLY_EMBED?: string
  /** 低空大师直播组件地址；分享码将以 share_code 查询参数传入。 */
  readonly VITE_DAS_FLY_LIVE_EMBED_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
