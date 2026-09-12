/**
 * functions/_lib/password.js
 * ─────────────────────────────────────────────────────────────
 * 密码哈希工具（注册 / 登录 / 管理员登录共用）。
 *
 * 算法：PBKDF2-SHA256，100000 次迭代，16 字节随机盐，派生 256 bit。
 * 存储格式：`<saltHex>:<hashHex>`（均为小写十六进制，无分隔空格）。
 *
 * 注意：算法参数一旦改动，已注册用户的密码将无法验证，
 * 如需升级请保留旧格式兼容分支后再切换。
 */

/** PBKDF2 迭代次数（与历史数据保持一致，勿随意修改） */
export const PBKDF2_ITERATIONS = 100000;

/** 盐长度（字节） */
export const SALT_BYTES = 16;

/** 派生位数（bit） */
export const DERIVED_BITS = 256;

/**
 * 将 Uint8Array 转为十六进制字符串。
 * @param {Uint8Array} bytes
 * @returns {string}
 */
function toHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 用 PBKDF2 从密码派生哈希。
 * @param {string} password 明文密码
 * @param {Uint8Array} salt 盐
 * @returns {Promise<string>} 十六进制哈希
 */
async function deriveHash(password, salt) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const derivedBits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    key,
    DERIVED_BITS
  );
  return toHex(new Uint8Array(derivedBits));
}

/**
 * 生成密码哈希（注册、修改密码时使用）。
 * @param {string} password 明文密码
 * @returns {Promise<string>} `<saltHex>:<hashHex>`
 */
export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hashHex = await deriveHash(password, salt);
  return `${toHex(salt)}:${hashHex}`;
}

/**
 * 校验密码是否与存储的哈希匹配（登录时使用）。
 * @param {string} password 明文密码
 * @param {string} storedValue 存储值 `<saltHex>:<hashHex>`
 * @returns {Promise<boolean>} 是否匹配
 */
export async function verifyPassword(password, storedValue) {
  // 存储值缺失或格式错误时直接判定失败，避免抛异常（历史上会导致 500）
  if (typeof storedValue !== 'string') return false;

  const [saltHex, originalHashHex] = storedValue.split(':');
  if (!saltHex || !originalHashHex) return false;

  const saltMatches = saltHex.match(/.{1,2}/g);
  if (!saltMatches) return false;

  const salt = new Uint8Array(saltMatches.map(byte => parseInt(byte, 16)));
  const hashHex = await deriveHash(password, salt);
  return hashHex === originalHashHex;
}
