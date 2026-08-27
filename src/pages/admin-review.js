// ─── 管理员时刻表审核页面（逐条审核工作流） ───────────────

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

const startReviewBtn = document.getElementById('startReviewBtn');
const reviewEntrance = document.getElementById('reviewEntrance');
const reviewWorkArea = document.getElementById('reviewWorkArea');
const reviewLoading = document.getElementById('reviewLoading');
const reviewEmpty = document.getElementById('reviewEmpty');
const reviewEmptyText = document.getElementById('reviewEmptyText');
const reviewBackBtn = document.getElementById('reviewBackBtn');
const reviewCard = document.getElementById('reviewCard');
const reviewProgress = document.getElementById('reviewProgress');
const approveBtn = document.getElementById('approveBtn');
const rejectBtn = document.getElementById('rejectBtn');

const reviewedList = document.getElementById('reviewedList');
const reviewedLoading = document.getElementById('reviewedLoading');
const reviewedEmpty = document.getElementById('reviewedEmpty');
const reviewedCount = document.getElementById('reviewedCount');

const reviewTitle = document.getElementById('reviewTitle');
const rvTime1 = document.getElementById('rvTime1');
const rvTime2 = document.getElementById('rvTime2');
const rvId = document.getElementById('rvId');
const rvCity = document.getElementById('rvCity');
const rvWay = document.getElementById('rvWay');
const rvStart = document.getElementById('rvStart');
const rvEnd = document.getElementById('rvEnd');
const rvSpecial = document.getElementById('rvSpecial');
const rvStartTime = document.getElementById('rvStartTime');
const rvWriter = document.getElementById('rvWriter');
const rvWriteTime = document.getElementById('rvWriteTime');

const adminEmail = sessionStorage.getItem('admin_email') || '';

// ─── 审核队列状态 ────────────────────────────
let reviewQueue = [];   // 待审核时刻表列表
let reviewIndex = 0;    // 当前展示下标
let processing = false; // 防止重复点击

// ─── 工具 ────────────────────────────────────
function showMessage(msg, isError) {
  const popup = document.createElement('div');
  popup.textContent = msg;
  popup.style.cssText = 'position:fixed; top:20px; left:50%; padding:10px 20px; border-radius:5px; z-index:9999; color:#fff; font-size:0.85rem; animation: fadeInOut 2s ease forwards; transform:translateX(-50%);';
  popup.style.backgroundColor = isError ? '#f44336' : '#4CAF50';
  document.body.appendChild(popup);
  setTimeout(() => popup.remove(), 2500);

  if (!document.getElementById('showMsgAnimStyles_admin')) {
    const ss = document.createElement('style');
    ss.id = 'showMsgAnimStyles_admin';
    ss.textContent = `@keyframes fadeInOut{0%{opacity:0;transform:translateX(-50%) translateY(-20px)}15%{opacity:1;transform:translateX(-50%) translateY(0)}85%{opacity:1;transform:translateX(-50%) translateY(0)}100%{opacity:0;transform:translateX(-50%) translateY(-20px)}}`;
    document.head.appendChild(ss);
  }
}

// ─── 渲染当前待审核时刻表详情（参考 mlttc 搜索详情页） ──
function renderTimeChips(container, timeStr) {
  container.innerHTML = '';
  if (timeStr === 'Remove') {
    container.innerHTML = '<span class="detail-time-chip">线路已撤销</span>';
    return;
  }
  if (!timeStr || timeStr === 'unknown') {
    container.innerHTML = '<span class="detail-time-chip">未填写或无发车班次</span>';
    return;
  }
  const parts = String(timeStr).split(/[\t\n\r]+/).map(t => t.trim()).filter(t => t);
  if (parts.length > 0) {
    parts.forEach(t => {
      const chip = document.createElement('span');
      chip.className = 'detail-time-chip';
      chip.textContent = t;
      container.appendChild(chip);
    });
  } else {
    container.innerHTML = '<span class="detail-time-chip">未填写或无发车班次</span>';
  }
}

function fillReviewItem(item) {
  reviewTitle.textContent = `${item.CITY || '未知'} · ${item.WAY || '未知'}`;
  rvId.textContent = '#' + item.ID;
  rvCity.textContent = item.CITY || '未知';
  rvWay.textContent = item.WAY || '未知';
  rvStart.textContent = item.START || '未知';
  rvEnd.textContent = item.END || '未知';
  rvSpecial.textContent = (item.SPECIAL && item.SPECIAL !== '无') ? item.SPECIAL : '无';
  rvStartTime.textContent = (!item.STARTTIME || item.STARTTIME === '1000-1-1') ? '执行时间未知' : item.STARTTIME;
  rvWriter.textContent = item.WRITER_NAME || item.WRITER || '未知';
  rvWriteTime.textContent = item.WRITETIME || '未知';
  // 发车时间（参考 mlttc 搜索详情页）
  renderTimeChips(rvTime1, item.TIMEONE);
  renderTimeChips(rvTime2, item.TIMETWO);
}

function showReviewItem() {
  reviewProgress.textContent = `第 ${reviewIndex + 1} 条 / 共 ${reviewQueue.length} 条`;
  fillReviewItem(reviewQueue[reviewIndex]);
  reviewLoading.classList.add('hidden');
  reviewEmpty.classList.add('hidden');
  reviewCard.classList.remove('hidden');
  approveBtn.disabled = false;
  rejectBtn.disabled = false;
}

function showEmpty(text) {
  reviewLoading.classList.add('hidden');
  reviewCard.classList.add('hidden');
  reviewEmptyText.textContent = text;
  reviewEmpty.classList.remove('hidden');
}

function backToEntrance() {
  reviewWorkArea.classList.add('hidden');
  reviewEntrance.classList.remove('hidden');
  reviewLoading.textContent = '加载中...';
  reviewLoading.classList.remove('hidden');
  reviewEmpty.classList.add('hidden');
  reviewCard.classList.add('hidden');
  reviewQueue = [];
  reviewIndex = 0;
  processing = false;
  // 审核后已审核列表可能变化，重新加载
  loadReviewed();
}

// ─── 已审核时刻表（卡片 + 删除按钮） ─────────
function createReviewedCard(item) {
  const card = document.createElement('div');
  card.className = 'result-item';
  card.dataset.id = item.ID;
  card.innerHTML = `
    <div class="result-item-header">
      <span class="result-item-id">#${item.ID}</span>
      <span class="result-item-route">${item.CITY || '?'} · ${item.WAY || '?'}</span>
    </div>
    <div class="result-item-body">
      <div class="result-item-stations">
        <span class="station-label">起点</span>
        <span class="station-name">${item.START || '?'}</span>
        <span class="station-arrow">→</span>
        <span class="station-label">终点</span>
        <span class="station-name">${item.END || '?'}</span>
      </div>
      ${item.SPECIAL && item.SPECIAL !== '无' ? `<div class="result-item-note">${item.SPECIAL}</div>` : ''}
      <div class="result-item-meta">
        <span>执行: ${(!item.STARTTIME || item.STARTTIME === '1000-1-1') ? '未知' : item.STARTTIME}</span>
        <span>作者: ${item.WRITER_NAME || item.WRITER || '未知'}</span>
        <span>写入: ${item.WRITETIME || '未知'}</span>
        <span>审核: ${item.PASSER || '管理员'}</span>
      </div>
    </div>
    <div class="result-item-actions" style="justify-content:flex-end;">
      <hcw-button class="reviewed-delete-btn" variant="danger" flat style="min-width:4rem; font-size:0.82rem;">删除</hcw-button>
    </div>
  `;
  card.querySelector('.reviewed-delete-btn').addEventListener('click', e => {
    e.stopPropagation();
    deleteReviewedItem(item);
  });
  card.addEventListener('click', () => { window.location.href = `/admin-detail.html?id=${encodeURIComponent(item.ID)}`; });
  return card;
}

function loadReviewed() {
  reviewedLoading.classList.remove('hidden');
  reviewedEmpty.classList.add('hidden');
  reviewedList.innerHTML = '';
  fetch('/api/admin', { credentials: 'include' })
    .then(res => res.json().catch(() => ({})))
    .then(json => {
      reviewedLoading.classList.add('hidden');
      const reviewed = (json.success && Array.isArray(json.reviewed)) ? json.reviewed : [];
      reviewedCount.textContent = reviewed.length + ' 条';
      if (reviewed.length === 0) {
        reviewedEmpty.classList.remove('hidden');
        return;
      }
      reviewed.forEach(item => reviewedList.appendChild(createReviewedCard(item)));
    })
    .catch(() => {
      reviewedLoading.classList.add('hidden');
      reviewedLoading.textContent = '加载失败，请重试';
    });
}

async function deleteReviewedItem(item) {
  if (!confirm(`确认永久删除已审核时刻表 #${item.ID}？此操作不可撤销。`)) return;
  if (!confirm(`再次确认：删除 ${item.CITY} ${item.WAY}？`)) return;
  try {
    const res = await fetch('/api/admin', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: item.ID })
    });
    if (!res.ok) { const d = await res.json().catch(() => ({})); showMessage(d.message || d.error || '删除失败', true); return; }
    showMessage('已删除', false);
    loadReviewed();
  } catch { showMessage('网络错误', true); }
}

function nextReview() {
  reviewIndex++;
  if (reviewIndex >= reviewQueue.length) {
    showEmpty('所有待审核时刻表已处理完毕');
  } else {
    showReviewItem();
  }
  processing = false;
}

// ─── 开始审核：加载并逐条展示未审核时刻表 ─────
startReviewBtn.addEventListener('click', async () => {
  reviewEntrance.classList.add('hidden');
  reviewWorkArea.classList.remove('hidden');
  reviewCard.classList.add('hidden');
  reviewEmpty.classList.add('hidden');
  reviewLoading.classList.remove('hidden');
  reviewLoading.textContent = '加载中...';

  try {
    const res = await fetch('/api/admin', { credentials: 'include' });
    const json = await res.json().catch(() => ({}));
    const unreviewed = (res.ok && json.success) ? (json.unreviewed || []) : [];

    if (unreviewed.length === 0) {
      showEmpty('暂无待审核时刻表');
    } else {
      reviewQueue = unreviewed;
      reviewIndex = 0;
      showReviewItem();
    }
  } catch (e) {
    console.error('加载审核数据失败:', e);
    reviewLoading.textContent = '加载失败，请重试';
    showMessage('加载数据失败', true);
  }
});

// ─── 通过 ────────────────────────────────────
approveBtn.addEventListener('click', async () => {
  if (processing) return;
  processing = true;
  approveBtn.disabled = true;
  rejectBtn.disabled = true;

  const item = reviewQueue[reviewIndex];
  if (!item) { processing = false; return; }

  try {
    const res = await fetch('/api/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: item.ID, passer: adminEmail, pass: 1 })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      showMessage(data.error || '操作失败', true);
      processing = false;
      approveBtn.disabled = false;
      rejectBtn.disabled = false;
      return;
    }
    showMessage('已通过', false);
    nextReview();
  } catch {
    showMessage('网络错误', true);
    processing = false;
    approveBtn.disabled = false;
    rejectBtn.disabled = false;
  }
});

// ─── 驳回 ────────────────────────────────────
rejectBtn.addEventListener('click', async () => {
  if (processing) return;
  processing = true;
  approveBtn.disabled = true;
  rejectBtn.disabled = true;

  const item = reviewQueue[reviewIndex];
  if (!item) { processing = false; return; }

  try {
    const res = await fetch('/api/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: item.ID, passer: adminEmail, action: 'reject' })
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      showMessage(d.error || '操作失败', true);
      processing = false;
      approveBtn.disabled = false;
      rejectBtn.disabled = false;
      return;
    }
    showMessage('已驳回', false);
    nextReview();
  } catch {
    showMessage('网络错误', true);
    processing = false;
    approveBtn.disabled = false;
    rejectBtn.disabled = false;
  }
});

// ─── 无待审核 / 处理完毕 → 返回时刻表审核页面 ──
reviewBackBtn.addEventListener('click', backToEntrance);

// ─── 导航 ────────────────────────────────────
backBtn.addEventListener('click', () => window.location.href = '/admin.html');

logoutBtn.addEventListener('click', () => {
  sessionStorage.removeItem('admin_logged_in');
  sessionStorage.removeItem('admin_token');
  sessionStorage.removeItem('admin_email');
  window.location.href = '/admin-login.html';
});

// ─── 初始加载：展示已审核时刻表 ──────────────
loadReviewed();
