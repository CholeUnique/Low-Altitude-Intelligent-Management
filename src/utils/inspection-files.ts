export const inspectionImageExtensions = ['jpg', 'jpeg', 'png', 'svg', 'webp', 'gif', 'bmp', 'avif', 'tif', 'tiff', 'heic', 'heif']
export const inspectionDocumentExtensions = ['pdf', 'doc', 'docx', 'odt', 'rtf', 'txt', 'xls', 'xlsx', 'ppt', 'pptx']
export const inspectionImageAccept = inspectionImageExtensions.map(ext => `.${ext}`).join(',')
export const inspectionDocumentAccept = inspectionDocumentExtensions.map(ext => `.${ext}`).join(',')
export function isInspectionImage(name: string) {
  return inspectionImageExtensions.includes(name.split('.').pop()?.toLowerCase() || '')
}
export function inspectionFileError(files: Array<{ name: string; size: number }>, photos: boolean) {
  const allowed = photos ? inspectionImageExtensions : inspectionDocumentExtensions
  if (files.some(file => !allowed.includes(file.name.split('.').pop()?.toLowerCase() || ''))) {
    return photos ? '现场图片仅接收图片文件；PDF、Word 等文档请使用“上传附件”。' : '附件仅接收 PDF、Word 等文档；图片请使用“上传现场图片”。'
  }
  if (files.some(file => file.size > 10 * 1024 * 1024)) return '单个文件不能超过 10MB。'
  return ''
}
