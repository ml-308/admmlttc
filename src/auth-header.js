/**
 * src/auth-header.js
 * ─────────────────────────────────────────────────────────────
 * 管理端头部公共脚本（所有管理页以 `<script type="module">` 引入）。
 *
 * 职责：深/浅色主题的初始化与切换（跟随系统偏好 + localStorage 记忆）。
 * 说明：本仓库是管理员站点，登录/退出统一由页面脚本通过 `src/core/auth.js` 处理，
 *       因此不再包含主站的用户登录态、昵称 Cookie、跳转个人主页等逻辑。
 */

// ========== 深色/浅色主题切换 ==========

/**
 * 获取当前有效的主题
 * 优先使用 data-theme 属性，否则检测系统偏好
 */
function getEffectiveTheme() {
  const html = document.documentElement;
  const attr = html.getAttribute('data-theme');
  if (attr === 'dark' || attr === 'light') return attr;
  // 未设置属性时，跟随系统
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * 应用主题
 * @param {'dark'|'light'} theme
 */
function applyTheme(theme) {
  const html = document.documentElement;
  html.setAttribute('data-theme', theme);
  localStorage.setItem('mlttc-theme', theme);
  updateToggleButtonIcon(theme);
}

/**
 * 更新切换按钮图标
 */
function updateToggleButtonIcon(theme) {
  const btn = document.getElementById('themeToggleBtn');
  if (!btn) return;
  btn.textContent = theme === 'dark' ? '☀️' : '🌙';
  btn.setAttribute('aria-label', theme === 'dark' ? '切换到浅色模式' : '切换到深色模式');
}

/**
 * 初始化主题（从 localStorage 恢复，或跟随系统）
 */
function initTheme() {
  const saved = localStorage.getItem('mlttc-theme');
  if (saved === 'dark' || saved === 'light') {
    applyTheme(saved);
  } else {
    // 跟随系统
    const sys = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    applyTheme(sys);
  }
}

/**
 * 绑定主题切换按钮
 */
function bindThemeToggle() {
  const btn = document.getElementById('themeToggleBtn');
  if (!btn) return;

  btn.addEventListener('click', () => {
    const current = getEffectiveTheme();
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    // 添加旋转动画
    btn.classList.add('spinning');
    setTimeout(() => btn.classList.remove('spinning'), 400);
  });
}

// 监听系统主题变化（仅在用户未手动设置时跟随）
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
  if (!localStorage.getItem('mlttc-theme')) {
    applyTheme(e.matches ? 'dark' : 'light');
  }
});

// ========== 自定义主题色（accent color） ==========
// 与主站（mlttc.bond）共享 localStorage 键 mlttc-accent：
//   同一浏览器访问主站与管理员站时，主题色自动保持一致。
// 恢复方式：向 html 内联写入一组 CSS 变量，覆盖 main.css 中 --primary 家族。

const ACCENT_STORAGE_KEY = 'mlttc-accent';

function hexToHsl(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h *= 60;
  }
  return { h, s, l };
}

function hslToHex(h, s, l) {
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const c = l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    return Math.round(255 * c).toString(16).padStart(2, '0');
  };
  return '#' + f(0) + f(8) + f(4);
}

function hexToRgba(hex, alpha) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 'rgba(29,185,84,' + alpha + ')';
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

function applyAccentColor(hex) {
  const html = document.documentElement;
  const clear = () => {
    ['--primary', '--primary-hl', '--primary-dark', '--primary-light',
     '--primary-bg', '--primary-surface', '--link-color', '--shadow-focus']
      .forEach((k) => html.style.removeProperty(k));
  };

  if (!hex) { clear(); return; }

  const hsl = hexToHsl(hex);
  if (!hsl) { clear(); return; }

  const hover = hslToHex(hsl.h, hsl.s, Math.min(1, hsl.l + 0.07));
  const pressed = hslToHex(hsl.h, hsl.s, Math.max(0, hsl.l - 0.08));
  const light = hslToHex(hsl.h, hsl.s, Math.min(1, hsl.l + 0.12));

  const set = (k, v) => html.style.setProperty(k, v);
  set('--primary', hex);
  set('--primary-hl', hover);
  set('--primary-dark', pressed);
  set('--primary-light', light);
  set('--primary-bg', hexToRgba(hex, 0.14));
  set('--primary-surface', hexToRgba(hex, 0.08));
  set('--link-color', hex);
  set('--shadow-focus', hexToRgba(hex, 0.30));
}

function initAccentColor() {
  const saved = localStorage.getItem(ACCENT_STORAGE_KEY);
  if (saved) applyAccentColor(saved);
}

// 页面加载完成后初始化主题
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  bindThemeToggle();
  initAccentColor();
});