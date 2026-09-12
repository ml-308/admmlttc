/**
 * src/utils/role.js
 * ─────────────────────────────────────────────────────────────
 * 身份（`USER.adm` 列）→ 显示文案与样式类的统一映射。
 *
 * 取值约定：
 *   · `adm`     → 管理员（绿色文字）
 *   · `station` → 站长（紫底白字）
 *   · 其他/空   → 普通用户（灰色文字）
 *
 * 样式类定义见 `style/index.css` 的「身份标签」一节。
 */

/**
 * @typedef {object} RoleInfo
 * @property {'admin'|'station'|'user'} key 身份标识
 * @property {string} text 展示文案
 * @property {string} className 标签样式类
 */

/** 管理员身份信息 */
const ROLE_ADMIN = { key: 'admin', text: '管理员', className: 'role-badge role-admin' };

/** 站长身份信息 */
const ROLE_STATION = { key: 'station', text: '站长', className: 'role-badge role-station' };

/** 普通用户身份信息 */
const ROLE_USER = { key: 'user', text: '普通用户', className: 'role-badge role-user' };

/**
 * 根据 `USER.adm` 的值解析身份信息。
 * @param {unknown} adm USER.adm 列的值
 * @returns {RoleInfo}
 */
export function getRoleInfo(adm) {
  const value = String(adm ?? '').trim().toLowerCase();
  if (value === 'adm') return ROLE_ADMIN;
  if (value === 'station') return ROLE_STATION;
  return ROLE_USER;
}
