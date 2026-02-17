import { createHmac } from 'crypto';

type AccessPayload = {
  sub: string;
  role: string;
  typ: 'access';
  exp: number;
};

function base64UrlEncode(input: string) {
  return Buffer.from(input).toString('base64url');
}

function base64UrlDecode(input: string) {
  return Buffer.from(input, 'base64url').toString('utf8');
}

function getSecret() {
  return process.env.JWT_SECRET ?? 'dev-secret-change-me';
}

export function signAccessToken(payload: Omit<AccessPayload, 'typ' | 'exp'>, ttlSeconds: number) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const body: AccessPayload = {
    ...payload,
    typ: 'access',
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedBody = base64UrlEncode(JSON.stringify(body));
  const signature = createHmac('sha256', getSecret())
    .update(`${encodedHeader}.${encodedBody}`)
    .digest('base64url');
  return `${encodedHeader}.${encodedBody}.${signature}`;
}

export function verifyAccessToken(token: string): AccessPayload {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid token');
  const [encodedHeader, encodedBody, signature] = parts;
  const expected = createHmac('sha256', getSecret())
    .update(`${encodedHeader}.${encodedBody}`)
    .digest('base64url');
  if (expected !== signature) throw new Error('Invalid token signature');
  const payload = JSON.parse(base64UrlDecode(encodedBody)) as AccessPayload;
  if (payload.typ !== 'access') throw new Error('Invalid token type');
  if (payload.exp < Math.floor(Date.now() / 1000)) throw new Error('Token expired');
  return payload;
}
