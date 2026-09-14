import { createSceneWorkspaceConfig } from './common'

export const plantingSubsidyConfig = createSceneWorkspaceConfig(
  'planting-subsidy',
  '种植面积精准核定与惠农补贴监管',
  [
    { key: 'subsidy-planting-identification', name: '种植识别', shortName: '种植识别', description: '识别作物类型与种植地块边界' },
    { key: 'subsidy-area-verification', name: '面积核定', shortName: '面积核定', description: '精准测算并核定申报种植面积' },
    { key: 'subsidy-review', name: '补贴审核', shortName: '补贴审核', description: '审核面积结果与补贴申报信息' },
    { key: 'subsidy-result-archive', name: '结果归档', shortName: '结果归档', description: '归档核定结果与补贴审核材料' },
  ],
)
