export interface ProblemSpot {
  id: string
  type: string
  risk: '高' | '中' | '低'
  status: '待研判' | '已确认' | '已排除'
  source: string
  area: number
  confidence: number
  discoveredAt: string
  polygon: [number, number][]
  description: string
}

export const problemSpots: ProblemSpot[] = [
  { id: 'LYTB-2026-0908', type: '毁林开垦', risk: '高', status: '待研判', source: '无人机巡查发现', area: 3.26, confidence: 93.6, discoveredAt: '2026-09-09 10:13', description: '林地表面出现成片裸土及施工车辆痕迹。', polygon: [[119.91,32.47],[119.925,32.48],[119.94,32.468],[119.93,32.455],[119.912,32.458]] },
  { id: 'LYTB-2026-0903', type: '非法侵占林地', risk: '高', status: '已确认', source: '卫片疑似问题', area: 1.84, confidence: 89.2, discoveredAt: '2026-09-08 15:40', description: '疑似新增硬化场地侵占林地。', polygon: [[119.97,32.50],[119.985,32.505],[119.993,32.492],[119.978,32.486]] },
  { id: 'LYTB-2026-0886', type: '违章搭建', risk: '中', status: '待研判', source: 'AI 自动识别', area: 0.62, confidence: 86.7, discoveredAt: '2026-09-07 09:18', description: '林区边缘发现新增蓝顶构筑物。', polygon: [[119.86,32.43],[119.875,32.437],[119.881,32.424],[119.867,32.417]] },
  { id: 'LYTB-2026-0862', type: '林地占用异常', risk: '中', status: '已确认', source: '森林督查图斑', area: 2.15, confidence: 82.4, discoveredAt: '2026-09-05 16:22', description: '批准范围外疑似存在施工扰动。', polygon: [[120.00,32.45],[120.014,32.461],[120.027,32.447],[120.012,32.438]] },
  { id: 'LYTB-2026-0821', type: '卫片疑似问题', risk: '低', status: '已排除', source: '多期变化检测', area: 0.38, confidence: 71.5, discoveredAt: '2026-09-02 11:06', description: '经核验为季节性林下清理。', polygon: [[119.89,32.52],[119.901,32.526],[119.907,32.516],[119.896,32.51]] },
]

export const spotTimeline = [
  { time: '09-09 10:13', name: '无人机影像上传', operator: '巡查任务 FL-0909' },
  { time: '09-09 10:18', name: 'AI 自动识别', operator: '林地变化识别模型 v2.3' },
  { time: '09-09 10:25', name: '多期影像变化检测', operator: '系统自动处理' },
  { time: '09-09 11:02', name: '进入人工研判', operator: '待处理' },
]

export const dispatchRecords = [
  { id: 'XF-2026-0368', spotId: 'LYTB-2026-0862', unit: '九龙镇自然资源所', receiver: '王强', time: '2026-09-08 14:30', status: '已接收' },
  { id: 'XF-2026-0361', spotId: 'LYTB-2026-0814', unit: '城西街道综合执法队', receiver: '李宁', time: '2026-09-06 09:10', status: '核查中' },
  { id: 'XF-2026-0352', spotId: 'LYTB-2026-0798', unit: '苏陈镇林业站', receiver: '赵峰', time: '2026-09-03 16:42', status: '已反馈' },
]

export const reviewCases = [
  { id: 'AJ-2026-0368', title: '九龙镇疑似毁林开垦核查', area: '九龙镇西北林区', status: '待复核', assignee: '王强', updatedAt: '2026-09-12 16:30' },
  { id: 'AJ-2026-0361', title: '城西街道林地侵占整改', area: '城西街道北片区', status: '待归档', assignee: '李宁', updatedAt: '2026-09-11 11:20' },
  { id: 'AJ-2026-0352', title: '苏陈镇违章搭建处置', area: '苏陈镇河东村', status: '已归档', assignee: '赵峰', updatedAt: '2026-09-09 09:45' },
]

export const archiveMaterials = [
  { name: '问题图斑研判报告.pdf', type: '研判材料', size: '2.4 MB', status: '完整' },
  { name: '现场核查记录.pdf', type: '核查材料', size: '1.1 MB', status: '完整' },
  { name: '整改前后影像.zip', type: '影像证据', size: '18.6 MB', status: '完整' },
  { name: '复核意见书.docx', type: '复核材料', size: '326 KB', status: '待生成' },
]

export const reviewWorkflow = [
  { time: '09-09 11:18', name: '问题图斑确认入库', operator: '张明' },
  { time: '09-09 14:30', name: '核查任务下发', operator: '林业执法科' },
  { time: '09-12 15:40', name: '现场核查结果回传', operator: '王强' },
  { time: '09-12 16:30', name: '提交复核', operator: '九龙镇自然资源所' },
]

export const operationLogs = [
  { time: '16:30:12', operator: '王强', action: '上传整改后影像 6 张' },
  { time: '16:28:05', operator: '王强', action: '提交现场核查结果' },
  { time: '10:15:42', operator: '系统', action: '同步无人机复核飞行成果' },
]
