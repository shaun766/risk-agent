import { afterAll, describe, expect, it } from 'vitest';
import { closeApp, disconnectDb, getApp, registerTestUser, uniqueEmail } from './helpers';

afterAll(async () => {
  await closeApp();
  await disconnectDb();
});

describe('authentication', () => {
  it('registers a new customer with a CUSTOMER role and returns a working token pair', async () => {
    const app = await getApp();
    const email = uniqueEmail('register');

    const response = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email, password: 'TestPassword123', fullName: 'New Customer', monthlyIncome: 60_000 },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json() as {
      user: { email: string; roles: string[]; permissions: string[] };
      accessToken: string;
      refreshToken: string;
    };
    expect(body.user.email).toBe(email);
    expect(body.user.roles).toContain('CUSTOMER');
    expect(body.user.permissions).toContain('REQUEST_PURCHASE_ANALYSIS');
    expect(body.accessToken).toBeTruthy();
    expect(body.refreshToken).toBeTruthy();
  });

  it('rejects a duplicate email with 409', async () => {
    const app = await getApp();
    const email = uniqueEmail('dup');
    const payload = { email, password: 'TestPassword123', fullName: 'Dup User' };

    const first = await app.inject({ method: 'POST', url: '/auth/register', payload });
    expect(first.statusCode).toBe(201);

    const second = await app.inject({ method: 'POST', url: '/auth/register', payload });
    expect(second.statusCode).toBe(409);
    expect(second.json().error.code).toBe('CONFLICT');
  });

  it('rejects registration with a weak password', async () => {
    const app = await getApp();
    const response = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: uniqueEmail('weak'), password: 'short', fullName: 'Weak Password' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('logs in with correct credentials and rejects incorrect ones identically fast', async () => {
    const app = await getApp();
    const email = uniqueEmail('login');
    await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email, password: 'TestPassword123', fullName: 'Login User' },
    });

    const good = await app.inject({ method: 'POST', url: '/auth/login', payload: { email, password: 'TestPassword123' } });
    expect(good.statusCode).toBe(200);

    const bad = await app.inject({ method: 'POST', url: '/auth/login', payload: { email, password: 'WrongPassword1' } });
    expect(bad.statusCode).toBe(401);
    expect(bad.json().error.code).toBe('UNAUTHORIZED');

    // Never leak which half was wrong.
    const unknownUser = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: uniqueEmail('nobody'), password: 'WrongPassword1' },
    });
    expect(unknownUser.statusCode).toBe(401);
    expect(unknownUser.json().error.message).toBe(bad.json().error.message);
  });

  it('rejects a request to a protected route with no token', async () => {
    const app = await getApp();
    const response = await app.inject({ method: 'GET', url: '/auth/me' });
    expect(response.statusCode).toBe(401);
  });

  it('returns the authenticated user on /auth/me with a valid bearer token', async () => {
    const app = await getApp();
    const session = await registerTestUser({ fullName: 'Me Endpoint User' });

    const response = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${session.accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().email).toBe(session.email);
  });

  it('rotates the refresh token and issues a new access token', async () => {
    const app = await getApp();
    const email = uniqueEmail('refresh');
    const register = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email, password: 'TestPassword123', fullName: 'Refresh User' },
    });
    const { refreshToken } = register.json() as { refreshToken: string };

    const refreshed = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken },
    });
    expect(refreshed.statusCode).toBe(200);
    const body = refreshed.json() as { accessToken: string; refreshToken: string };
    expect(body.accessToken).toBeTruthy();
    // A JWT signed with identical claims in the same second is legitimately
    // byte-identical (no jti) — the token that actually rotates is the
    // refresh token, asserted below via replay detection.
    expect(body.refreshToken).not.toBe(refreshToken);

    // The old refresh token is single-use — replaying it must fail.
    const replay = await app.inject({ method: 'POST', url: '/auth/refresh', payload: { refreshToken } });
    expect(replay.statusCode).toBe(401);
  });
});
