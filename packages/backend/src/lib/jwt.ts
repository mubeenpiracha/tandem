import { SignJWT, jwtVerify, type JWTPayload } from 'jose';

const ACCESS_TOKEN_EXPIRY = '15m';
const MIN_SECRET_LENGTH = 32;

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not set');
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`JWT_SECRET must be at least ${MIN_SECRET_LENGTH} characters`);
  }
  return new TextEncoder().encode(secret);
}

export interface AccessTokenPayload {
  sub: string;
  email: string;
  email_verified: boolean;
}

export interface PurposeTokenPayload extends JWTPayload {
  sub: string;
  purpose: string;
}

export async function signAccessToken(
  userId: string,
  email: string,
  emailVerified: boolean,
): Promise<string> {
  const secret = getSecret();
  return new SignJWT({ email, email_verified: emailVerified })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_EXPIRY)
    .sign(secret);
}

export async function verifyAccessToken(token: string): Promise<AccessTokenPayload> {
  const secret = getSecret();
  const { payload } = await jwtVerify(token, secret);
  return {
    sub: payload.sub as string,
    email: payload['email'] as string,
    email_verified: payload['email_verified'] as boolean,
  };
}

export async function signPurposeToken(
  data: { sub: string; purpose: string },
  expiresIn: string,
): Promise<string> {
  const secret = getSecret();
  return new SignJWT({ purpose: data.purpose })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(data.sub)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secret);
}

export async function verifyPurposeToken(
  token: string,
  expectedPurpose: string,
): Promise<PurposeTokenPayload> {
  const secret = getSecret();
  const { payload } = await jwtVerify(token, secret);
  if (payload['purpose'] !== expectedPurpose) {
    throw new Error(`Invalid token purpose: expected "${expectedPurpose}"`);
  }
  return payload as PurposeTokenPayload;
}
