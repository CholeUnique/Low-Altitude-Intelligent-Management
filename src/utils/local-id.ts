let sequence=0

/** 本机图层/结果标识，不作为凭证。普通 HTTP 页面可能没有 randomUUID。 */
export function createLocalId():string {
  const provider=globalThis.crypto
  if(typeof provider?.randomUUID==='function')return provider.randomUUID()
  if(typeof provider?.getRandomValues==='function'){
    const bytes=provider.getRandomValues(new Uint8Array(16))
    bytes[6]=(bytes[6]!&15)|64;bytes[8]=(bytes[8]!&63)|128
    const hex=Array.from(bytes,value=>value.toString(16).padStart(2,'0')).join('')
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`
  }
  return `${Date.now().toString(36)}-${(++sequence).toString(36)}-${Math.random().toString(36).slice(2)}`
}
