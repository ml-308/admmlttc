/**
 * functions/api/admin.js
 * ─────────────────────────────────────────────────────────────
 * 管理端时刻表审核接口。
 *
 * GET    /api/admin —— 取全部时刻表并按状态分组返回
 *                     `{ unreviewed, reviewed, rejected }`
 * POST   /api/admin —— 审核操作：`action: 'approve' | 'reject'`（或 `pass: 1`）
 *
 * 状态字段约定：
 *   · `PASS = 1`          → 已通过
 *   · `BACK = 1`          → 被驳回（兼容历史文本值 '时刻表被驳回'）
 *   · 其余                → 待审核
 *   · `SPECIAL` 仅作用户备注，审核流程不再写入该列
 *
 * 鉴权：请求头 `Authorization: Bearer <管理员 JWT>`，payload.role 必须为 'admin'；
 * GET 与 POST 两个导出方法均在函数体最前面校验，先于任何 D1 查询
 * （校验逻辑见 `../_lib/auth-guard.js` 的 `requireAdmin`）。
 *
 * D1 查询点数：GET 1 次、POST 通过 1 次、POST 驳回 1 次（驳回原先要先 SELECT
 * 再 UPDATE，现改为单条 UPDATE + `meta.changes` 判断，少一次往返）。
 */
import { requireAdmin } from '../_lib/auth-guard';
import { json, jsonError } from '../_lib/response';

/**
 * 判断某条记录是否处于「被驳回」状态。
 * @param {{BACK?: unknown}} row TIMETABLE 行
 * @returns {boolean}
 */
function isRejected(row) {
  return Number(row.BACK) === 1 || row.BACK === '时刻表被驳回';
}

// ─── GET: 获取所有时刻表（已按状态分离）─────────
export async function onRequestGet({ request, env }) {
  try {
    // ── 鉴权（Bearer + JWT + role === 'admin'）─────────────
    const auth = await requireAdmin(request, env);
    if (!auth.ok) return auth.response;

    // 一次查询全量数据，JS 端分组，减少 2 次数据库查询。
    // 未拆成「待审核 / 已审核」两次 WHERE 查询的原因：TIMETABLE 上没有 PASS/BACK
    // 索引，两次带 WHERE 的查询在 D1 里都是全表扫描（计费按扫描行数算），
    // 读的行数与一次全表查相同、查询点数却翻倍；且 `PASS === 1`（JS 严格相等）
    // 与 `PASS = 1`（SQLite 亲和性比较）在异常存值下不等价，拆分会让分组结果漂移。
    // 返回列也不能裁：行对象原样返回给管理页，裁列即改契约。
    const { results } = await env.mlttcd.prepare(
      `SELECT t.*, u.NAME as WRITER_NAME
       FROM TIMETABLE t
       LEFT JOIN USER u ON u.EMAIL = t.WRITER
       ORDER BY t.WRITETIME DESC`
    ).all();

    // ── 在 JS 层分类 ──────────────────────────────────────
    const unreviewed = [];
    const reviewed = [];
    const rejected = [];

    for (const row of results) {
      if (row.PASS === 1) {
        reviewed.push(row);
      } else if (isRejected(row)) {
        rejected.push(row);
      } else {
        unreviewed.push(row);
      }
    }

    return json({ success: true, unreviewed, reviewed, rejected }, 200);
  } catch (err) {
    console.error('管理员查询错误:', err);
    return jsonError('服务器内部错误', 500);
  }
}

// ─── POST: 审核操作────────────────────────────
export async function onRequestPost({ request, env }) {
  try {
    // ── 鉴权（Bearer + JWT + role === 'admin'）─────────────
    const auth = await requireAdmin(request, env);
    if (!auth.ok) return auth.response;

    const body = await request.json().catch(() => null);
    if (!body) {
      return jsonError('无效的请求数据', 400);
    }

    const { id, passer, pass, action } = body;
    if (!id) {
      return jsonError('缺少时刻表ID', 400);
    }

    // ── 通过：PASS=1 + 记录审核人，并清除驳回标记（不改动 SPECIAL）──
    if (action === 'approve' || (pass !== undefined && Number(pass) === 1)) {
      const result = await env.mlttcd.prepare(
        `UPDATE TIMETABLE SET PASS = 1, PASSER = ?, BACK = 0
         WHERE ID = ?`
      ).bind(passer || '管理员', id).run();

      if (!result.meta || result.meta.changes === 0) {
        return jsonError('记录不存在', 404);
      }

      return json({ success: true, message: '已通过' }, 200);
    }

    // ── 驳回：BACK=1 作为驳回标记，SPECIAL 保持不变，PASS 保持 0 ──
    // 先 SELECT 再 UPDATE 会产生两次往返；这里直接用 UPDATE 的
    // `meta.changes` 判断记录是否存在（与上面「通过」分支同一写法）。
    // 记录不存在时 UPDATE 命中 0 行，不产生任何数据改动，仍返回同一个 404。
    if (action === 'reject') {
      const result = await env.mlttcd.prepare(
        'UPDATE TIMETABLE SET PASS = 0, BACK = 1, PASSER = ? WHERE ID = ?'
      ).bind(passer || '管理员', id).run();

      if (!result.meta || result.meta.changes === 0) {
        return jsonError('记录不存在', 404);
      }

      return json({ success: true, message: '已驳回' }, 200);
    }

    return jsonError('未知操作', 400);
  } catch (err) {
    console.error('管理员操作错误:', err);
    return jsonError('服务器内部错误', 500);
  }
}

// ─── 删除能力已移除 ──────────────────────────────
// 管理员不具备删除时刻表数据的权限：原先的 onRequestDelete（DELETE /api/admin）已删除。
// Pages Functions 对未导出的方法会返回 405，因此现在 DELETE /api/admin 会直接失败。
