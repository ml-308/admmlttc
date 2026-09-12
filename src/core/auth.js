/**
 * src/core/auth.js
 * ─────────────────────────────────────────────────────────────
 * 管理后台前端会话工具（登录态存放在 sessionStorage）。
 *
 * 为什么用 sessionStorage + Authorization 头：
 * 部分浏览器（尤其 Safari）对跨站 Cookie 限制严格，登录后把 JWT 放在
 * sessionStorage，再由各页面手动放进 `Authorization: Bearer` 头更稳定。
 *
 * 存放的键：
 *   · `admin_token`      —— 服务端签发的 JWT
 *   · `admin_email`      —— 管理员邮箱（用于页面展示与审核记录）
 *   · `admin_logged_in`  —— 登录标记（仅作前端状态判断）
 */

export const ADMIN_TOKEN_KEY = 'admin_token';
export const ADMIN_EMAIL_KEY = 'admin_email';
export const ADMIN_LOGGED_IN_KEY = 'admin_logged_in';

/** 未登录/过期时的默认跳转地址 */
export const ADMIN_LOGIN_PAGE = '/admin-login.html';

/**
 * 解析 JWT 的 payload 部分（不校验签名，仅用于前端做展示与过期判断）。
 * @param {string} token JWT
 * @returns {object|null} payload；解析失败返回 null
 */
export function parseJwtPayload(token) {
  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch {
    return null;
  }
}

/**
 * 读取当前会话中的管理员 token。
 * @returns {string|null}
 */
export function getAdminToken() {
  return sessionStorage.getItem(ADMIN_TOKEN_KEY);
}

/**
 * 读取当前会话中记录的管理员邮箱。
 * @returns {string}
 */
export function getAdminEmail() {
  return sessionStorage.getItem(ADMIN_EMAIL_KEY) || '';
}

/**
 * 清除管理员会话（退出登录、token 失效时调用）。
 * @returns {void}
 */
export function clearAdminSession() {
  sessionStorage.removeItem(ADMIN_LOGGED_IN_KEY);
  sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  sessionStorage.removeItem(ADMIN_EMAIL_KEY);
}

/**
 * 管理页守卫：无 token 或 token 非法/过期时清理会话并跳转登录页。
 * 应在页面脚本顶部以 IIFE 形式调用：
 *   const payload = requireAdminSession();
 *   if (!payload) return; // 已跳转，停止后续初始化
 *
 * @param {string} [redirectTo=ADMIN_LOGIN_PAGE] 跳转地址
 * @returns {object|null} 合法时返回 JWT payload，否则返回 null（并已跳转）
 */
export function requireAdminSession(redirectTo = ADMIN_LOGIN_PAGE) {
  const token = getAdminToken();
  if (!token) {
    clearAdminSession();
    window.location.href = redirectTo;
    return null;
  }

  const payload = parseJwtPayload(token);
  if (!payload || payload.role !== 'admin' || Date.now() / 1000 > payload.exp) {
    clearAdminSession();
    window.location.href = redirectTo;
    return null;
  }

  return payload;
}
