import fs from 'node:fs';
import path from 'node:path';

const dir = 'd:/test111/Low-Altitude-Intelligent-Management/dist/assets';
const out = [];
for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.js'))) {
  const s = fs.readFileSync(path.join(dir, f), 'utf8');
  if (!s.includes('baidumap://map/direction')) continue;
  out.push('FILE ' + f);
  for (const k of ['app-switch', '正在生成二维码', '二维码暂不可用', 'getContentQrcode', 'qrcode/content']) {
    out.push('  ' + k.padEnd(24) + s.includes(k));
  }
}
fs.writeFileSync('d:/test111/Low-Altitude-Intelligent-Management/.workbuddy/vq2.txt', out.join('\n'), 'utf8');
