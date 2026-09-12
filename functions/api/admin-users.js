/**
 * functions/api/admin-users.js
 * ─────────────────────────────────────────────────────────────
 * GET /api/admin-users
 *
 * 管理端接口：返回全部用户的精简信息（id / 昵称 / 邮箱 / adm），按 id 升序。
 * 鉴权：请求头 `Authorization: Bearer <管理员 JWT>`，payload.role 必须为 'admin'。
 * 注意：不返回 password、TAK 等敏感列。
 */
import { verifyToken } from '../auth';
import { json, jsonError } from '../_lib/response';

export async function onRequestGet({ request, env }) {
  try {
    // ── 1. 取并校验管理员 JWT ─────────────────────────────
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return jsonError('未授权', 401);
    }

    const token = authHeader.substring(7);
    let payload;
    try {
      payload = await verifyToken(token, env.JWT_SECRET);
    } catch {
      return jsonError('登录已过期', 401);
    }

    // ── 2. 校验管理员身份 ─────────────────────────────────
    if (!payload.role || payload.role !== 'admin') {
      return jsonError('无管理员权限', 403);
    }

    // ── 3. 查询所有用户 ───────────────────────────────────
    const { results } = await env.mlttcd.prepare(
      'SELECT id, NAME, email, adm FROM USER ORDER BY id ASC'
    ).all();

    return json({ success: true, users: results }, 200);
  } catch (err) {
    console.error('查询用户列表错误:', err);
    return jsonError('服务器内部错误', 500);
  }
}
