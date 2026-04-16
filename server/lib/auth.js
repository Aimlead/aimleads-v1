import crypto from 'node:crypto';

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;
const SESSION_COOKIE_NAME = 'aimleads_session';

const base64UrlEncode = (value) => Buffer.from(value).toString('base64url');
const base64UrlDecode = (value) => Buffer.from(value, 'base64url').toString('utf-8');

const hashPassword = (password, salt = crypto.randomBytes(16).toString('hex')) => {
  const digest = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${digest}`;
};

const verifyPassword = (password, storedHash) => {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, digest] = storedHash.split(':');
  const attempt = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(digest, 'hex'), Buffer.from(attempt, 'hex'));
};

const signToken = (payload, secret) => {
  const payloadEncoded = base64UrlEncode(JSON.stringify(payload));
  const signature = crypto.createHmac('sha256', secret).update(payloadEncoded).digest('base64url');
  return `${payloadEncoded}.${signature}`;
};

const verifyToken = (token, secret) => {
  if (!token || !token.includes('.')) return null;
  const [payloadEncoded, signature] = token.split('.');
  const expectedSignature = crypto.createHmac('sha256', secret).update(payloadEncoded).digest('base64url');

  const signatureBuffer = Buffer.from(signature || '', 'utf-8');
  const expectedBuffer = Buffer.from(expectedSignature, 'utf-8');

  if (signatureBuffer.length !== expectedBuffer.length) {
    return null;
  }

  if (!crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return null;
  }

  let payload;
  try {
    payload = JSON.parse(base64UrlDecode(payloadEncoded));
  } catch {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp < now) return null;

  return payload;
};

const createSessionToken = (userId, secret) => {
  const now = Math.floor(Date.now() / 1000);
  return signToken({ sub: userId, exp: now + TOKEN_TTL_SECONDS }, secret);
};

const sanitizeUser = (user) => {
  const { password_hash, ...safeUser } = user;
  return safeUser;
};

export {
  SESSION_COOKIE_NAME,
  TOKEN_TTL_SECONDS,
  createSessionToken,
  hashPassword,
  sanitizeUser,
  verifyPassword,
  verifyToken,
};
