/**
 * functions/api/admin-users.js
 * ─────────────────────────────────────────────────────────────
 * GET /api/admin-users
 *
 * 管理端接口：返回全部用户的精简信息（id / 昵称 / 邮箱 / adm），按 id 升序。
 * 鉴权：请求头 `Authorization: Bearer <管理员 JWT>`，payload.role 必须为 'admin'
 * （校验逻辑见 `../_lib/auth-guard.js` 的 `requireAdmin`）。
 * 注意：不返回 password、TAK 等敏感列。
 *
 * D1 查询点数：1 次（单表全列精简字段，已无合并空间）。
 */
import { requireAdmin } from '../_lib/auth-guard';
import { json, jsonError } from '../_lib/response';

export async function onRequestGet({ request, env }) {
  try {
    // ── 鉴权（Bearer + JWT + role === 'admin'）─────────────
    const auth = await requireAdmin(request, env);
    if (!auth.ok) return auth.response;

    // ── 查询所有用户 ──────────────────────────────────────
    const { results } = await env.mlttcd.prepare(
      'SELECT id, NAME, email, adm FROM USER ORDER BY id ASC'
    ).all();

    return json({ success: true, users: results }, 200);
  } catch (err) {
    console.error('查询用户列表错误:', err);
    return jsonError('服务器内部错误', 500);
  }
}
