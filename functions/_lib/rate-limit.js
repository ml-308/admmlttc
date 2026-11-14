/**
 * functions/_lib/rate-limit.js
 * ─────────────────────────────────────────────────────────────
 * 基于 KV 的轻量请求频率限制（全站通用）。
 *
 * ⚠️ 成本：每次 `checkRateLimit()` = **1 次 KV 读 + 1 次 KV 写**。
 * Cloudflare KV 免费额度：读 10 万/天、**写仅 1000/天**，所以调用点必须克制。
 *
 * 当前调用方（只有这两处，新增调用前先算一遍每日 KV 写入量）：
 *   1. `functions/_middleware.js` —— 仅「登录接口」与「写操作（POST/PUT/DELETE/PATCH）」；
 *      GET 读请求、HTML 页面导航、静态资源全部跳过，不再产生 KV 读写。
 *   2. `functions/api/timetable-D1.js` —— 详情查询 `timetable-detail`（30 次/分钟，仍算读请求）。
 *      这是历史遗留的读请求限流，本次未改动（不在改动边界内）。
 *
 * 设计要点：
 * 1. **失败放行**：未绑定 KV 或 KV 读写异常时返回 null（不拦截），
 *    避免限流组件本身把站点打挂。
 * 2. **固定窗口计数**：窗口内计数超过阈值才拦截，KV 写入不 await，
 *    不阻塞响应；`expirationTtl` 设为窗口的 2 倍，过期自动清理。
 * 3. 本文件的导出都在使用中：`checkRateLimit`（两处调用）、`getClientIp`
 *    （本文件内部使用，同时作为工具函数对外保留）。
 *
 * 用法：
 *   const blocked = await checkRateLimit(request, env, { key: 'write', max: 120, windowSeconds: 60 });
 *   if (blocked) return blocked;
 */

import { json } from './response';

/**
 * 取客户端 IP（Cloudflare 场景优先 CF-Connecting-IP）。
 * @param {Request} request
 * @returns {string}
 */
export function getClientIp(request) {
  return request.headers.get('CF-Connecting-IP')
    || request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim()
    || 'unknown';
}

/**
 * 检查是否超出频率限制。
 * 注意：成功走到 KV 分支时固定消耗 1 次 KV 读 + 1 次 KV 写，勿用于高频读请求。
 * @param {Request} request 当前请求
 * @param {{mlttckv?: KVNamespace}} env 环境绑定
 * @param {object} [options]
 * @param {string} [options.key='global'] 限制分组名（不同分组互不影响）
 * @param {number} [options.max=60] 窗口内允许的最大请求数
 * @param {number} [options.windowSeconds=60] 窗口长度（秒）
 * @param {string} [options.message] 被拦截时的提示文案
 * @returns {Promise<Response|null>} 超限时返回 429 响应，否则返回 null
 */
export async function checkRateLimit(request, env, options = {}) {
  const {
    key = 'global',
    max = 60,
    windowSeconds = 60,
    message = '请求过于频繁，请稍后再试'
  } = options;

  const kv = env?.mlttckv;
  if (!kv || typeof kv.get !== 'function') return null; // 未绑定 KV：不限流

  const storeKey = `ratelimit:${key}:${getClientIp(request)}`;
  const now = Math.floor(Date.now() / 1000);

  let record = null;
  try {
    record = await kv.get(storeKey, { type: 'json' });
  } catch {
    record = null; // KV 读取失败：按新窗口处理
  }

  if (!record || typeof record.window !== 'number' || now - record.window >= windowSeconds) {
    record = { window: now, count: 1 };
  } else {
    record.count += 1;
  }

  // 写回 KV：不 await，失败也不影响主流程
  try {
    kv.put(storeKey, JSON.stringify(record), { expirationTtl: windowSeconds * 2 }).catch(() => {});
  } catch {
    /* 忽略 */
  }

  if (record.count > max) {
    return json({
      success: false,
      error: message,
      message,
      retryAfter: windowSeconds
    }, 429, { 'Retry-After': String(windowSeconds) });
  }

  return null;
}
