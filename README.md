# admmlttc

MLTTC 管理员站点（Cloudflare Pages + D1 + KV）。

## 目录结构

```
functions/      Pages Functions（后端）
  _middleware.js      全站请求限制中间件
  _lib/               公共模块：response / password / request-auth / rate-limit
  api/                接口：admin-login、admin、admin-users、profile、timetable-D1、test
src/            前端脚本
  core/auth.js        管理端会话与 JWT
  utils/              toast（轻提示）、role（身份文案）
  pages/              各页面脚本（admin / admin-users / admin-review / admin-detail / admin-edit）
style/          样式：main / index / timetable / timetable-detail
lib/ui/         自定义元素（hcw-button 等，Shadow DOM）
```

## 请求限制（防请求过多）

由 `functions/_middleware.js` 统一实施：按客户端 IP 计数（存 KV `mlttckv`），超限返回 `429`，响应体
`{ success: false, error, message, retryAfter }` 并带 `Retry-After` 头。

| 范围 | 额度 |
| --- | --- |
| `/api/admin-login` | 5 分钟 10 次（防暴力破解） |
| 其他 `/api/*` | 1 分钟 120 次 |
| 页面导航（HTML 文档） | 1 分钟 120 次 |
| 静态资源（css/js/图片/字体） | 不限制，避免每个资源请求都产生 KV 写入 |

- 另有接口级限流：`GET /api/timetable-D1?id=` 为 1 分钟 30 次。
- 调整额度：修改 `functions/_middleware.js` 的 `pickLimit()`（或接口内的 `checkRateLimit()` 参数）。
- 公共实现：`functions/_lib/rate-limit.js`；未绑定 KV 或 KV 异常时**自动放行**，保证站点可用性。
