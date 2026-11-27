import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {loadConfigFromFile,loadEnv} from 'vite'
import ts from 'typescript'

const frontend='http://58.213.29.196:38081',backend='http://58.213.29.196:38080'
for(const mode of ['development','production']){
  const env=loadEnv(mode,process.cwd(),'')
  const {config}=await loadConfigFromFile({command:mode==='production'?'build':'serve',mode})
  assert.equal(env.VITE_API_BASE_URL,'/api','Browser business requests remain on the frontend origin')
  assert.equal(env.VITE_PUBLIC_APP_URL,frontend)
  const target=mode==='development'?'http://223.2.41.169:8080':backend
  assert.equal(config.server.proxy['/api'].target,target)
  assert.equal(config.preview.proxy['/api'].target,target)
  assert.equal(config.preview.port,38081)
  assert.equal(config.base,'/')
  const module={exports:{}}
  const settings={VITE_PUBLIC_APP_URL:env.VITE_PUBLIC_APP_URL}
  const source=readFileSync('src/api/facility.ts','utf8').replaceAll('import.meta.env',JSON.stringify(settings))
  new Function('module','exports','require',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(module,module.exports,()=>({apiClient:{}}))
  for(const origin of ['http://localhost:5173','http://127.0.0.1:38081','https://another.example']){
    globalThis.window={location:{origin}}
    assert.equal(module.exports.resolveFacilityReportUrl(),`${frontend}/facility-report`,'QR links use the configured public frontend, never the local preview or backend port')
  }
  delete globalThis.window
}
console.log('Deployment: development/production API targets, preview proxy and canonical QR frontend passed')
