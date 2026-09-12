/**
 * functions/_middleware.js
 * ─────────────────────────────────────────────────────────────
 * 全站请求限制（Cloudflare Pages Functions 中间件，拦截所有请求）。
 *
 * 限制策略（按 IP 计数，键值存 KV，见 `_lib/rate-limit.js`）：
 *   · 登录接口 `/api/admin-login` —— 5 分钟 10 次（防暴力破解，最严格）
 *   · 其他 `/api/*`               —— 1 分钟 120 次
 *   · 页面导航（HTML 文档）        —— 1 分钟 120 次
 *   · 静态资源（css/js/mjs/图片/字体）—— 不限制
 *
 * 之所以跳过静态资源：避免每个 CSS/JS/图片请求都产生一次 KV 写入，
 * 既省配额也避免影响页面加载速度。
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
 * @returns {{key: string, max: number, windowSeconds: number}|null} null 表示不限制
 */
function pickLimit(request, url) {
  const path = url.pathname;

  // 登录接口：最严格
  if (path === '/api/admin-login') {
    return { key: 'admin-login', max: 10, windowSeconds: 300 };
  }

  // 其他接口
  if (path.startsWith('/api/')) {
    return { key: 'api', max: 120, windowSeconds: 60 };
  }

  // 静态资源不限制
  if (isStaticAsset(path)) return null;

  // 其余（页面导航）按较宽松的额度限制
  return { key: 'page', max: 120, windowSeconds: 60 };
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
