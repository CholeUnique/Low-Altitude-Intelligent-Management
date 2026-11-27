# 项目协作要求

新增或修改任何任务工作台（含 `src/views/WorkspaceView.vue`、`src/workspace-components/**`、工作台配置）前，必须先读取 `docs/workbench-layout.md`。

所有工作台复用 `WorkbenchHeader.vue` 与由公共宿主挂载的单个 `WorkspaceToolBall.vue`。不得另建一套header、节点操作人时间提示或悬浮位置工具。具体尺寸、层级、坐标和导航规范见该文档。
