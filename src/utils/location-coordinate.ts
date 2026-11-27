import proj4 from 'proj4'

proj4.defs('EPSG:4490','+proj=longlat +ellps=GRS80 +no_defs +type=crs')
/** API GeoJSON remains WGS84; only the coordinate readout is converted to CGCS2000. */
export function cgcs2000Coordinate(longitude:number,latitude:number) {
  if(!Number.isFinite(longitude)||!Number.isFinite(latitude)||Math.abs(longitude)>180||Math.abs(latitude)>90)return undefined
  const [lng,lat]=proj4('EPSG:4326','EPSG:4490',[longitude,latitude])
  return lng!==undefined&&lat!==undefined&&Number.isFinite(lng)&&Number.isFinite(lat)?{lng,lat}:undefined
}
