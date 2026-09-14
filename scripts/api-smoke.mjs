import crypto from 'node:crypto'

const baseUrl = process.env.SMOKE_BASE_URL || 'http://223.2.38.27:8080'
const username = process.env.SMOKE_USER || 'admin'
const password = process.env.SMOKE_PASS
if (!password) {
  console.error('缺少 SMOKE_PASS。PowerShell: $env:SMOKE_PASS="密码"; npm run smoke:api')
  process.exit(2)
}

const BIG_INT = /(:\s*)(-?\d{16,})(\s*[,}])/g
const safeParse = (text) => JSON.parse(text.replace(BIG_INT, '$1"$2"$3'))
const pem = (key) => `-----BEGIN PUBLIC KEY-----\n${key.match(/.{1,64}/g).join('\n')}\n-----END PUBLIC KEY-----`

async function post(path, body = {}, token) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })
  const text = await response.text()
  return { http: response.status, payload: text ? safeParse(text) : null }
}

function assertSuccess(name, result) {
  const ok = result.http === 200 && result.payload?.code === '0'
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} HTTP=${result.http} code=${result.payload?.code} ${result.payload?.msg || ''}`)
  if (!ok) throw new Error(`${name} failed`)
  return result.payload.data
}

async function main() {
  const key = assertSuccess('login/public-key', await post('/api/v1/user/login/public-key'))
  const encrypted = crypto.publicEncrypt(
    { key: pem(key.publicKey), padding: crypto.constants.RSA_PKCS1_PADDING },
    Buffer.from(password, 'utf8'),
  ).toString('base64')
  const login = assertSuccess('user/login', await post('/api/v1/user/login', {
    username,
    password: encrypted,
    keyId: key.keyId,
    loginType: 'PASSWORD',
  }))
  const token = login.accessToken

  const simple = [
    ['user/info', '/api/v1/user/info'],
    ['user/dept/list', '/api/v1/user/dept/list'],
    ['dept/list', '/api/v1/dept/list'],
    ['dept/options', '/api/v1/dept/options'],
    ['flight-task/progressing', '/api/v1/uav/flight-task/progressing'],
    ['project/options', '/api/v1/uav/project/options'],
    ['statistics/overview', '/api/v1/uav/statistics/overview'],
    ['statistics/flight-summary', '/api/v1/uav/statistics/flight-summary'],
    ['statistics/device-summary', '/api/v1/uav/statistics/device-summary'],
    ['statistics/media-summary', '/api/v1/uav/statistics/media-summary'],
    ['statistics/count-by-dept', '/api/v1/uav/statistics/count-by-dept'],
  ]
  for (const [name, path] of simple) assertSuccess(name, await post(path, {}, token))

  const resources = [
    ['wayline', '/api/v1/uav/wayline/page', '/api/v1/uav/wayline/detail'],
    ['flight-plan', '/api/v1/uav/flight-plan/page', '/api/v1/uav/flight-plan/detail'],
    ['flight-task', '/api/v1/uav/flight-task/page', '/api/v1/uav/flight-task/detail'],
    ['project', '/api/v1/uav/project/page', '/api/v1/uav/project/detail'],
  ]
  let flightTask
  for (const [name, pagePath, detailPath] of resources) {
    const page = assertSuccess(`${name}/page`, await post(pagePath, { pageNum: 1, pageSize: 5 }, token))
    const first = page.records?.[0]
    if (first) {
      assertSuccess(`${name}/detail`, await post(detailPath, { id: first.id }, token))
      if (name === 'flight-task') flightTask = first
    }
  }

  const devices = assertSuccess('device/page', await post('/api/v1/uav/device/page', { pageNum: 1, pageSize: 5 }, token))
  const device = devices.records?.[0]
  if (device) {
    for (const path of ['detail', 'state', 'statistics']) {
      assertSuccess(`device/${path}`, await post(`/api/v1/uav/device/${path}`, { sn: device.sn }, token))
    }
    assertSuccess('device/hms/page', await post('/api/v1/uav/device/hms/page', { pageNum: 1, pageSize: 5, sn: device.sn }, token))
    assertSuccess('live/share-code', await post('/api/v1/uav/live/share-code', { sn: device.sn }, token))
  }
  if (flightTask) {
    assertSuccess('flight-task/trace', await post('/api/v1/uav/flight-task/trace', { id: flightTask.id }, token))
    assertSuccess('flight-task/media/page', await post('/api/v1/uav/flight-task/media/page', { pageNum: 1, pageSize: 5, taskId: flightTask.id }, token))
  }
  console.log('只读冒烟测试完成；未调用 sync、新增、修改、删除、清理或飞控接口。')
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
