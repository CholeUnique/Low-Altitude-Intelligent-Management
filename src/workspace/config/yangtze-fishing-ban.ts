import { createSceneWorkspaceConfig } from './common'

export const yangtzeFishingBanConfig = createSceneWorkspaceConfig(
  'yangtze-fishing-ban',
  '长江禁捕常态化智能执法',
  [
    { key: 'fishing-target-identification', name: '可疑目标识别', shortName: '目标识别', description: '识别船只、网具与可疑捕捞活动' },
    { key: 'fishing-violation-assessment', name: '违法研判', shortName: '违法研判', description: '结合时空信息研判违法嫌疑' },
    { key: 'fishing-enforcement-dispatch', name: '执法下发', shortName: '执法下发', description: '向执法力量下发核查处置任务', component: 'TaskDispatch' },
    { key: 'fishing-evidence-archive', name: '证据归档', shortName: '证据归档', description: '归集现场处置与执法证据链' },
  ],
)
