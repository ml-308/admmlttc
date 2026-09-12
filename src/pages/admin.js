/**
 * src/pages/admin.js
 * ─────────────────────────────────────────────────────────────
 * 管理员主面板：展示管理员信息卡（昵称 / 邮箱 / 身份）与功能菜单。
 * 入口：/admin.html
 *
 * 依赖：src/core/auth.js（登录态守卫）、src/utils/role.js（身份文案）
 */
import { requireAdminSession, getAdminEmail, clearAdminSession, getAdminToken } from '../core/auth';
import { getRoleInfo } from '../utils/role';

// ─── 登录态守卫 + 头部邮箱展示 ─────────────────────────────
const adminPayload = requireAdminSession();
if (adminPayload) {
  const el = document.getElementById('adminEmailDisplay');
  if (el) el.textContent = adminPayload.email || getAdminEmail();
}

// ─── DOM ────────────────────────────────────
const backBtn = document.getElementById('backBtn');
const logoutBtn = document.getElementById('logoutBtn');
const profileLoading = document.getElementById('profileLoading');
const profileContent = document.getElementById('profileContent');
const profileError = document.getElementById('profileError');
const profileName = document.getElementById('profileName');
const profileEmail = document.getElementById('profileEmail');
const profileRole = document.getElementById('profileRole');

// ─── 加载管理员信息 ──────────────────────────
async function loadProfile() {
  const token = getAdminToken();
  if (!token) return;

  try {
    const res = await fetch('/api/profile', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) {
      profileLoading.classList.add('hidden');
      profileError.classList.remove('hidden');
      return;
    }

    const data = await res.json();
    const user = data.user || data;

    profileName.textContent = user.NAME || '未设置';
    profileEmail.textContent = user.email || '—';

    // 身份：由 USER.adm 映射（adm → 管理员 / station → 站长 / 其他 → 普通用户）
    const role = getRoleInfo(user.adm);
    profileRole.textContent = role.text;
    profileRole.className = role.className;

    profileLoading.classList.add('hidden');
    profileContent.classList.remove('hidden');
  } catch {
    profileLoading.classList.add('hidden');
    profileError.classList.remove('hidden');
  }
}

// ─── 功能按钮跳转 ────────────────────────────
document.querySelectorAll('.dashboard-btn:not([disabled])').forEach(btn => {
  btn.addEventListener('click', () => {
    const href = btn.dataset.href;
    if (href) window.location.href = href;
  });
});

// ─── 退出登录 ────────────────────────────────
logoutBtn.addEventListener('click', () => {
  // 清理 admin_token / admin_email / admin_logged_in
  clearAdminSession();
  window.location.href = '/admin-login.html';
});

// ─── 返回按钮 ────────────────────────────────
backBtn.addEventListener('click', () => window.location.href = '/index.html');

// ─── 启动 ────────────────────────────────────
loadProfile();
