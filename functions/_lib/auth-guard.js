/**
 * functions/_lib/auth-guard.js
 * ─────────────────────────────────────────────────────────────
 * 管理端鉴权守卫：把原先在 admin.js / admin-reports.js / admin-users.js /
 * admin-stats.js 里各写一遍的「Bearer + JWT + role === 'admin'」三段判断收拢到一处。
 *
 * 用法：
 *   import { requireAdmin } from '../_lib/auth-guard';
 *   const auth = await requireAdmin(request, env);
 *   if (!auth.ok) return auth.response;
 *   // 之后按需取 auth.payload（例如 auth.payload.email 作为处理人）
 *
 * 返回的失败响应与抽取前逐字一致（状态码 + 文案）：
 *   · 缺少 Authorization 或不是 Bearer —— 401 { error: '未授权' }
 *   · JWT 校验失败 / 过期              —— 401 { error: '登录已过期' }
 *   · payload.role 不是 'admin'        —— 403 { error: '无管理员权限' }
 *
 * 注意：这里不吞掉 verifyToken 之外的异常（例如 payload 异常导致的读取错误），
 * 让它继续抛给调用方的 try/catch，保持原有的 500 兜底行为。
 */

import { verifyToken } from '../auth';
import { jsonError } from './response';

/**
 * @typedef {{ok: true, payload: object}} AuthOk
 * @typedef {{ok: false, response: Response}} AuthFail
 */

/**
 * 校验当前请求是否为管理员请求。
 * @param {Request} request 当前请求
 * @param {{JWT_SECRET?: string}} env 环境绑定（需要 JWT_SECRET）
 * @returns {Promise<AuthOk|AuthFail>} 通过时返回 payload，否则返回可直接 return 的响应
 */
export async function requireAdmin(request, env) {
  // ── 1. 取 Bearer token ────────────────────────────────
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { ok: false, response: jsonError('未授权', 401) };
  }

  const token = authHeader.substring(7);
  let payload;
  try {
    payload = await verifyToken(token, env.JWT_SECRET);
  } catch {
    return { ok: false, response: jsonError('登录已过期', 401) };
  }

  // ── 2. 校验管理员身份 ─────────────────────────────────
  if (!payload.role || payload.role !== 'admin') {
    return { ok: false, response: jsonError('无管理员权限', 403) };
  }

  return { ok: true, payload };
}
