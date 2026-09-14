import { createSceneWorkspaceConfig } from './common'

export const pondInspectionConfig = createSceneWorkspaceConfig(
  'pond-archive',
  '塘口全域巡检与“一塘一档”数字建档',
  [
    { key: 'pond-information-collection', name: '塘口信息采集', shortName: '信息采集', description: '采集塘口位置、范围与现场影像' },
    { key: 'pond-file-verification', name: '档案核验', shortName: '档案核验', description: '核验塘口信息与既有档案一致性' },
    { key: 'pond-file-establishment', name: '一塘一档建档', shortName: '一塘一档', description: '按塘口建立标准化电子档案' },
    { key: 'pond-update-archive', name: '更新归档', shortName: '更新归档', description: '更新巡检成果并归集档案材料' },
  ],
)
