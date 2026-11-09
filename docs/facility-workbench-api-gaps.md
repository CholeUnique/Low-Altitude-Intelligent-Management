# 工程设施工作台：流程与设施资料对接

更新日期：2026-11-08。当前契约以本次后端回复的 91 号预置 FACILITY_REPAIR_FLOW 为准；已取代此前按通用核查、独立维修节点推测的路由约定。

## 后端已确认的流程

预置来源：code/sql/91_deploy_init_dml.sql:4298-4307（后端提供的定位，本仓库不含该后端文件）。

- FIELD_CHECK：IMPLEMENT 类型，核查和维修合并办理。result 仅允许 NO_PROBLEM、REPAIRED、APPLY_DISCARD，全部进入 RECHECK_AUDIT。
- RECHECK_AUDIT：REVIEW 类型。NO_PROBLEM、REPAIRED、APPLY_DISCARD 为三种通过结论，进入 FINISH_FACILITY；NOT_PASS 退回 FIELD_CHECK，由引擎按 prevAssignee 找回原核查人。不存在 PASS 结论。
- FINISH_FACILITY：FINISH 类型自动结束节点，没有下一办理人，无需人工再次提交。
- 复核通过或退回均不传 targetAssigneeId、targetDeptId、deadline；核查提交统一选择区县分局复核办理人。
- 设施状态由后端 facilityRecheckHandler 联动：NO_PROBLEM / REPAIRED 恢复 NORMAL，APPLY_DISCARD 更新为 DISCARDED，NOT_PASS 不联动。前端提交成功后回读任务和设施资料，不自行推断状态或调用设施修改接口。

## 前端适配

- 明确识别上述三个 nodeKey；仅在 FACILITY_REPAIR_FLOW 中启用合并核查修复表单，不添加独立维修节点。其他既有流程保留原有规则。
- 核查结论显示为“核查属实，已修复”“核查不属实，无问题”“申请废弃”，提交对应的标准 result。已修复时填写维修措施和测试结果，无问题时附核查证据，申请废弃时填写原因。
- 复核结论显示为三种通过选项及“复核不通过，退回核查修复”。不再提交该流程不支持的 PROBLEM / DONE / PASS，也不要求复核人员另选下一办理人。
- 当前节点、历史回看、退回后的新节点实例及结束节点均按真实流程映射；历史记录用业务结论展示，不直接显示内部枚举值。
- currentNode 仅返回待办摘要时，按同一节点实例 ID 合并时间线中的表单和附件；退回生成的新实例不会继承旧实例的核查证据。
- 自动结束节点无表单时，结案页从该结束节点实际关联的已通过复核记录展示结论；不会跳过较新的退回记录去复用旧结论。
- 提交成功但随后刷新失败时，显示“节点已提交，部分最新资料读取失败”，不将流程读取失败当成已结案；重试读取不会重复提交。

## 任务内嵌设施资料

后端已确认 BizTaskDetailVO 返回 facilityId 和完整 facility（BizFacilityVO），完成任务可见性校验后按 task.facility_id 查询，台账 SPECIAL_ANALYSIS 权限保持不变。

- 前端使用 POST /api/v1/biz/task/detail 返回的 facility，兼容顶层和 task 内嵌结构。
- 工作台和任务详情页不再调用 /biz/facility/detail 或全部门 /biz/facility/geojson；设施编号、名称、类型、状态、项目、区划、行政村、备注和几何均来自任务授权范围内的数据。
- 设施摘要 ID 必须与任务的明确关联一致；不一致时保留关联核对提示，不展示其他设施。
- 设施删除后只有 facilityId、没有 facility 时，保留设施 ID 和任务资料，提示设施资料不可用；不会转而访问受台账权限限制的接口。
- 地图优先使用任务几何，否则使用 facility.geometryJson。

后端反馈的验证结果：测试库任务 2162 / 2163 / 2164 / 2167 均有结构化 facility_id，无需补历史数据；task/detail(2162) 返回 facilityId=1419 和设施 test2 的完整资料及几何；后端报告编译、BizTaskApiTest 12 例和冒烟通过，并已重启。这些为后端提供的结果，不代表前端已再次查询或推进真实任务。

## 前端验证

- 节点映射和提交测试覆盖三种核查结论、四种复核结论、非法旧结论拦截、退回原核查人、原始节点实例 ID、自动结束及原有流程兼容。
- 设施上下文测试覆盖两种摘要结构、关联不一致、设施删除、无设施关联的新建任务、任务接口拒绝访问、切换任务和任务几何优先级；不访问设施台账。
- 组件测试以模拟接口驱动实际工作台逻辑，覆盖条件表单、复核接收人、自动复核流转和结束后的只读状态；不会提交真实业务任务。
- 检查命令：npm run test:facility-workbench、node scripts/task-history.test.mjs、npm run build。

## 2026-11-08 真实环境只读核验

- 直接读取运行中的后端 /v3/api-docs，确认 BizTaskDetailVO 已发布 facilityId、facility；字段说明明确表示随任务权限可见，无需 SPECIAL_ANALYSIS。
- 使用用户提供的 nyncKZ 测试账号登录本地前端，连接真实后端。首页专题区域显示“暂无专题分析权限”。
- 从该账号的工程设施待办进入 NYNCJ-20261106-002（任务 ID 2167），实际当前节点为“现场核查修复”，处理人为农田建设科（本人），工作台可办理，三种核查结论和复核接收人选项正常。
- 同一页面实际显示设施 test2、ID 1419、设施编号 NYNCJ-20261105-0003、类型涵洞、状态核查中及位置几何；未出现节点未映射或设施授权衔接提示。上报照片显示 1 张。
- 核验仅涉及登录、筛选及读取页面，没有填写核查结论、上传附件或提交工作流。任务仍停留在现场核查修复，复核通过/退回等写入分支由本地组件和提交契约回归覆盖，未在真实业务任务上执行。
