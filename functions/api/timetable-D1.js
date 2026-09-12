/**
 * functions/api/timetable-D1.js
 * ─────────────────────────────────────────────────────────────
 * 时刻表主接口（D1 版）。
 *
 * GET    /api/timetable-D1?id=...   —— 查询单条时刻表详情（含作者昵称）
 * POST   /api/timetable-D1          —— 更新时刻表（必须带 id，仅作者本人可改）
 * DELETE /api/timetable-D1?id=...   —— 删除时刻表（仅作者本人可删）
 *
 * 说明：本文件同时包含 GET 用的 KV 频率限制与查询参数校验工具。
 */
import { json, jsonError } from '../_lib/response';
import { checkRateLimit as sharedCheckRateLimit } from '../_lib/rate-limit';

export async function onRequestPost({ request, env }) {
    const body = await request.json().catch(() => null);
    if (!body) {
        return jsonError('无效的请求数据', 400);
    }

    const { id, city, way, start, end, special, time1, time2, etime, writetime, writer, pass } = body;

    // 管理员站点只负责「更新」已有时刻表，必须携带 ID
    if (!id) {
        return jsonError('缺少时刻表ID', 400);
    }

    // ─── 更新模式 ──────────────────────────
    if (id) {
        if (!writer || typeof writer !== 'string' || writer.trim().length === 0) {
            return jsonError('作者不能为空', 400);
        }
        if (!writetime || typeof writetime !== 'string' || writetime.trim().length === 0) {
            return jsonError('写入时间不能为空', 400);
        }

        // 动态构建 UPDATE SET 子句
        const sets = [];
        const params = [];

        if (city !== undefined && city !== null && typeof city === 'string' && city.trim().length > 0) {
            sets.push('CITY = ?');
            params.push(city.trim());
        }
        if (way !== undefined && way !== null && typeof way === 'string' && way.trim().length > 0) {
            sets.push('WAY = ?');
            params.push(way.trim());
        }
        if (start !== undefined && start !== null && typeof start === 'string' && start.trim().length > 0) {
            sets.push('START = ?');
            params.push(start.trim());
        }
        if (end !== undefined && end !== null && typeof end === 'string' && end.trim().length > 0) {
            sets.push('END = ?');
            params.push(end.trim());
        }
        if (special !== undefined && special !== null && typeof special === 'string') {
            sets.push('SPECIAL = ?');
            params.push(special.trim().length > 0 ? special.trim() : '无');
        }
        if (time1 !== undefined && time1 !== null && typeof time1 === 'string' && time1.trim().length > 0) {
            sets.push('TIMEONE = ?');
            params.push(time1.trim());
        }
        if (time2 !== undefined && time2 !== null && typeof time2 === 'string' && time2.trim().length > 0) {
            sets.push('TIMETWO = ?');
            params.push(time2.trim());
        }
        if (etime !== undefined && etime !== null && typeof etime === 'string' && etime.trim().length > 0) {
            sets.push('STARTTIME = ?');
            params.push(etime.trim());
        }
        if (pass !== undefined && pass !== null) {
            const passVal = Number(pass);
            if (passVal === 0 || passVal === 1) {
                sets.push('PASS = ?');
                params.push(passVal);
            }
        }

        // ─── 被驳回后重新提交：清除驳回标记（不改动 SPECIAL）────
        const existingRow = await env.mlttcd.prepare(
            'SELECT BACK FROM TIMETABLE WHERE ID = ?'
        ).bind(id).first();
        // BACK 非 0/空即视为存在驳回标记（含历史文本值）；重新提交后清除，重新进入待审核队列
        if (existingRow && existingRow.BACK !== null && existingRow.BACK !== undefined
            && existingRow.BACK !== 0 && existingRow.BACK !== '0' && existingRow.BACK !== '') {
            sets.push('BACK = 0');
        }

        if (sets.length === 0) {
            return jsonError('没有提供需要更新的字段', 400);
        }

        // 始终更新写入时间
        sets.push('WRITETIME = ?');
        params.push(writetime.trim());
        params.push(id);
        params.push(writer.trim());

        try {
            // 使用条件 UPDATE + 作者验证，一次查询代替 SELECT + UPDATE 两次
            const result = await env.mlttcd.prepare(
                `UPDATE TIMETABLE SET ${sets.join(', ')} WHERE ID = ? AND WRITER = ?`
            ).bind(...params).run();

            // D1 的 result.meta.changes > 0 表示有行被更新
            if (!result.meta || result.meta.changes === 0) {
                // 检查记录是否存在（区分"不存在"和"无权限"）
                const existing = await env.mlttcd.prepare(
                    'SELECT ID FROM TIMETABLE WHERE ID = ?'
                ).bind(id).first();

                if (!existing) {
                    return jsonError('记录不存在', 404);
                }
                return jsonError('无权修改此记录', 403);
            }

            return json({ success: true, id, message: '更新成功' }, 200);
        } catch (err) {
            console.error('更新错误:', err);
            return jsonError('数据库更新失败', 500);
        }
    }

}

// ─── 频率限制辅助 ─────────────────────────────────────────────
// 详情查询限流：1 分钟 30 次。
// 实现见 `_lib/rate-limit.js`；全站中间件（`functions/_middleware.js`）另有一层更宽松的限制。
function checkRateLimit(request, env) {
    return sharedCheckRateLimit(request, env, { key: 'timetable-detail', max: 30, windowSeconds: 60 });
}

// ─── 参数校验辅助 ─────────────────────────────────────────────
function validateSearchParam(value, maxLen) {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > maxLen) return null;
  return trimmed;
}

//Get
export async function onRequestGet({request,env}){
    try {
        // 1. 频率限制检查
        const rateLimitResponse = await checkRateLimit(request, env);
        if (rateLimitResponse) return rateLimitResponse;

        const url = new URL(request.url);
        const id = url.searchParams.get("id");

        if (id && id !== '0') {
            // ID 查询（精确匹配，受控参数）
            const cleanId = validateSearchParam(id, 20);
            if (!cleanId) {
                return json({ success: false, message: 'ID 格式无效' }, 400);
            }

            console.log("按 ID 查询");
            try {
                const row = await env.mlttcd.prepare(
                    `SELECT t.*, u.NAME as WRITER_NAME
                     FROM TIMETABLE t
                     LEFT JOIN USER u ON u.EMAIL = t.WRITER
                     WHERE t.ID = ?`
                ).bind(cleanId).first();

                if (!row) {
                    return json({ success: false, message: '未找到该记录' }, 404);
                }

                return json({ success: true, data: row }, 200);
            } catch (err) {
                console.error('ID 查询错误:', err);
                return jsonError('服务器内部错误', 500);
            }
        }

        return json({ success: false, message: '缺少 id 参数' }, 400);
    } catch (err) {
        return json({
            error: '服务器内部错误',
            debug: err.stack,        // 保留调试信息，定位其他潜在问题后建议移除
            message: err.message
        }, 500);
    }
}

// ─── 删除时刻表（仅作者本人可删）────────────────────────────
export async function onRequestDelete({ request, env }) {
    try {
        const body = await request.json().catch(() => null);
        if (!body) {
            return jsonError('无效的请求数据', 400);
        }

        const { id, writer } = body;
        if (!id || !writer) {
            return jsonError('参数不完整', 400);
        }

        // ── 校验记录存在且作者匹配 ────────────────────────
        const existing = await env.mlttcd.prepare(
            'SELECT ID, WRITER FROM TIMETABLE WHERE ID = ?'
        ).bind(id).first();

        if (!existing) {
            return jsonError('记录不存在', 404);
        }

        if (existing.WRITER !== writer) {
            return jsonError('无权删除此记录', 403);
        }

        await env.mlttcd.prepare('DELETE FROM TIMETABLE WHERE ID = ? AND WRITER = ?')
            .bind(id, writer).run();

        return json({ success: true, message: '删除成功' }, 200);
    } catch (err) {
        console.error('删除错误:', err);
        return jsonError('删除失败', 500);
    }
}