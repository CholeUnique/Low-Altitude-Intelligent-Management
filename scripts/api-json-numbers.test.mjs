import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
const source=readFileSync('src/api/client.ts','utf8')
const snippet=source.slice(source.indexOf('const LONG_INTEGER_HINT'),source.indexOf('export class ApiBusinessError'))
const module={exports:{}}
new Function('module','exports',ts.transpileModule(snippet,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(module,module.exports)
const parse=module.exports.parseJsonWithSafeIntegers
const text='{"sourceObjectId":1234567890123456789,"negativeId":-1234567890123456789,"coordinates":[119.123456789012345678,32.123456789012345678,-119.000000000000000001],"exponent":1.234567890123456789e-10,"largeExponent":1234567890123456789e+4,"zero":0,"integer":12}'
const result=parse(text),normal=JSON.parse(text)
assert.equal(result.sourceObjectId,'1234567890123456789')
assert.equal(result.negativeId,'-1234567890123456789')
assert.deepEqual(result.coordinates,normal.coordinates,'长小数经纬度保持 JSON 数值，不对小数部分加引号')
assert.equal(result.exponent,normal.exponent)
assert.equal(result.largeExponent,normal.largeExponent)
assert.equal(result.zero,0);assert.equal(result.integer,12)
const nested=JSON.stringify({detailJson:'{"userId": 1234567890123456789}',TBBH:'00001234567890123456',quote:'转义\\"1234567890123456789'})
assert.deepEqual(parse(nested),JSON.parse(nested),'字符串、内嵌 JSON 和前导零编码保持原样')
assert.throws(()=>parse('{"bad":1234567890123456789e}'),SyntaxError)
assert.throws(()=>parse('{"bad":001234567890123456789}'),SyntaxError)
console.log('API JSON numbers: int64 preservation, long decimal coordinates, signed/exponent numbers, embedded JSON and strings passed')
