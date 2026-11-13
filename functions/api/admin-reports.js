/**
 * functions/api/admin-reports.js
 * ─────────────────────────────────────────────────────────────
 * 管理端接口：GET /api/admin-reports?id=<时刻表ID>
 *
 * 返回主站用户针对某条时刻表提交的「错误报告」，按 WRITETIME 倒序，最多 100 条：
 *   `{ success: true, reports: [ { ID, EMAIL, CONTENT, STATUS, WRITETIME } ] }`
 *
 * 鉴权：请求头 `Authorization: Bearer <管理员 JWT>`，payload.role 必须为 'admin'。
 * （与 functions/api/admin-users.js、admin-stats.js 的分支写法保持一致）
 *
 * 兼容性：TIMETABLE_REPORT 表由主站仓库建表；若主站 SQL 尚未执行，
 * 查询会抛错，此时返回 200 + 空列表 + note，避免管理员详情页整块崩掉。
 */
import { verifyToken } from '../auth';
import { json, jsonError } from '../_lib/response';

// 时刻表 ID 长度上限（与契约一致：≤20 字符）
const MAX_ID_LENGTH = 20;

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

    // ── 3. 参数校验：id 必填且不超过 20 字符 ───────────────
    const url = new URL(request.url);
    const id = (url.searchParams.get('id') || '').trim();
    if (!id || id.length > MAX_ID_LENGTH) {
      return jsonError('参数非法：缺少或非法的时刻表ID', 400);
    }

    // ── 4. 查询错误报告 ───────────────────────────────────
    try {
      const { results } = await env.mlttcd.prepare(
        `SELECT ID, EMAIL, CONTENT, STATUS, WRITETIME
         FROM TIMETABLE_REPORT
         WHERE TID = ?
         ORDER BY WRITETIME DESC
         LIMIT 100`
      ).bind(id).all();

      return json({ success: true, reports: results || [] }, 200);
    } catch (queryErr) {
      // 表不存在（主站建表 SQL 未执行）或列结构不符：降级为空列表，不让页面报错
      console.warn('查询错误报告失败（TIMETABLE_REPORT 可能尚未创建）:', queryErr);
      return json({
        success: true,
        reports: [],
        note: '错误报告查询失败，TIMETABLE_REPORT 表可能尚未创建'
      }, 200);
    }
  } catch (err) {
    // 其余异常（如 D1 绑定缺失）：按契约返回 500
    console.error('查询错误报告接口异常:', err);
    return jsonError('服务器内部错误', 500);
  }
}
