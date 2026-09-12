/**
 * functions/api/test.js
 * ─────────────────────────────────────────────────────────────
 * GET /api/test —— 部署连通性探针，返回固定文本用于确认 Functions 已生效。
 */
export function onRequest() {
  return new Response('Hello from function');
}
