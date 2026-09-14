import { createSceneWorkspaceConfig } from './common'

export const existingIllegalLandRectificationConfig = createSceneWorkspaceConfig(
  'existing-illegal-land-rectification',
  '全程监测存量违法违规用地整改',
  [
    { key: 'rectification-monitoring', name: '整改监测', shortName: '整改监测', description: '持续监测存量违法用地整改状态' },
    { key: 'rectification-comparison', name: '效果对比', shortName: '效果对比', description: '对比整改前后影像与范围变化' },
    { key: 'rectification-review', name: '复核确认', shortName: '复核确认', description: '复核整改真实性和完成质量' },
    { key: 'rectification-closeout', name: '整改销号', shortName: '整改销号', description: '形成整改结论并闭环销号' },
  ],
)
