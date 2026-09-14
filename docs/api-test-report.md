# 后端 API 冒烟测试报告

测试日期：2026-09-13  
服务地址：`http://223.2.38.27:8080`  
范围：认证与 UAV 查询接口；未调用同步、新增、修改、删除、清理、启停、下发及飞控接口。

## 关键结论

1. `POST /api/v1/user/login/public-key` 正常返回一次性 `keyId`、X.509 Base64 公钥和算法提示。
2. 算法提示为 `RSA-OAEP-256 (PKCS1 v1.5 兼容)`，但实测 OAEP-SHA256 返回 `10015 密码解密失败`，**PKCS#1 v1.5 登录成功**。
3. 登录响应包含 Bearer JWT，`expiresIn=7200`；无 Token 调 `user/info` 返回 HTTP 401。
4. 后端 JSON 直接输出 19 位 int64。原生 `JSON.parse` 会破坏 ID 精度：
   - 原值：`2098260739284332544`
   - 错值：`2098260739284332500`
   - 用错值查询 detail 返回 `10201 数据不存在`
   - 保持字符串后 detail 返回成功
5. 前端必须在 JSON 解析前将 16 位以上整数转换为字符串，所有业务 ID 均使用 `string`。

## 测试结果

| 接口 | 结果 | 摘要 |
|---|---|---|
| `user/login/public-key` | 通过 | `code=0` |
| `user/login` | 通过 | PKCS#1 v1.5；OAEP-SHA256 失败 |
| `user/info` | 通过 | ADMIN 用户信息正常 |
| `user/dept/list` | 通过 | admin 返回 0 条所属部门 |
| `dept/options` | 通过 | 14 条 |
| `dept/list` | 通过 | 14 条 |
| `uav/wayline/page` | 通过 | 7 条 |
| `uav/wayline/detail` | 通过 | 字符串 ID 查询成功 |
| `uav/flight-plan/page` | 通过 | 3 条 |
| `uav/flight-task/page` | 通过 | 4 条 |
| `uav/flight-task/detail` | 通过 | 字符串 ID 查询成功 |
| `uav/flight-task/progressing` | 通过 | 当前空数组，页面需显示空态 |
| `uav/flight-task/trace` | 通过 | 仅 `enableTrace=1` 的任务具备有效轨迹 |
| `uav/flight-task/media/page` | 通过 | 当前抽样任务 0 条素材 |
| `uav/project/page` | 通过 | 1 条 |
| `uav/project/options` | 通过 | 1 条 |
| `uav/device/page` | 通过 | 1 台 DOCK3 |
| `uav/device/detail` | 通过 | 机场及子机信息正常 |
| `uav/device/state` | 通过 | 最新物模型正常 |
| `uav/device/statistics` | 通过 | 飞行统计正常 |
| `uav/device/hms/page` | 通过 | 有 HMS 告警记录 |
| `uav/live/share-code` | 通过 | 返回临时 code、过期时间和 SN |
| `uav/statistics/*` | 通过 | overview / flight / device / media / count-by-dept |
| `uav/dept-exclude/page` | 后端异常 | `code=-1, msg=unknown error` |

## 可重复执行

PowerShell：

```powershell
$env:SMOKE_USER="admin"
$env:SMOKE_PASS="<密码>"
npm run smoke:api
```

脚本：`scripts/api-smoke.mjs`。密码仅从进程环境变量读取，不写入代码、文档或仓库。
