export interface MapAdapter {
  mount(container: HTMLElement): Promise<void>
  setLayers(layerIds: string[]): void
  fitGeoJSON(geojson: unknown): void
  destroy(): void
}

export interface VideoAdapter {
  mount(container: HTMLElement): Promise<void>
  play(source: string): Promise<void>
  destroy(): void
}

export interface RealtimeAdapter {
  connect(): Promise<void>
  subscribe<T>(event: string, handler: (payload: T) => void): () => void
  disconnect(): void
}

export interface IntegrationAdapter {
  getComponentUrl(component: string): Promise<string>
  sync(resource: string): Promise<void>
}

export type { LiveStream } from './dasFly'

// 正式 GIS、视频、WebSocket 和第三方协议确认后，在此注入具体实现。
export const adapterStatus = {
  map: 'mock',
  video: 'mock',
  realtime: 'reserved',
  integration: 'reserved',
} as const
