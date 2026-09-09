# 低空智慧服务 Web 端

## 本地启动

```bash
npm install
npm run dev
```

演示环境使用任意非空账号和密码登录。默认启用 Mock 数据，不依赖后端服务。

## 当前范围

- 登录、运行中枢、任务总览；
- 林业执法监管六节点工作台；
- Vue Router 登录守卫与 Pinia 用户态；
- Axios Client、权限占位及地图/视频/实时通信/第三方集成 Adapter；
- 适配 1366px、1920px 及更宽桌面屏幕。

真实接口交付后，将 `.env.production` 的 `VITE_USE_MOCK` 改为 `false`，并在 `src/api` 与 `src/adapters` 内完成 DTO 到前端领域模型的映射。
