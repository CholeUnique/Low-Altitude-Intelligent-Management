declare module '@terraformer/arcgis' {
  export function geojsonToArcGIS(value:GeoJSON.Geometry):object
  export function arcgisToGeoJSON(value:object,idAttribute?:string):GeoJSON.Feature
}
