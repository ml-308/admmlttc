/**
 * functions/api/admin-reports.js
 * ─────────────────────────────────────────────────────────────
 * 管理端接口：错误报告（TIMETABLE_REPORT）
 *
 * 路由一览：
 *   GET  /api/admin-reports?id=<时刻表ID>              查某条时刻表的历史报告（原有行为，逻辑未改动）
 *   GET  /api/admin-reports?status=open|resolved|all   列出全部报告（缺省 all，最多 200 条）
 *   POST /api/admin-reports                            处置报告：恢复上线 / 返还写入者
 *
 * 鉴权：请求头 `Authorization: Bearer <管理员 JWT>`，payload.role 必须为 'admin'。
 * （与 functions/api/admin-users.js、admin-stats.js 的分支写法保持一致）
 *
 * 兼容性：TIMETABLE_REPORT 表由主站仓库建表；若主站 SQL 尚未执行（或尚未补上
 * RESOLVEDBY / RESOLVEDTIME / RESOLUTION / RESOLVENOTE 四列），查询会抛错，
 * 此时返回 200 + 空列表 + note，避免管理页整块崩掉。
 */
import { verifyToken } from '../auth';
import { json, jsonError } from '../_lib/response';

/** 时刻表 ID 长度上限（与 ?id= 契约一致：≤20 字符） */
const MAX_ID_LENGTH = 20;

/** 列表模式单次最多返回的报告条数 */
const LIST_LIMIT = 200;

/** 列表模式允许的 status 取值（缺省 all） */
const ALLOWED_STATUS = ['open', 'resolved', 'all'];

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

    // ── 3. 参数分流：带 id 走旧行为，否则走「列全部报告」──
    const url = new URL(request.url);
    const id = (url.searchParams.get('id') || '').trim();

    // ── 3a. 原有行为：按时刻表 ID 查该条记录的历史报告 ─────
    if (id) {
      if (id.length > MAX_ID_LENGTH) {
        return jsonError('参数非法：缺少或非法的时刻表ID', 400);
      }

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
    }

    // ── 3b. 新增行为：列出全部报告（?status=open|resolved|all，缺省 all）──
    const status = (url.searchParams.get('status') || 'all').trim().toLowerCase();
    if (!ALLOWED_STATUS.includes(status)) {
      return jsonError('参数非法：status 只能为 open / resolved / all', 400);
    }

    try {
      // TIMETABLE_REPORT 的四个 RESOLVED* 列由主站侧建表/加列 SQL 提供；
      // CITY / WAY / START 直接取别名，END 是 SQLite 关键字，加双引号避免解析歧义
      // （结果列名仍为 END，与契约逐字一致）。
      const stmt = env.mlttcd.prepare(
        `SELECT r.ID, r.TID, r.EMAIL, r.CONTENT, r.STATUS, r.WRITETIME,
                r.RESOLVEDBY, r.RESOLVEDTIME, r.RESOLUTION, r.RESOLVENOTE,
                t.CITY, t.WAY, t.START, t."END",
                u.NAME AS WRITER_NAME
         FROM TIMETABLE_REPORT r
         LEFT JOIN TIMETABLE t ON t.ID = r.TID
         LEFT JOIN USER u ON u.EMAIL = t.WRITER
         ${status === 'all' ? '' : "WHERE r.STATUS = ?"}
         ORDER BY r.WRITETIME DESC
         LIMIT ${LIST_LIMIT}`
      );

      // 'all' 不带 WHERE，无需绑定参数；open / resolved 绑定状态值
      const { results } = await (status === 'all' ? stmt : stmt.bind(status)).all();

      return json({ success: true, reports: results || [] }, 200);
    } catch (queryErr) {
      console.warn('查询错误报告列表失败（TIMETABLE_REPORT 表或 RESOLVED* 列可能尚未创建）:', queryErr);
      return json({
        success: true,
        reports: [],
        note: '错误报告列表查询失败，TIMETABLE_REPORT 表或其 RESOLVED* 列可能尚未创建'
      }, 200);
    }
  } catch (err) {
    // 其余异常（如 D1 绑定缺失）：按契约返回 500
    console.error('查询错误报告接口异常:', err);
    return jsonError('服务器内部错误', 500);
  }
}

export async function onRequestPost({ request, env }) {
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

    // ── 3. 参数校验 ───────────────────────────────────────
    const body = await request.json().catch(() => null);
    if (!body) {
      return jsonError('无效的请求数据', 400);
    }

    const rawReportId = body.reportId;
    if (rawReportId === undefined || rawReportId === null || String(rawReportId).trim() === '') {
      return jsonError('参数非法：缺少报告ID', 400);
    }
    // 报告 ID 是 INTEGER 主键：数字（或纯数字字符串）按数字绑定，其余按字符串绑定
    // （绑定后查不到记录，走下面的 404 分支）
    const reportId = Number.isInteger(Number(rawReportId))
      ? Number(rawReportId)
      : String(rawReportId).trim();

    const action = body.action;
    if (action !== 'restore' && action !== 'return') {
      return jsonError('参数非法：action 只能为 restore 或 return', 400);
    }

    // 留言：非字符串或纯空白一律视为未填写 → 写 NULL
    const note = (typeof body.note === 'string' && body.note.trim()) ? body.note.trim() : null;

    // 处理人一律取 JWT 里的管理员邮箱（不信任请求体）
    const adminEmail = payload.email || '管理员';
    const resolution = action === 'restore' ? 'restored' : 'returned';
    const resolvedTime = new Date().toISOString();

    // ── 4. 先按 reportId 查出该报告所属的时刻表 ID ─────────
    let report;
    try {
      report = await env.mlttcd.prepare(
        'SELECT ID, TID FROM TIMETABLE_REPORT WHERE ID = ?'
      ).bind(reportId).first();
    } catch (queryErr) {
      // 表不存在属于「服务端数据缺失」，这里不降级为 200：管理操作必须给出失败反馈
      console.warn('查询报告失败（TIMETABLE_REPORT 可能尚未创建）:', queryErr);
      return jsonError('错误报告表不可用，无法处置（TIMETABLE_REPORT 可能尚未创建）', 500);
    }

    if (!report) {
      return jsonError('报告不存在', 404);
    }

    // ── 5. 两种处置动作对应的 TIMETABLE 更新 ───────────────
    //     与 functions/api/admin.js 的「通过 / 驳回」语句逐字一致：
    //       通过 → restore（恢复上线）：PASS = 1, PASSER = ?, BACK = 0
    //       驳回 → return（返还写入者）：PASS = 0, BACK = 1, PASSER = ?
    const timetableSql = action === 'restore'
      ? `UPDATE TIMETABLE SET PASS = 1, PASSER = ?, BACK = 0
         WHERE ID = ?`
      : `UPDATE TIMETABLE SET PASS = 0, BACK = 1, PASSER = ?
         WHERE ID = ?`;

    // ── 6. 关闭报告：按 TID 把该时刻表的其它待处理报告一并置为已处理 ──
    //     （避免同一条时刻表被反复处置）
    const reportSql = `UPDATE TIMETABLE_REPORT
       SET STATUS = 'resolved', RESOLVEDBY = ?, RESOLVEDTIME = ?, RESOLUTION = ?, RESOLVENOTE = ?
       WHERE TID = ? AND STATUS = 'open'`;

    // ── 7. 两条 UPDATE 放进同一批（D1 batch，原子性更好）──
    const [timetableResult, reportResult] = await env.mlttcd.batch([
      env.mlttcd.prepare(timetableSql).bind(adminEmail, report.TID),
      env.mlttcd.prepare(reportSql).bind(adminEmail, resolvedTime, resolution, note, report.TID)
    ]);

    if (!timetableResult || !timetableResult.meta || timetableResult.meta.changes === 0) {
      // 时刻表可能已被写入者撤销（Remove）：报告仍照常关闭，避免管理页残留无法处理的条目
      console.warn('处置报告时未命中时刻表记录，TID =', report.TID);
    }

    const resolved = (reportResult && reportResult.meta && typeof reportResult.meta.changes === 'number')
      ? reportResult.meta.changes
      : 0;

    return json({ success: true, resolved }, 200);
  } catch (err) {
    console.error('处置错误报告接口异常:', err);
    return jsonError('服务器内部错误', 500);
  }
}
