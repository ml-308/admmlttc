/**
 * src/pages/admin-reports.js
 * ─────────────────────────────────────────────────────────────
 * 管理员 —— 错误报告集中处置页：按状态列出报告并就地处置。
 * 入口：/admin-reports.html
 *
 * 处置动作（POST /api/admin-reports）：
 *   · 恢复上线（action: 'restore'）—— 时刻表 PASS=1、BACK=0，重新对用户可见
 *   · 返还写入者（action: 'return'）—— 时刻表 PASS=0、BACK=1，退回写入者修改（可附留言）
 * 两种动作都会把该时刻表名下的其它待处理报告一并关闭（服务端按 TID 批量处理）。
 *
 * 依赖：src/core/auth.js（登录态守卫）、src/utils/toast.js（轻提示）、
 *       /lib/ui/popup.mjs（showConfirm / showPrompt 确认与留言弹窗）
 */
import { requireAdminSession, getAdminEmail, getAdminToken, clearAdminSession } from '../core/auth.js';
import { showMessage } from '../utils/toast.js';
import { showConfirm, showPrompt } from '/lib/ui/popup.mjs';

// ─── 登录态守卫 + 头部邮箱展示 ─────────────────────────────
const adminPayload = requireAdminSession();
if (adminPayload) {
  const el = document.getElementById('adminEmailDisplay');
  if (el) el.textContent = adminPayload.email || getAdminEmail();
}

// ─── DOM ────────────────────────────────────
const backBtn = document.getElementById('backBtn');
const logoutBtn = document.getElementById('logoutBtn');

const reportCount = document.getElementById('reportCount');
const reportLoading = document.getElementById('reportLoading');
const reportError = document.getElementById('reportError');
const reportEmpty = document.getElementById('reportEmpty');
const reportList = document.getElementById('reportList');

const filterBtns = {
  open: document.getElementById('filterOpen'),
  resolved: document.getElementById('filterResolved'),
  all: document.getElementById('filterAll')
};

// ─── 常量与状态 ─────────────────────────────
/** 筛选值 → 空态文案 */
const EMPTY_TEXT = {
  open: '暂无待处理的错误报告',
  resolved: '暂无已处理的错误报告',
  all: '暂无错误报告'
};

/** RESOLUTION 取值 → 展示文案（与接口契约一致：restored / returned） */
const RESOLUTION_TEXT = {
  restored: '恢复上线',
  returned: '返还写入者'
};

/** 当前筛选（默认「待处理」） */
let currentStatus = 'open';
/** 列表请求序号：只渲染最新一次请求的结果，切筛选时旧响应直接丢弃 */
let requestSeq = 0;
/** 处置请求进行中（防止连点） */
let busy = false;

// ─── 工具 ────────────────────────────────────
/**
 * 创建元素（用户输入一律走 textContent，绝不拼进 innerHTML）。
 * @param {string} tag 标签名
 * @param {string} [className] class
 * @param {string} [text] 文本内容
 * @returns {HTMLElement}
 */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

/**
 * 构造接口鉴权头（服务端要求 Authorization: Bearer <JWT>）。
 * @param {Record<string, string>} [extra] 需合并的额外头
 * @returns {Record<string, string>|null} token 缺失时返回 null
 */
function adminAuthHeaders(extra = {}) {
  const token = getAdminToken();
  if (!token) return null;
  return { 'Authorization': `Bearer ${token}`, ...extra };
}

/** 一处错误提示：页内红字 + 轻提示（不留白屏） */
function showError(text) {
  reportLoading.classList.add('hidden');
  reportEmpty.classList.add('hidden');
  reportList.innerHTML = '';
  reportCount.textContent = '—';
  reportError.textContent = text;
  reportError.classList.remove('hidden');
}

/**
 * 切换筛选按钮的选中态：选中项加 primary 属性，其余移除。
 * 说明：hcw-button 的 shadow 样式里有 :host([primary]) 规则，
 * 属性一改立即生效，无需额外 CSS，与 admin.html 现有写法一致。
 * @param {'open'|'resolved'|'all'} status
 * @returns {void}
 */
function setActiveFilter(status) {
  Object.entries(filterBtns).forEach(([key, btn]) => {
    if (!btn) return;
    if (key === status) btn.setAttribute('primary', '');
    else btn.removeAttribute('primary');
  });
}

// ─── 单张报告卡片 ────────────────────────────
/**
 * 一条报告 → 一张卡片（时刻表信息 + 正文 + 状态 + 待处理时的两个操作按钮）。
 * @param {object} r 接口返回的一条报告
 * @returns {HTMLElement}
 */
function createReportCard(r) {
  const isOpen = (r.STATUS || 'open') === 'open';
  const card = el('div', 'report-item');

  // 头部：时刻表(#ID · 城市 · 线路) + 状态徽标
  const header = el('div', 'report-item-header');
  header.appendChild(el('span', '', `#${r.TID || '未知'} · ${r.CITY || '未知城市'} · ${r.WAY || '未知线路'}`));
  header.appendChild(el('span', isOpen ? 'report-status report-status--open' : 'report-status report-status--handled',
    isOpen ? '待处理' : '已处理'));
  card.appendChild(header);

  // 起终点
  card.appendChild(el('div', 'report-item-email',
    `起点 ${r.START || '未知'} ↔ 终点 ${r.END || '未知'}　｜　写入者 ${r.WRITER_NAME || '未知'}`));

  // 报告人 / 报告时间
  card.appendChild(el('div', 'report-item-email',
    `报告人 ${r.EMAIL || '未知'}　｜　报告时间 ${r.WRITETIME || '未知'}`));

  // 报告正文：用户输入，只用 textContent
  card.appendChild(el('div', 'report-item-content', r.CONTENT || '（无内容）'));

  // 已处理：展示处理方式 / 处理人 / 处理时间 / 留言
  if (!isOpen) {
    const info = el('div', 'mt-sm');
    const rows = [
      ['处理方式', RESOLUTION_TEXT[r.RESOLUTION] || r.RESOLUTION || '未知'],
      ['处理人', r.RESOLVEDBY || '未知'],
      ['处理时间', r.RESOLVEDTIME || '未知']
    ];
    if (r.RESOLVENOTE) rows.push(['处理留言', r.RESOLVENOTE]);
    rows.forEach(([label, value]) => {
      const row = el('div', 'detail-meta-row');
      row.appendChild(el('span', 'detail-meta-label', label));
      // 处理留言同样是用户输入，用 textContent
      row.appendChild(el('span', 'detail-meta-value', value));
      info.appendChild(row);
    });
    card.appendChild(info);
  }

  // 待处理：恢复上线 / 返还写入者
  if (isOpen) {
    const actions = el('div', 'review-actions');

    const restoreBtn = document.createElement('hcw-button');
    restoreBtn.setAttribute('primary', '');
    restoreBtn.setAttribute('flat', '');
    restoreBtn.textContent = '恢复上线';
    restoreBtn.addEventListener('click', () => handleRestore(r));

    const returnBtn = document.createElement('hcw-button');
    returnBtn.setAttribute('variant', 'warning');
    returnBtn.setAttribute('flat', '');
    returnBtn.textContent = '返还写入者';
    returnBtn.addEventListener('click', () => handleReturn(r));

    actions.appendChild(restoreBtn);
    actions.appendChild(returnBtn);
    card.appendChild(actions);
  }

  return card;
}

// ─── 加载列表 ────────────────────────────────
/**
 * 按 currentStatus 拉取报告并渲染（三态：加载中 / 空 / 错误）。
 * @returns {Promise<void>}
 */
async function loadReports() {
  const seq = ++requestSeq;

  reportLoading.classList.remove('hidden');
  reportLoading.textContent = '加载中...';
  reportError.classList.add('hidden');
  reportEmpty.classList.add('hidden');
  reportList.innerHTML = '';
  reportCount.textContent = '—';

  const headers = adminAuthHeaders();
  if (!headers) {
    showError('登录已失效，请重新登录');
    return;
  }

  try {
    const res = await fetch(`/api/admin-reports?status=${encodeURIComponent(currentStatus)}`, {
      credentials: 'include',
      headers
    });

    // 期间用户又切了筛选：本次结果作废，交给更新的那次请求渲染
    if (seq !== requestSeq) return;

    if (res.status === 401) {
      showError('登录已失效（401），请退出后重新登录');
      showMessage('登录已失效，请重新登录', true);
      return;
    }
    if (res.status === 403) {
      showError('当前账号没有管理员权限（403），请使用管理员账号登录');
      showMessage('无管理员权限（403）', true);
      return;
    }
    if (!res.ok) {
      showError(`加载失败，请重试（HTTP ${res.status}）`);
      return;
    }

    const data = await res.json().catch(() => ({}));
    if (seq !== requestSeq) return;

    // 表/列未创建时后端返回 200 + note + 空数组：明确提示，不留白屏
    if (data.note) {
      showError(`${data.note}（需主站侧先执行建表 / 加列 SQL）`);
      return;
    }

    const reports = (data.success && Array.isArray(data.reports)) ? data.reports : [];

    reportLoading.classList.add('hidden');
    reportCount.textContent = `${reports.length} 条`;

    if (reports.length === 0) {
      reportEmpty.textContent = EMPTY_TEXT[currentStatus] || '暂无错误报告';
      reportEmpty.classList.remove('hidden');
      return;
    }

    reports.forEach(r => reportList.appendChild(createReportCard(r)));
  } catch (err) {
    if (seq !== requestSeq) return;
    console.error('加载错误报告失败:', err);
    showError('加载失败，请检查网络后重试');
  }
}

// ─── 处置：恢复上线 ──────────────────────────
/**
 * @param {object} r 报告
 * @returns {Promise<void>}
 */
async function handleRestore(r) {
  if (busy) return;

  const confirmed = await showConfirm({
    text: `确定将时刻表 #${r.TID} 恢复上线？该时刻表将重新对用户可见，相关待处理报告会一并关闭。`,
    buttons: ['确定', '取消'],
    button_style: ['primary', '']
  });
  // showConfirm 返回倒序索引：点「确定」得 1，点「取消」得 0
  if (confirmed !== 1) return;

  await submitAction(r, 'restore');
}

// ─── 处置：返还写入者（可附留言） ─────────────
/**
 * @param {object} r 报告
 * @returns {Promise<void>}
 */
async function handleReturn(r) {
  if (busy) return;

  const confirmed = await showConfirm({
    text: `确定将时刻表 #${r.TID} 返还给写入者？该时刻表会被驳回并退回修改，相关待处理报告会一并关闭。`,
    buttons: ['确定', '取消'],
    button_style: ['primary', '']
  });
  if (confirmed !== 1) return;

  const note = await showPrompt({
    text: '可填写返还留言（留空直接提交）：',
    buttons: ['提交', '取消'],
    button_style: ['primary', ''],
    input_is_area: true,
    input_attrs: { placeholder: '例如：线路或发车时间有误，请修改后重新提交' }
  });
  // showPrompt 点最后一个按钮（取消）返回 null → 放弃本次处置
  if (note === null) return;

  await submitAction(r, 'return', note);
}

// ─── 提交处置请求 ────────────────────────────
/**
 * @param {object} r 报告
 * @param {'restore'|'return'} action 处置动作
 * @param {string} [note] 返还留言
 * @returns {Promise<void>}
 */
async function submitAction(r, action, note) {
  if (busy) return;
  busy = true;

  const headers = adminAuthHeaders({ 'Content-Type': 'application/json' });
  if (!headers) {
    showMessage('登录已失效，请重新登录', true);
    busy = false;
    return;
  }

  try {
    const res = await fetch('/api/admin-reports', {
      method: 'POST',
      credentials: 'include',
      headers,
      body: JSON.stringify({
        reportId: r.ID,
        action,
        note: (typeof note === 'string' && note.trim()) ? note.trim() : undefined
      })
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      showMessage(data.error || `处置失败（HTTP ${res.status}）`, true);
      busy = false;
      return;
    }

    const closed = (typeof data.resolved === 'number') ? data.resolved : 0;
    showMessage(`${action === 'restore' ? '已恢复上线' : '已返还写入者'}，关闭 ${closed} 条报告`, false);
  } catch (err) {
    console.error('处置错误报告失败:', err);
    showMessage('网络错误，请重试', true);
    busy = false;
    return;
  }

  busy = false;
  await loadReports();
}

// ─── 筛选切换 ────────────────────────────────
Object.entries(filterBtns).forEach(([status, btn]) => {
  if (!btn) return;
  btn.addEventListener('click', () => {
    currentStatus = status;
    setActiveFilter(status);
    // 重复点同一筛选=重新加载（失败后重试也走这里）
    loadReports();
  });
});

// ─── 导航 ────────────────────────────────────
backBtn.addEventListener('click', () => window.location.href = '/admin.html');

logoutBtn.addEventListener('click', () => {
  clearAdminSession();
  window.location.href = '/admin-login.html';
});

// ─── 初始加载：默认「待处理」 ────────────────
setActiveFilter(currentStatus);
loadReports();
