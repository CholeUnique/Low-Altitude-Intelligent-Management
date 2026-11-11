import fs from 'node:fs';
import path from 'node:path';

const dir = 'd:/test111/Low-Altitude-Intelligent-Management/dist/assets';
const out = [];
for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.js') && x.startsWith('LoginView'))) {
  const s = fs.readFileSync(path.join(dir, f), 'utf8');
  out.push('FILE ' + f);
  out.push('  contains "admin" (lowercase quoted): ' + /["']admin["']/.test(s));
  const m = s.match(/[^;]{0,40}请输入账号[^;]{0,20}/);
  out.push('  context: ' + (m ? m[0] : 'n/a'));
}
fs.writeFileSync('d:/test111/Low-Altitude-Intelligent-Management/.workbuddy/vlogin.txt', out.join('\n'), 'utf8');
