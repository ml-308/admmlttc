/**
 * functions/_middleware.js
 * ─────────────────────────────────────────────────────────────
 * 全站请求限制（Cloudflare Pages Functions 中间件，拦截所有请求）。
 *
 * ⚠️ 限流不是免费的：`_lib/rate-limit.js` 每检查一次 = 1 次 KV 读 + 1 次 KV 写。
 * Cloudflare KV 免费额度是「读 10 万/天、写仅 1000/天」——**写**才是先撞墙的那个，
 * 而旧策略对「每个 /api/* 请求」和「每个 HTML 页面导航」都计数，等于打开一次
 * 后台（十几条 HTML + API 请求）就能吃掉全天 1% ～ 数十分之一的写入额度。
 *
 * 现策略：限流只保护敏感操作，读请求一律不碰 KV。
 *   · 登录接口 `/api/admin-login`        —— 5 分钟 10 次（防暴力破解，最严格，不限方法）
 *   · 写操作 POST / PUT / DELETE / PATCH —— 1 分钟 120 次
 *   · GET 等读请求（含 `/api/*` 读接口） —— 不限制、不消耗 KV
 *   · HTML 页面导航                       —— 不限制、不消耗 KV
 *   · 静态资源（css/js/mjs/图片/字体）    —— 不限制、不消耗 KV
 *
 * 读请求的滥用交给 Cloudflare 面板侧的 WAF / 速率限制规则处理，不在 Functions
 * 里花 KV 写入额度。这样一次后台浏览只有真正落库的写操作才会产生 KV 开销。
 *
 * 失败放行：任何异常都会调用 next()，保证站点可用性优先。
 */

import { checkRateLimit } from './_lib/rate-limit';

/** 视为静态资源的路径前缀 */
const STATIC_PREFIXES = ['/lib/', '/style/', '/asset/', '/assets/', '/favicon'];

/** 视为静态资源的扩展名 */
const STATIC_EXTENSIONS = [
  '.css', '.js', '.mjs', '.map', '.json',
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico',
  '.woff', '.woff2', '.ttf', '.otf', '.txt'
];

/** 会改变服务端数据的方法：只有这些请求需要限流保护 */
const WRITE_METHODS = new Set(['POST', 'PUT', 'DELETE', 'PATCH']);

/**
 * 判断是否为静态资源请求。
 * @param {string} pathname
 * @returns {boolean}
 */
function isStaticAsset(pathname) {
  if (STATIC_PREFIXES.some(prefix => pathname.startsWith(prefix))) return true;
  const lower = pathname.toLowerCase();
  return STATIC_EXTENSIONS.some(ext => lower.endsWith(ext));
}

/**
 * 依据请求特征选择限流档位。
 * @param {Request} request
 * @param {URL} url
 * @returns {{key: string, max: number, windowSeconds: number}|null} null 表示不限制（不碰 KV）
 */
function pickLimit(request, url) {
  const path = url.pathname;

  // 登录接口：最严格，不分方法（防暴力破解）
  if (path === '/api/admin-login') {
    return { key: 'admin-login', max: 10, windowSeconds: 300 };
  }

  // 静态资源不限制（沿用原有跳过逻辑，避免每个 CSS/JS/图片都写一次 KV）
  if (isStaticAsset(path)) return null;

  // 写操作：唯一还会消耗 KV 的常规流量
  const method = (request.method || 'GET').toUpperCase();
  if (WRITE_METHODS.has(method)) {
    return { key: 'write', max: 120, windowSeconds: 60 };
  }

  // 其余（GET / HEAD / OPTIONS 读请求、HTML 页面导航）：不限流，零 KV 开销
  return null;
}

/**
 * Pages 中间件入口。
 * @param {EventContext} context
 * @returns {Promise<Response>}
 */
export async function onRequest(context) {
  const { request, env, next } = context;

  try {
    const url = new URL(request.url);
    const limit = pickLimit(request, url);

    if (limit) {
      const blocked = await checkRateLimit(request, env, limit);
      if (blocked) return blocked;
    }
  } catch (err) {
    // 限流逻辑本身出错时放行，不影响正常访问
    console.error('限流检查异常:', err);
  }

  return next();
}
