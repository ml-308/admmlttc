/**
 * functions/api/profile.js
 * ─────────────────────────────────────────────────────────────
 * GET /api/profile
 *
 * 返回当前登录用户的公开档案（不含 password、TAK 等敏感列）。
 * · 身份：优先 `Authorization: Bearer`，其次 Cookie `auth_token`
 * · 响应：统一附加 CORS 凭据头，允许 mlttc.bond 前端跨域携带 Cookie 调用
 */
import { verifyToken, clearAuthCookie } from '../auth';
import { getAuthToken } from '../_lib/request-auth';
import { json } from '../_lib/response';

/** 允许跨域携带凭据的站点 */
const ALLOWED_ORIGIN = 'https://mlttc.bond';

/**
 * 为响应追加 CORS 凭据头。
 * @param {Response} response
 * @returns {Response}
 */
function withCors(response) {
  response.headers.set('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  response.headers.set('Access-Control-Allow-Credentials', 'true');
  return response;
}

export async function onRequestGet({ request, env }) {
  try {
    // ── 取 token：Bearer 优先，其次 Cookie ────────────────
    const token = getAuthToken(request);
    if (!token) {
      return withCors(json({ error: '未登录' }, 401));
    }

    let payload;
    try {
      payload = await verifyToken(token, env.JWT_SECRET);
    } catch {
      const response = json({ error: '登录已过期' }, 401);
      clearAuthCookie(response);
      return withCors(response);
    }

    // ── 查询公开字段 ────────────────────────────────────
    const user = await env.mlttcd.prepare(
      'SELECT id, email, NAME, city, registertime, adm FROM USER WHERE id = ?'
    ).bind(payload.userId).first();

    if (!user) {
      return withCors(json({ error: '用户不存在' }, 404));
    }

    return withCors(json({ user }, 200));
  } catch (err) {
    // 调试用：返回详细错误，定位问题后请移除 debug 字段
    return withCors(json({
      error: '服务器错误',
      debug: err.stack,
      message: err.message
    }, 500));
  }
}