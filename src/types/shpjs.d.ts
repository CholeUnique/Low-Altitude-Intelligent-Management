declare module 'shpjs' {
  export function parseShp(data:ArrayBuffer,projection?:string):Array<GeoJSON.Geometry|null>
  export function parseDbf(data:ArrayBuffer,encoding?:string):Record<string,unknown>[]
}
