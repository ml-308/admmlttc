/**
 * functions/api/admin-login.js
 * ─────────────────────────────────────────────────────────────
 * POST /api/admin-login
 *
 * 管理后台登录，三步校验全部在服务端完成：
 *   1. 账号（邮箱或昵称）+ 密码正确
 *   2. `USER.adm` 属于管理员角色（`adm` 或 `station`）
 *   3. 提交的 `adminToken` 与 `USER.TAK` 列一致
 * 校验通过后签发 3 天有效期的 JWT（payload 带 `role: 'admin'`）。
 */
import { signToken } from '../auth';
import { verifyPassword } from '../_lib/password';
import { json, jsonFail } from '../_lib/response';

/** 允许进入管理后台的 adm 取值（小写比较） */
const ADMIN_ROLES = ['adm', 'station'];

/** 管理员 JWT 有效期（秒）：3 天 */
const ADMIN_TOKEN_EXPIRY = 259200;

export async function onRequestPost({ request, env }) {
  try {
    // ── 解析并校验请求体 ──────────────────────────────────
    const body = await request.json().catch(() => null);
    if (!body) {
      return jsonFail('无效的请求数据', 400);
    }

    const { email, password, adminToken } = body;
    if (!email || !password) {
      return jsonFail('账号和密码不能为空', 400);
    }
    if (!adminToken || !String(adminToken).trim()) {
      return jsonFail('请输入管理员令牌', 400);
    }

    // ── 查用户：含 @ 按邮箱匹配，否则按昵称匹配 ────────────
    const input = email.trim();
    const sql = input.includes('@')
      ? 'SELECT id, email, NAME, password, adm, TAK FROM USER WHERE email = ?'
      : 'SELECT id, email, NAME, password, adm, TAK FROM USER WHERE NAME = ?';
    const user = await env.mlttcd.prepare(sql)
      .bind(input.includes('@') ? input.toLowerCase() : input)
      .first();

    if (!user) {
      return jsonFail('管理员账号或密码错误', 401);
    }

    // ── 校验管理员角色 ────────────────────────────────────
    const admValue = String(user.adm || '').trim().toLowerCase();
    if (!ADMIN_ROLES.includes(admValue)) {
      return jsonFail('该账号无管理员权限', 403);
    }

    // ── 校验密码 ──────────────────────────────────────────
    const isPasswordValid = await verifyPassword(password, user.password);
    if (!isPasswordValid) {
      return jsonFail('管理员账号或密码错误', 401);
    }

    // ── 校验管理员令牌（宽松比较以兼容类型差异）───────────
    if (!user.TAK || user.TAK != String(adminToken).trim()) {
      return jsonFail('管理员令牌错误', 403);
    }

    // ── 签发 JWT ──────────────────────────────────────────
    const token = await signToken(
      { userId: user.id, email: user.email, role: 'admin' },
      env.JWT_SECRET,
      ADMIN_TOKEN_EXPIRY
    );

    return json({
      success: true,
      token,
      email: user.email,
      name: user.NAME,
      message: '管理员登录成功'
    }, 200);
  } catch (error) {
    console.error('管理员登录错误:', error);
    return jsonFail('服务器错误', 500);
  }
}
