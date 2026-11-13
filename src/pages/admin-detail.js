/**
 * src/pages/admin-detail.js
 * ─────────────────────────────────────────────────────────────
 * 管理员 —— 时刻表详情页：展示单条时刻表的完整信息与审核状态。
 * 入口：/admin-detail.html?id=<时刻表ID>
 *
 * 依赖：src/core/auth.js（登录态守卫）、src/utils/toast.js（轻提示）
 */
import { requireAdminSession, getAdminEmail, getAdminToken } from '../core/auth.js';
import { showMessage } from '../utils/toast.js';

// ─── 登录态守卫 + 头部邮箱展示 ─────────────────────────────
const adminPayload = requireAdminSession();
if (adminPayload) {
  const el = document.getElementById('adminEmailDisplay');
  if (el) el.textContent = adminPayload.email || getAdminEmail();
}

const backBtn = document.getElementById('back-btn');
const detailBackBtn = document.getElementById('detail-back-btn');
const detailLoading = document.getElementById('detail-loading');
const detailError = document.getElementById('detail-error');
const detailContent = document.getElementById('detail-content');
const detailRetryBtn = document.getElementById('detail-retry-btn');

const detailTitle = document.getElementById('detail-title');
const detailId = document.getElementById('detail-id');
const detailCity = document.getElementById('detail-city');
const detailWay = document.getElementById('detail-way');
const detailStart = document.getElementById('detail-start');
const detailEnd = document.getElementById('detail-end');
const detailSpecial = document.getElementById('detail-special');
const detailTime1 = document.getElementById('detail-time1');
const detailTime2 = document.getElementById('detail-time2');
const detailStarttime = document.getElementById('detail-starttime');
const detailWriter = document.getElementById('detail-writer');
const detailWritetime = document.getElementById('detail-writetime');
const detailPassStatus = document.getElementById('detail-pass-status');
const detailPasser = document.getElementById('detail-passer');

// ─── 错误报告区块（数据来自主站写入的 TIMETABLE_REPORT 表） ──
const reportsLoading = document.getElementById('reports-loading');
const reportsEmpty = document.getElementById('reports-empty');
const reportsError = document.getElementById('reports-error');
const reportsList = document.getElementById('reports-list');
const reportsCount = document.getElementById('reports-count');

// 报告状态文案：open = 待处理，handled = 已处理
const REPORT_STATUS_TEXT = { open: '待处理', handled: '已处理' };

// 轻提示 showMessage 已抽到 src/utils/toast.js（见文件顶部 import）

function formatTimeDisplay(timeStr) {
  if (!timeStr || timeStr === 'unknown') return [];
  return timeStr.split(/[\t\n\r]+/).filter(t => t.trim()).map(p => p.trim()).filter(p => p);
}

function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

// ─── 错误报告渲染 ────────────────────────────
// 单条报告卡片：内容来自主站用户输入，全部用 textContent 写入，不当 HTML 解析
function createReportItem(report) {
  const item = document.createElement('div');
  item.className = 'report-item';

  const header = document.createElement('div');
  header.className = 'report-item-header';

  const time = document.createElement('span');
  time.textContent = `报告时间: ${report.WRITETIME || '未知'}`;

  const state = String(report.STATUS || 'open').toLowerCase();
  const status = document.createElement('span');
  status.className = 'report-status report-status--' + (state === 'handled' ? 'handled' : 'open');
  status.textContent = REPORT_STATUS_TEXT[state] || state;

  header.append(time, status);

  const email = document.createElement('div');
  email.className = 'report-item-email';
  email.textContent = `报告人: ${report.EMAIL || '未知'}`;

  const content = document.createElement('div');
  content.className = 'report-item-content';
  content.textContent = report.CONTENT || '（无内容）';

  item.append(header, email, content);
  return item;
}

// 三态渲染：有报告 / 无报告空态（表未创建时附带服务端说明）
function renderReports(reports, note) {
  reportsLoading.classList.add('hidden');
  reportsError.classList.add('hidden');
  reportsList.innerHTML = '';

  if (!reports || reports.length === 0) {
    reportsCount.textContent = '0 条';
    reportsEmpty.textContent = note ? `暂无错误报告（${note}）` : '暂无错误报告';
    reportsEmpty.classList.remove('hidden');
    return;
  }

  reportsEmpty.classList.add('hidden');
  reportsCount.textContent = reports.length + ' 条';
  reports.forEach(report => reportsList.appendChild(createReportItem(report)));
}

// 401 / 403 / 网络错误等：给出明确提示，不留空白
function showReportsError(message) {
  reportsLoading.classList.add('hidden');
  reportsEmpty.classList.add('hidden');
  reportsList.innerHTML = '';
  reportsError.textContent = message;
  reportsError.classList.remove('hidden');
}

async function loadReports(id) {
  reportsLoading.classList.remove('hidden');
  reportsError.classList.add('hidden');
  reportsEmpty.classList.add('hidden');
  reportsList.innerHTML = '';
  reportsCount.textContent = '— 条';

  const token = getAdminToken();

  try {
    const res = await fetch('/api/admin-reports?id=' + encodeURIComponent(id), {
      credentials: 'include',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (res.status === 401) {
      showReportsError('登录已过期，请重新登录后查看错误报告');
      return;
    }
    if (res.status === 403) {
      showReportsError('无管理员权限，无法查看错误报告');
      return;
    }
    if (!res.ok) {
      showReportsError(`错误报告加载失败（HTTP ${res.status}）`);
      return;
    }

    const data = await res.json().catch(() => ({}));
    if (!data.success) {
      showReportsError('错误报告加载失败');
      return;
    }
    renderReports(data.reports || [], data.note || '');
  } catch (e) {
    console.error('加载错误报告失败:', e);
    showReportsError('网络错误，无法加载错误报告');
  }
}

let loadedData = null;

async function loadDetail() {
  const id = getQueryParam('id');
  if (!id) {
    detailLoading.classList.add('hidden');
    detailError.classList.remove('hidden');
    document.querySelector('.detail-error p').textContent = '缺少时刻表ID参数';
    return;
  }

  // 错误报告与详情并行加载（共用同一个 id）
  loadReports(id);

  detailLoading.classList.remove('hidden');
  detailError.classList.add('hidden');
  detailContent.classList.add('hidden');

  try {
    const res = await fetch(`/api/timetable-D1?id=${encodeURIComponent(id)}`, {
      credentials: 'include'
    });
    if (!res.ok) throw new Error('请求失败');
    const json = await res.json();
    if (!json.success || !json.data) throw new Error(json.message || '找不到数据');

    loadedData = json.data;
    renderDetail(loadedData);
  } catch (e) {
    console.error('加载详情失败:', e);
    detailLoading.classList.add('hidden');
    detailError.classList.remove('hidden');
    document.querySelector('.detail-error p').textContent = e.message || '无法加载时刻表详情';
  }
}

function renderDetail(item) {
  detailLoading.classList.add('hidden');
  detailError.classList.add('hidden');
  detailContent.classList.remove('hidden');

  detailTitle.textContent = `${item.CITY} · ${item.WAY}`;
  detailId.textContent = `#${item.ID}`;
  detailCity.textContent = item.CITY || '-';
  detailWay.textContent = item.WAY || '-';
  detailStart.textContent = item.START || '-';
  detailEnd.textContent = item.END || '-';
  detailSpecial.textContent = item.SPECIAL && item.SPECIAL !== '无' ? item.SPECIAL : '无';

  const t1 = formatTimeDisplay(item.TIMEONE);
  detailTime1.innerHTML = '';
  if (t1.length > 0) {
    t1.forEach(t => { const chip = document.createElement('span'); chip.className = 'detail-time-chip'; chip.textContent = t; detailTime1.appendChild(chip); });
  } else if (item.TIMEONE === 'Remove') {
    detailTime1.innerHTML = '<span class="detail-time-chip">线路已撤销</span>';
  } else {
    detailTime1.innerHTML = '<span class="detail-time-chip">未填写或无发车班次</span>';
  }

  const t2 = formatTimeDisplay(item.TIMETWO);
  detailTime2.innerHTML = '';
  if (t2.length > 0) {
    t2.forEach(t => { const chip = document.createElement('span'); chip.className = 'detail-time-chip'; chip.textContent = t; detailTime2.appendChild(chip); });
  } else if (item.TIMETWO === 'Remove') {
    detailTime2.innerHTML = '<span class="detail-time-chip">线路已撤销</span>';
  } else {
    detailTime2.innerHTML = '<span class="detail-time-chip">未填写或无发车班次</span>';
  }

  detailStarttime.textContent = (!item.STARTTIME || item.STARTTIME === '1000-1-1') ? '执行时间未知' : item.STARTTIME;
  detailWriter.textContent = item.WRITER_NAME || item.WRITER || '未知';
  detailWritetime.textContent = item.WRITETIME || '未知';

  // BACK 列：1 表示被驳回（兼容历史数据中的 '时刻表被驳回' 文本值）
  const isRejected = Number(item.BACK) === 1 || item.BACK === '时刻表被驳回';

  if (item.PASS == true) {
    detailPassStatus.textContent = '已审核';
    detailPassStatus.style.color = 'var(--success)';
    detailPasser.textContent = item.PASSER || '管理员';
  } else if (isRejected) {
    detailPassStatus.textContent = '被驳回';
    detailPassStatus.style.color = 'var(--danger)';
    detailPasser.textContent = item.PASSER || '管理员';
  } else {
    detailPassStatus.textContent = '待审核';
    detailPassStatus.style.color = 'var(--warning)';
    detailPasser.textContent = '—';
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

backBtn.addEventListener('click', () => window.location.href = '/admin-review.html');
detailBackBtn.addEventListener('click', () => window.location.href = '/admin-review.html');
detailRetryBtn.addEventListener('click', loadDetail);

loadDetail();
