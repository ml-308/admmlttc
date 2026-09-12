/**
 * functions/api/admin.js
 * ─────────────────────────────────────────────────────────────
 * 管理端时刻表审核接口。
 *
 * GET    /api/admin —— 取全部时刻表并按状态分组返回
 *                     `{ unreviewed, reviewed, rejected }`
 * POST   /api/admin —— 审核操作：`action: 'approve' | 'reject'`（或 `pass: 1`）
 * DELETE /api/admin —— 永久删除某条时刻表
 *
 * 状态字段约定：
 *   · `PASS = 1`          → 已通过
 *   · `BACK = 1`          → 被驳回（兼容历史文本值 '时刻表被驳回'）
 *   · 其余                → 待审核
 *   · `SPECIAL` 仅作用户备注，审核流程不再写入该列
 *
 * TODO(安全)：本接口目前依赖前端登录态，服务端未校验 JWT；
 * 若前端改为携带 `Authorization` 头，可在这里补上管理员校验。
 */
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
    // 一次查询全量数据，JS 端分组，减少 2 次数据库查询
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
    if (action === 'reject') {
      const existing = await env.mlttcd.prepare(
        'SELECT ID FROM TIMETABLE WHERE ID = ?'
      ).bind(id).first();

      if (!existing) {
        return jsonError('记录不存在', 404);
      }

      await env.mlttcd.prepare(
        'UPDATE TIMETABLE SET PASS = 0, BACK = 1, PASSER = ? WHERE ID = ?'
      ).bind(passer || '管理员', id).run();

      return json({ success: true, message: '已驳回' }, 200);
    }

    return jsonError('未知操作', 400);
  } catch (err) {
    console.error('管理员操作错误:', err);
    return jsonError('服务器内部错误', 500);
  }
}

// ─── DELETE: 删除时刻表 ─────────────────────────
export async function onRequestDelete({ request, env }) {
  try {
    const body = await request.json().catch(() => null);
    const id = body?.id;
    if (!id) {
      return jsonError('缺少时刻表ID', 400);
    }

    const result = await env.mlttcd.prepare(
      'DELETE FROM TIMETABLE WHERE ID = ?'
    ).bind(id).run();

    if (!result.meta || result.meta.changes === 0) {
      return json({ message: '记录不存在' }, 404);
    }

    return json({ success: true, message: '已删除' }, 200);
  } catch (err) {
    console.error('管理员删除错误:', err);
    return jsonError('服务器内部错误', 500);
  }
}
