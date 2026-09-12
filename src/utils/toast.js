/**
 * src/utils/toast.js
 * ─────────────────────────────────────────────────────────────
 * 顶部居中轻提示（Toast）。
 *
 * 原先这段逻辑被复制到 8 个页面脚本里，现统一到本模块，
 * 样式与动画关键帧只注入一次（id 去重），避免重复插入 <style>。
 */

/** 动画样式节点 id（全站唯一，重复调用不会重复注入） */
const TOAST_STYLE_ID = 'hcw-toast-anim';

/** 默认展示时长（毫秒） */
const DEFAULT_DURATION = 2500;

/**
 * 注入淡入淡出动画关键帧（仅第一次调用时真正插入）。
 * @returns {void}
 */
function ensureAnimationStyle() {
  if (document.getElementById(TOAST_STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = TOAST_STYLE_ID;
  style.textContent = '@keyframes fadeInOut{0%{opacity:0;transform:translateX(-50%) translateY(-20px)}15%{opacity:1;transform:translateX(-50%) translateY(0)}85%{opacity:1;transform:translateX(-50%) translateY(0)}100%{opacity:0;transform:translateX(-50%) translateY(-20px)}}';
  document.head.appendChild(style);
}

/**
 * 显示一条轻提示。
 * @param {string} msg 提示文案
 * @param {boolean} [isError=false] true 显示红色（失败），false 显示绿色（成功）
 * @param {object} [options] 可选配置
 * @param {number} [options.duration=2500] 展示时长（毫秒）
 * @param {string|null} [options.errorBoxId=null] 同时写入页内提示元素的 id（如登录/注册页的 `errormsg`）
 * @returns {void}
 */
export function showMessage(msg, isError = false, options = {}) {
  const { duration = DEFAULT_DURATION, errorBoxId = null } = options;

  // 兼容需要页内文字提示的页面（登录/注册表单）
  if (errorBoxId) {
    const box = document.getElementById(errorBoxId);
    if (box) {
      box.textContent = msg;
      box.style.display = 'block';
      box.style.color = isError ? 'red' : 'green';
    }
  }

  ensureAnimationStyle();

  const popup = document.createElement('div');
  popup.textContent = msg;
  popup.style.cssText = 'position:fixed; top:20px; left:50%; padding:10px 20px; border-radius:5px; z-index:9999; color:#fff; font-size:0.85rem; animation: fadeInOut 2s ease forwards; transform:translateX(-50%);';
  popup.style.backgroundColor = isError ? '#f44336' : '#4CAF50';
  document.body.appendChild(popup);

  setTimeout(() => popup.remove(), duration);
}
