// Backup files: plain JSON or password-encrypted (AES-256-GCM, key from PBKDF2-SHA256, 310k rounds).
// Encryption happens on-device with the browser's built-in WebCrypto. The password is never stored.
const ITER = 310000;
const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), c => c.charCodeAt(0));

async function deriveKey(password, salt) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

function chunkedB64(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); }

export async function makeBackup(data, password) {
  const json = JSON.stringify(data);
  if (!password) return JSON.stringify({ format: 'lifemanaged-backup', version: 1, encrypted: false, data }, null, 1);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(json)));
  return JSON.stringify({ format: 'lifemanaged-backup', version: 1, encrypted: true, kdf: 'PBKDF2-SHA256', iter: ITER, salt: b64(salt), iv: b64(iv), ct: chunkedB64(ct) });
}

export function isEncrypted(text) { try { return JSON.parse(text).encrypted === true; } catch { return false; } }

export async function readBackup(text, password) {
  let obj; try { obj = JSON.parse(text); } catch { throw new Error('That file is not a LifeManaged backup.'); }
  if (obj.format !== 'lifemanaged-backup') throw new Error('That file is not a LifeManaged backup.');
  if (!obj.encrypted) return obj.data;
  if (!password) throw new Error('This backup is password-protected.');
  const key = await deriveKey(password, unb64(obj.salt));
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(obj.iv) }, key, unb64(obj.ct));
    return JSON.parse(dec.decode(pt));
  } catch { throw new Error('Wrong password (or the file is damaged).'); }
}
