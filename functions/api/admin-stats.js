/**
 * functions/api/admin-stats.js
 * ─────────────────────────────────────────────────────────────
 * GET /api/admin-stats
 *
 * 管理后台「数据统计」接口，返回审核与用户规模概览：
 *   · unreviewed —— 待审核时刻表数
 *   · reviewed   —— 已通过时刻表数
 *   · rejected   —— 已驳回时刻表数
 *   · users      —— 注册用户数
 *
 * 鉴权：请求头 `Authorization: Bearer <管理员 JWT>`，payload.role 必须为 'admin'。
 */
import { verifyToken } from '../auth';
import { json, jsonError } from '../_lib/response';

/** 判断某条记录是否「被驳回」 */
function isRejected(row) {
  return Number(row.BACK) === 1 || row.BACK === '时刻表被驳回';
}

export async function onRequestGet({ request, env }) {
  try {
    // ── 1. 鉴权 ───────────────────────────────────────────
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
    if (!payload.role || payload.role !== 'admin') {
      return jsonError('无管理员权限', 403);
    }

    // ── 2. 时刻表状态统计 ─────────────────────────────────
    const { results } = await env.mlttcd.prepare(
      'SELECT PASS, BACK FROM TIMETABLE'
    ).all();

    let unreviewed = 0, reviewed = 0, rejected = 0;
    for (const row of results) {
      if (row.PASS === 1) reviewed++;
      else if (isRejected(row)) rejected++;
      else unreviewed++;
    }

    // ── 3. 用户数 ─────────────────────────────────────────
    const userRows = await env.mlttcd.prepare(
      'SELECT COUNT(*) AS cnt FROM USER'
    ).first();
    const users = userRows ? (userRows.cnt || 0) : 0;

    return json({
      success: true,
      unreviewed,
      reviewed,
      rejected,
      users
    }, 200);
  } catch (err) {
    console.error('数据统计错误:', err);
    return jsonError('服务器内部错误', 500);
  }
}
