// ─── 管理员：获取所有用户信息 ────────────────────
import { verifyToken } from '../auth';

export async function onRequestGet({ request, env }) {
  try {
    // 1. 验证管理员 JWT
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: '未授权' }), {
        status: 401, headers: { 'Content-Type': 'application/json' }
      });
    }

    const token = authHeader.substring(7);
    let payload;
    try {
      payload = await verifyToken(token, env.JWT_SECRET);
    } catch {
      return new Response(JSON.stringify({ error: '登录已过期' }), {
        status: 401, headers: { 'Content-Type': 'application/json' }
      });
    }

    // 2. 校验管理员身份
    if (!payload.role || payload.role !== 'admin') {
      return new Response(JSON.stringify({ error: '无管理员权限' }), {
        status: 403, headers: { 'Content-Type': 'application/json' }
      });
    }

    // 3. 查询所有用户
    const { results } = await env.mlttcd.prepare(
      'SELECT id, NAME, email, adm FROM USER ORDER BY id ASC'
    ).all();

    return new Response(JSON.stringify({
      success: true,
      users: results
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('查询用户列表错误:', err);
    return new Response(JSON.stringify({ error: '服务器内部错误' }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}
