// ─── 管理员主面板页面 ───────────────────────────

// ─── JWT 解析辅助 ─────────────────────────────
function parseJwtPayload(token) {
  try {
    const payload = token.split('.')[1];
    return JSON.parse(atob(payload));
  } catch { return null; }
}

// ─── 管理员 JWT 验证 ──────────────────────────
(function checkAuth() {
  const token = sessionStorage.getItem('admin_token');
  if (!token) {
    sessionStorage.removeItem('admin_logged_in');
    sessionStorage.removeItem('admin_email');
    window.location.href = '/admin-login.html';
    return;
  }
  const payload = parseJwtPayload(token);
  if (!payload || payload.role !== 'admin' || Date.now() / 1000 > payload.exp) {
    sessionStorage.removeItem('admin_token');
    sessionStorage.removeItem('admin_email');
    sessionStorage.removeItem('admin_logged_in');
    window.location.href = '/admin-login.html';
    return;
  }
  const email = payload.email || sessionStorage.getItem('admin_email');
  if (email) {
    const el = document.getElementById('adminEmailDisplay');
    if (el) el.textContent = email;
  }
})();

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
  const token = sessionStorage.getItem('admin_token');
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
    profileRole.textContent = user.adm && user.adm !== 'user' ? '管理员' : '普通用户';

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
  sessionStorage.removeItem('admin_logged_in');
  sessionStorage.removeItem('admin_token');
  sessionStorage.removeItem('admin_email');
  window.location.href = '/admin-login.html';
});

// ─── 返回按钮 ────────────────────────────────
backBtn.addEventListener('click', () => window.location.href = '/index.html');

// ─── 启动 ────────────────────────────────────
loadProfile();
