/** 天地图逆地理编码：仅发送坐标和地图密钥，不携带业务系统登录信息。 */
export async function getTiandituAddress(token: string, longitude: number, latitude: number, signal?: AbortSignal): Promise<string> {
  if (!token.trim()) throw new Error('未配置位置查询密钥')
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || Math.abs(longitude) > 180 || Math.abs(latitude) > 90) throw new Error('定位坐标无效')
  const url = new URL('https://api.tianditu.gov.cn/geocoder')
  url.searchParams.set('postStr', JSON.stringify({ lon: longitude, lat: latitude, ver: 1 }))
  url.searchParams.set('type', 'geocode')
  url.searchParams.set('tk', token)
  const controller = new AbortController()
  const abort = () => controller.abort()
  if (signal?.aborted) abort()
  signal?.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(abort, 8000)
  try {
    const response = await fetch(url.href, { signal: controller.signal, credentials: 'omit' })
    if (!response.ok) throw new Error('位置服务暂不可用，请检查地图密钥权限')
    const data = await response.json() as { status?: string | number; infocode?: string | number; result?: { formatted_address?: unknown } }
    if ((data.status !== undefined && String(data.status) !== '0') || (data.infocode !== undefined && String(data.infocode) !== '1000')) {
      throw new Error('位置查询未成功，请检查地图密钥的逆地理编码权限')
    }
    const address = data.result?.formatted_address
    if (typeof address !== 'string' || !address.trim()) throw new Error('该坐标暂无可用的具体地址')
    return address.trim().slice(0, 500)
  } catch (reason) {
    if (controller.signal.aborted) throw new Error('位置查询已取消或超时')
    if (reason instanceof TypeError) throw new Error('位置服务无法连接，请检查网络或跨域权限')
    if (reason instanceof SyntaxError) throw new Error('位置服务返回了无效数据')
    throw reason
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abort)
  }
}
