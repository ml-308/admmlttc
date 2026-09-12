/**
 * src/pages/admin-users.js
 * ─────────────────────────────────────────────────────────────
 * 管理员 —— 用户信息页：分页展示全部用户及其身份。
 * 入口：/admin-users.html
 *
 * 依赖：src/core/auth.js（登录态守卫）、src/utils/role.js（身份文案）
 */
import { requireAdminSession, getAdminEmail, clearAdminSession, getAdminToken } from '../core/auth.js';
import { getRoleInfo } from '../utils/role.js';

// ─── 登录态守卫 + 头部邮箱展示 ─────────────────────────────
const adminPayload = requireAdminSession();
if (adminPayload) {
  const el = document.getElementById('adminEmailDisplay');
  if (el) el.textContent = adminPayload.email || getAdminEmail();
}

// ─── DOM ────────────────────────────────────
const backBtn = document.getElementById('backBtn');
const logoutBtn = document.getElementById('logoutBtn');
const userLoading = document.getElementById('userLoading');
const userError = document.getElementById('userError');
const userEmpty = document.getElementById('userEmpty');
const userListWrapper = document.getElementById('userListWrapper');
const userList = document.getElementById('userList');
const userCount = document.getElementById('userCount');
const retryBtn = document.getElementById('retryBtn');

const userPagination = document.getElementById('userPagination');
const userPrevBtn = document.getElementById('userPrevBtn');
const userNextBtn = document.getElementById('userNextBtn');
const userPageInfo = document.getElementById('userPageInfo');

const PAGE_SIZE = 10;
let allUsers = [];
let currentPage = 0;

// ─── 获取用户列表 ────────────────────────────
async function loadUsers() {
  userLoading.classList.remove('hidden');
  userError.classList.add('hidden');
  userEmpty.classList.add('hidden');
  userListWrapper.classList.add('hidden');

  const token = getAdminToken();

  try {
    const res = await fetch('/api/admin-users', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) {
      userLoading.classList.add('hidden');
      userError.classList.remove('hidden');
      return;
    }

    const json = await res.json();
    allUsers = json.users || [];
    currentPage = 0;

    userLoading.classList.add('hidden');
    userCount.textContent = allUsers.length + ' 人';

    if (allUsers.length === 0) {
      userEmpty.classList.remove('hidden');
      return;
    }

    userListWrapper.classList.remove('hidden');
    renderPage();
  } catch {
    userLoading.classList.add('hidden');
    userError.classList.remove('hidden');
  }
}

// ─── 渲染分页 ────────────────────────────────
function renderPage() {
  const totalPages = Math.max(1, Math.ceil(allUsers.length / PAGE_SIZE));
  if (currentPage >= totalPages) currentPage = totalPages - 1;
  if (currentPage < 0) currentPage = 0;

  const start = currentPage * PAGE_SIZE;
  const end = Math.min(start + PAGE_SIZE, allUsers.length);
  const pageData = allUsers.slice(start, end);

  userList.innerHTML = '';

  pageData.forEach((user, idx) => {
    const card = document.createElement('div');
    card.className = 'result-item';
    card.style.animationDelay = `${idx * 0.05}s`;

    // 身份：由 USER.adm 映射（管理员 / 站长 / 普通用户）
    const { text: roleText, className: roleClass } = getRoleInfo(user.adm);

    card.innerHTML = `
      <div class="result-item-header">
        <span class="result-item-id">#${user.id || '?'}</span>
        <span class="result-item-route">${user.NAME || '未设置昵称'}</span>
      </div>
      <div class="result-item-body">
        <div class="result-item-meta" style="display:flex; flex-wrap:wrap; gap:8px;">
          <span>${user.email || '—'}</span>
          <span class="${roleClass}">${roleText}</span>
        </div>
      </div>
    `;

    userList.appendChild(card);
  });

  userPagination.classList.remove('hidden');
  userPageInfo.textContent = `${currentPage + 1}/${totalPages}`;
  userPrevBtn.disabled = currentPage === 0;
  userNextBtn.disabled = currentPage >= totalPages - 1;
}

// ─── 分页切换 ────────────────────────────────
function changePage(delta) {
  const totalPages = Math.ceil(allUsers.length / PAGE_SIZE);
  const target = currentPage + delta;
  if (target < 0 || target >= totalPages) return;
  currentPage = target;
  renderPage();
}

// ─── 事件绑定 ────────────────────────────────
backBtn.addEventListener('click', () => window.location.href = '/admin.html');

logoutBtn.addEventListener('click', () => {
  // 清理 admin_token / admin_email / admin_logged_in
  clearAdminSession();
  window.location.href = '/admin-login.html';
});

retryBtn.addEventListener('click', loadUsers);
userPrevBtn.addEventListener('click', () => changePage(-1));
userNextBtn.addEventListener('click', () => changePage(1));

// ─── 启动 ────────────────────────────────────
loadUsers();
