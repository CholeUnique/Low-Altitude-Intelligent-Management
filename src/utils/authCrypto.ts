import JSEncrypt from 'jsencrypt'

function toPem(base64Key: string) {
  const body = base64Key.match(/.{1,64}/g)?.join('\n') ?? base64Key
  return `-----BEGIN PUBLIC KEY-----\n${body}\n-----END PUBLIC KEY-----`
}

/** 后端实测仅 PKCS#1 v1.5 可成功解密；JSEncrypt 默认使用该填充。 */
export function encryptLoginPassword(password: string, publicKey: string) {
  const encryptor = new JSEncrypt()
  encryptor.setPublicKey(toPem(publicKey))
  const encrypted = encryptor.encrypt(password)
  if (!encrypted) throw new Error('密码加密失败，请刷新公钥后重试')
  return encrypted
}
