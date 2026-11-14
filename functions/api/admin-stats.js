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
 * 鉴权：请求头 `Authorization: Bearer <管理员 JWT>`，payload.role 必须为 'admin'
 * （校验逻辑见 `../_lib/auth-guard.js` 的 `requireAdmin`）。
 *
 * D1 往返次数：两条查询装进同一个 `batch()`，2 次往返 → 1 次（语句数与结果不变）。
 */
import { requireAdmin } from '../_lib/auth-guard';
import { json, jsonError } from '../_lib/response';

/** 判断某条记录是否「被驳回」 */
function isRejected(row) {
  return Number(row.BACK) === 1 || row.BACK === '时刻表被驳回';
}

export async function onRequestGet({ request, env }) {
  try {
    // ── 1. 鉴权（Bearer + JWT + role === 'admin'）──────────
    const auth = await requireAdmin(request, env);
    if (!auth.ok) return auth.response;

    // ── 2. 时刻表状态统计 + 3. 用户数（同一批，只跑一次往返）──
    //    两条都是只读语句，放进 batch 既不改变结果，也不会引入写操作。
    const [statusResult, userResult] = await env.mlttcd.batch([
      env.mlttcd.prepare('SELECT PASS, BACK FROM TIMETABLE'),
      env.mlttcd.prepare('SELECT COUNT(*) AS cnt FROM USER')
    ]);

    const results = (statusResult && statusResult.results) || [];

    let unreviewed = 0, reviewed = 0, rejected = 0;
    for (const row of results) {
      if (row.PASS === 1) reviewed++;
      else if (isRejected(row)) rejected++;
      else unreviewed++;
    }

    const userRow = (userResult && userResult.results && userResult.results[0]) || null;
    const users = userRow ? (userRow.cnt || 0) : 0;

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
