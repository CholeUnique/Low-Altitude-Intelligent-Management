import fs from 'node:fs';
import path from 'node:path';

const dir = 'd:/test111/Low-Altitude-Intelligent-Management/dist/assets';
const out = [];
for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.js'))) {
  const s = fs.readFileSync(path.join(dir, f), 'utf8');
  if (!s.includes('/v1/biz/facility/qrcode/content')) continue;
  out.push('FILE ' + f + ' size=' + s.length);
  for (const k of ['/v1/biz/facility/qrcode/content', 'responseType', 'app-switch', '正在生成二维码', 'baidumap://map/direction']) {
    out.push('  ' + k.padEnd(40) + s.includes(k));
  }
}
const total = fs.readdirSync(dir).filter(x => x.endsWith('.js'))
  .reduce((n, f) => n + fs.statSync(path.join(dir, f)).size, 0);
out.push('\nJS total bytes: ' + total);
fs.writeFileSync('d:/test111/Low-Altitude-Intelligent-Management/.workbuddy/vq.txt', out.join('\n'), 'utf8');
