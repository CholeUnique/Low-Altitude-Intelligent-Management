import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
const m={exports:{}}
new Function('module','exports',ts.transpileModule(readFileSync('src/utils/region-clip-hit.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(m,m.exports)
export const {regionClipGeometryHit:hit}=m.exports
const project=([x,y])=>({x:x*100,y:y*100}),outer=[[0,0],[10,0],[10,10],[0,10],[0,0]],hole=[[3,3],[7,3],[7,7],[3,7],[3,3]]
const polygon={type:'Polygon',coordinates:[outer,hole]},before=JSON.stringify(polygon)
assert(hit(polygon,[1,1],project),'Outlined polygons remain selectable by their interior')
assert(!hit(polygon,[5,5],project),'A hole is not part of the clipped feature')
assert(!hit(polygon,[11,5],project),'Outside points do not select an unclipped source feature')
assert(hit(polygon,[0,5],project));assert(hit(polygon,[3,5],project))
assert(hit({type:'MultiPolygon',coordinates:[polygon.coordinates,[[[20,0],[21,0],[21,1],[20,0]]]]},[20.8,.2],project))
assert(hit({type:'Point',coordinates:[1,1]},[1.05,1],project));assert(!hit({type:'Point',coordinates:[1,1]},[1.07,1],project))
assert(hit({type:'LineString',coordinates:[[0,0],[10,0]]},[5,.05],project));assert(!hit({type:'LineString',coordinates:[[0,0],[10,0]]},[11,0],project))
assert(hit({type:'MultiLineString',coordinates:[[[0,0],[10,0]],[[20,0],[20,10]]]},[20.05,5],project))
assert.equal(JSON.stringify(polygon),before)
console.log('Clipped feature hit detection: boundary-mode polygon interiors, holes, edges, multipart geometry and pixel tolerance passed')
