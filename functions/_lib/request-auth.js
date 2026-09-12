/**
 * functions/_lib/request-auth.js
 * ─────────────────────────────────────────────────────────────
 * 请求身份识别工具：从请求中取出 JWT，并安全地解析出 payload。
 *
 * 取 token 的优先级：
 *   1. `Authorization: Bearer <token>`（前端显式携带，绕开 Safari 的 Cookie 限制）
 *   2. Cookie 中的 `auth_token`（同域场景由 setAuthCookie 写入）
 */

import { verifyToken, getCookie } from '../auth';

/**
 * 取出请求携带的 token。
 * @param {Request} request
 * @param {string} [cookieName='auth_token'] Cookie 名称
 * @returns {string|null} token 或 null
 */
export function getAuthToken(request, cookieName = 'auth_token') {
  const authHeader = request.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return getCookie(request, cookieName);
}

/**
 * 校验 token 并返回 payload（失败不抛异常）。
 * @param {string} token JWT
 * @param {string} secret 签名密钥（env.JWT_SECRET）
 * @returns {Promise<object|null>} 校验通过返回 payload，否则 null
 */
export async function tryVerifyToken(token, secret) {
  try {
    return await verifyToken(token, secret);
  } catch {
    return null;
  }
}
