/**
 * functions/_lib/response.js
 * ─────────────────────────────────────────────────────────────
 * Cloudflare Pages Functions 统一响应工具。
 *
 * 目录约定：`functions/` 下以 `_` 开头的文件/目录不会生成路由，
 * 因此这里可以安全存放纯工具代码（不会变成 `/api/_lib/...` 接口）。
 *
 * 用法：
 *   import { json } from '../_lib/response';
 *   return json({ success: true }, 200);
 *   return json({ error: '未登录' }, 401);
 */

/** JSON 响应默认头 */
export const JSON_HEADERS = Object.freeze({ 'Content-Type': 'application/json' });

/**
 * 构造 JSON 响应。
 * @param {any} data 响应体（会被 JSON.stringify）
 * @param {number} [status=200] HTTP 状态码
 * @param {Record<string, string>} [extraHeaders] 追加/覆盖的响应头
 * @returns {Response}
 */
export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders }
  });
}

/**
 * 构造错误 JSON 响应（`{ error: message }`）。
 * @param {string} message 错误信息
 * @param {number} [status=400] HTTP 状态码
 * @param {Record<string, string>} [extraHeaders] 追加/覆盖的响应头
 * @returns {Response}
 */
export function jsonError(message, status = 400, extraHeaders = {}) {
  return json({ error: message }, status, extraHeaders);
}

/**
 * 构造“操作失败”JSON 响应（`{ success: false, message }`）。
 * @param {string} message 提示信息
 * @param {number} [status=400] HTTP 状态码
 * @param {Record<string, string>} [extraHeaders] 追加/覆盖的响应头
 * @returns {Response}
 */
export function jsonFail(message, status = 400, extraHeaders = {}) {
  return json({ success: false, message }, status, extraHeaders);
}

/**
 * 构造“操作成功”JSON 响应（`{ success: true, message, ...extra }`）。
 * @param {string} message 提示信息
 * @param {Record<string, any>} [extra] 附加字段（如 token、id 等）
 * @param {number} [status=200] HTTP 状态码
 * @param {Record<string, string>} [extraHeaders] 追加/覆盖的响应头
 * @returns {Response}
 */
export function jsonOk(message, extra = {}, status = 200, extraHeaders = {}) {
  return json({ success: true, message, ...extra }, status, extraHeaders);
}
