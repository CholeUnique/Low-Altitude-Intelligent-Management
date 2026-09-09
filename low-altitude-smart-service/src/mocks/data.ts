import type { TaskItem, WorkflowEvent } from '@/types'

export const dashboardStats = [
  { label: '在线无人机', value: 48, unit: '台', primary: '总数 62 台', secondary: '在线率 77%', icon: 'drone', tone: 'cyan' },
  { label: '今日任务', value: 126, unit: '个', primary: '已完成 89', secondary: '待处理 9', icon: 'task', tone: 'blue' },
  { label: '待完成任务', value: 37, unit: '个', primary: '超期 5', secondary: '今日新增 12', icon: 'pending', tone: 'indigo' },
  { label: '闭环完成率', value: 92, unit: '%', primary: '较昨日 +6%', secondary: '', icon: 'rate', tone: 'green' },
]

export const tasks: TaskItem[] = [
  { id: 'LY-20260908-001', name: '青云山重点林区秋季巡查', field: '林业监管', area: '青云山林场', status: '巡航采集中', progress: 36, owner: '巡查一队', updatedAt: '2026-09-08 14:32' },
  { id: 'LY-20260908-002', name: '北岭疑似毁林图斑核查', field: '林业监管', area: '北岭街道', status: '待研判', progress: 58, owner: '林政科', updatedAt: '2026-09-08 13:48' },
  { id: 'LY-20260907-008', name: '清河林地占用项目复核', field: '林业监管', area: '清河镇', status: '待复核', progress: 86, owner: '执法二队', updatedAt: '2026-09-08 11:20' },
  { id: 'LY-20260906-015', name: '南麓违章搭建专项巡查', field: '林业监管', area: '南麓保护区', status: '已归档', progress: 100, owner: '巡查二队', updatedAt: '2026-09-07 17:05' },
  { id: 'LY-20260908-006', name: '西峰森林督查图斑复核', field: '林业监管', area: '西峰林区', status: '待下发', progress: 68, owner: '监督科', updatedAt: '2026-09-08 10:16' },
]

export const workflowEvents: WorkflowEvent[] = [
  { id: '1', time: '09-08 14:22', type: 'identify', name: 'AI 识别完成', operator: '识别引擎', description: '发现疑似毁林开垦图斑 3 处' },
  { id: '2', time: '09-08 13:45', type: 'capture', name: '影像采集完成', operator: '巡查一队', description: '采集正射影像 286 张' },
  { id: '3', time: '09-08 10:18', type: 'flight', name: '无人机起飞', operator: '张海峰', description: '执行青云山北区航线' },
  { id: '4', time: '09-08 09:36', type: 'plan', name: '航线审核通过', operator: '李静', description: '航线长度 12.8 km' },
]

export const dashboardTaskList = [
  { id: 'RW-20260908-011', title: '林业执法巡查 · 违规砍伐林木巡查', area: '青云山林区', time: '2026-09-08 10:00', status: '进行中', tone: 'running', icon: '林' },
  { id: 'RW-20260908-009', title: '国土变更调查与复核 · 疑似新增建设核查', area: '松平县东片区', time: '2026-09-08 09:20', status: '进行中', tone: 'running', icon: '土' },
  { id: 'RW-20260907-036', title: '耕地和用途管控与非粮化动态监测', area: '城郊农业区', time: '2026-09-07 14:10', status: '待处理', tone: 'pending', icon: '田' },
  { id: 'RW-20260906-028', title: '存量违法违规用地整改 · 整改效果复核', area: '经开区西区', time: '2026-09-06 15:30', status: '已完成', tone: 'done', icon: '核' },
]

export const dashboardAlerts = [
  { level: 'high', title: '无人机离线', description: '无人机 D3-007 失去连接', time: '14:35', tag: '高' },
  { level: 'medium', title: '疑似新增违建', description: 'AI识别发现疑似新增建筑物', time: '11:23', tag: '中' },
  { level: 'high', title: '高风险任务', description: '受控空域飞行申请即将到期', time: '10:16', tag: '高' },
  { level: 'medium', title: '待复核超期', description: '3个任务超过24小时未复核', time: '09:40', tag: '中' },
]

export const droneFeeds = [
  { id: '无人机 D3-001', area: '滨江新区', status: '执行中', altitude: '86m', speed: '4K · 30fps', image: 'river' },
  { id: '无人机 D3-012', area: '农业示范区', status: '巡查中', altitude: '128m', speed: '4K · 30fps', image: 'field' },
]

export const aiCapabilities = [
  { name: '违建识别', icon: '楼', description: '建筑物变化检测' },
  { name: '毁林开垦识别', icon: '林', description: '林地异常变化' },
  { name: '非粮化识别', icon: '田', description: '耕地用途监测' },
  { name: '变化检测', icon: '框', description: '多期影像比对' },
]

export const aiMetrics = [
  { label: '已部署算法', value: '28', unit: '个' },
  { label: '今日识别量', value: '12,560', unit: '次' },
  { label: '平均准确率', value: '92.6', unit: '%' },
]

export const domainProgress = [
  { name: '林业执法监管', planned: 160, completed: 142, rate: 89 },
  { name: '国土变更调查', planned: 142, completed: 120, rate: 82 },
  { name: '耕地用途管控', planned: 108, completed: 82, rate: 76 },
  { name: '存量违建治理', planned: 80, completed: 72, rate: 90 },
]

export const archivedCases = [
  { title: '某区道路占用林地建设整改复核', area: '林业执法监管', date: '2026-09-08', image: 'forest' },
  { title: '某地新增建设用地快速核查处置', area: '国土变更调查', date: '2026-09-07', image: 'road' },
  { title: '耕地非粮化图斑整改复核', area: '耕地用途管控', date: '2026-09-06', image: 'field' },
  { title: '存量违法搭建整治销号', area: '存量违建治理', date: '2026-09-05', image: 'building' },
]

export const governanceFlow = [
  { step: '01', name: '任务创建', description: '明确巡查任务目标', icon: '单' },
  { step: '02', name: '航线执行', description: '无人机自主巡查', icon: '机' },
  { step: '03', name: '影像回传', description: '实时影像安全传输', icon: '图' },
  { step: '04', name: 'AI识别', description: '智能分析 · 发现问题', icon: 'AI' },
  { step: '05', name: '核查任务', description: '人工核查 · 现场处置', icon: '人' },
  { step: '06', name: '复核归档', description: '形成闭环 · 留痕管理', icon: '档' },
]

export const dashboardMapPoints = [
  { name: '青云山林区', coordinates: [119.286, 26.112] as [number, number], type: 'drone', detail: '7 架在线 · 2 项任务' },
  { name: '高新区', coordinates: [119.342, 26.105] as [number, number], type: 'alert', detail: '发现高风险告警' },
  { name: '农业示范区', coordinates: [119.372, 26.046] as [number, number], type: 'task', detail: '3 项任务执行中' },
  { name: '生态保护区', coordinates: [119.405, 26.126] as [number, number], type: 'drone', detail: '区域状态正常' },
  { name: '城区中心', coordinates: [119.326, 26.078] as [number, number], type: 'center', detail: '低空治理指挥中心' },
]

export const nodeFixtures = {
  'route-planning': { left: ['基础底图', '行政区划', '林地小班', '历史图斑'], right: [['任务面积', '18.6 km²'], ['航线长度', '12.8 km'], ['航点数量', '24 个']], bottom: ['航点列表', '历史航线', '规划告警'] },
  'cruise-capture': { left: ['开始巡航', '返航', '暂停任务', '云台控制'], right: [['飞行高度', '118 m'], ['水平速度', '8.6 m/s'], ['剩余电量', '72%']], bottom: ['影像缩略图', '飞行日志', '采集统计'] },
  'change-detection': { left: ['2026-03 影像', '2026-05 影像', '2026-07 影像', '2026-09 影像'], right: [['变化图斑', '18 处'], ['变化面积', '6.42 ha'], ['识别进度', '100%']], bottom: ['变化图斑列表', '识别备注', '检测日志'] },
  'spot-identification': { left: ['毁林开垦 · 高风险', '疑似侵占 · 中风险', '违章搭建 · 中风险'], right: [['图斑编号', 'TB-2026-0908'], ['疑似类型', '毁林开垦'], ['置信度', '93.6%']], bottom: ['识别统计', '规则说明', '近期事件'] },
  'task-dispatch': { left: ['TB-2026-0908', 'TB-2026-0903', 'TB-2026-0886'], right: [['接收单位', '青云山林场'], ['完成时限', '2026-09-15'], ['优先级', '紧急']], bottom: ['核查要求', '接收单位', '任务日志'] },
  'review-archive': { left: ['待复核 · 8', '待归档 · 5', '已归档 · 126'], right: [['案件编号', 'AJ-2026-0368'], ['整改状态', '已完成'], ['材料完整度', '100%']], bottom: ['复核结论', '归档材料', '操作日志'] },
} as const
