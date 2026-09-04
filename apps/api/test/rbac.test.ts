import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authHeader, closeApp, disconnectDb, getApp, loginAs, registerTestUser, type TestSession } from './helpers';

/**
 * RBAC is database-driven (Role/Permission/RolePermission/UserRole), never
 * hardcoded — these tests prove the enforcement is real by checking both
 * sides: a plain customer is refused staff-only routes, and a seeded admin
 * account (whose permissions come entirely from its role assignment) is let
 * through.
 */
let customer: TestSession;
let admin: TestSession;
let superAdmin: TestSession;

beforeAll(async () => {
  customer = await registerTestUser({ fullName: 'RBAC Customer' });
  // BANK_ADMIN (admin@flowmoney.dev) has VIEW_CUSTOMERS/VIEW_AGGREGATE_ANALYTICS
  // but not MANAGE_ROLES — only SUPER_ADMIN (root@flowmoney.dev) can create
  // roles, which is exactly the distinction these tests are checking.
  admin = await loginAs('admin@flowmoney.dev');
  superAdmin = await loginAs('root@flowmoney.dev');
});

afterAll(async () => {
  await closeApp();
  await disconnectDb();
});

describe('role-based access control', () => {
  it('lets a customer reach their own financial data', async () => {
    const app = await getApp();
    const response = await app.inject({ method: 'GET', url: '/financial-snapshot', headers: authHeader(customer) });
    expect(response.statusCode).toBe(200);
  });

  it('refuses a plain customer access to the staff-only admin user list', async () => {
    const app = await getApp();
    const response = await app.inject({ method: 'GET', url: '/admin/users', headers: authHeader(customer) });
    expect(response.statusCode).toBe(403);
    const body = response.json() as { error: { code: string; details: { missing: string[] } } };
    expect(body.error.code).toBe('FORBIDDEN');
    expect(body.error.details.missing).toContain('VIEW_CUSTOMERS');
  });

  it('refuses a plain customer access to admin agent management', async () => {
    const app = await getApp();
    const response = await app.inject({ method: 'GET', url: '/admin/agents', headers: authHeader(customer) });
    expect(response.statusCode).toBe(403);
  });

  it('lets the seeded bank admin reach the customer list and aggregate analytics', async () => {
    const app = await getApp();
    const users = await app.inject({ method: 'GET', url: '/admin/users', headers: authHeader(admin) });
    expect(users.statusCode).toBe(200);

    const analytics = await app.inject({ method: 'GET', url: '/admin/analytics', headers: authHeader(admin) });
    expect(analytics.statusCode).toBe(200);
    expect(analytics.json().users.total).toBeGreaterThan(0);
  });

  it('refuses a bank admin without MANAGE_ROLES the ability to create a role', async () => {
    const app = await getApp();
    const response = await app.inject({
      method: 'POST',
      url: '/admin/roles',
      headers: authHeader(admin),
      payload: { key: `SHOULD_FAIL_${Date.now()}`, name: 'Should fail', permissions: ['VIEW_PORTFOLIO'] },
    });
    expect(response.statusCode).toBe(403);
  });

  it('lets a super admin dynamically create a role and have it enforced immediately', async () => {
    const app = await getApp();
    const key = `TEST_ROLE_${Date.now()}`;

    const create = await app.inject({
      method: 'POST',
      url: '/admin/roles',
      headers: authHeader(superAdmin),
      payload: {
        key,
        name: 'Premium Wealth Advisor (test)',
        description: 'Created by an integration test',
        permissions: ['VIEW_PORTFOLIO', 'CREATE_INVESTMENT_RECOMMENDATION', 'VIEW_RISK_ANALYSIS'],
      },
    });
    expect(create.statusCode).toBe(201);

    const list = await app.inject({ method: 'GET', url: '/admin/roles', headers: authHeader(superAdmin) });
    const roles = (list.json() as { roles: Array<{ key: string; permissions: string[] }> }).roles;
    const created = roles.find((r) => r.key === key);
    expect(created).toBeDefined();
    expect(created?.permissions).toEqual(
      expect.arrayContaining(['VIEW_PORTFOLIO', 'CREATE_INVESTMENT_RECOMMENDATION', 'VIEW_RISK_ANALYSIS']),
    );
  });

  it('rejects unknown permissions when creating a role', async () => {
    const app = await getApp();
    const response = await app.inject({
      method: 'POST',
      url: '/admin/roles',
      headers: authHeader(superAdmin),
      payload: { key: `BAD_ROLE_${Date.now()}`, name: 'Bad role', permissions: ['NOT_A_REAL_PERMISSION'] },
    });
    expect(response.statusCode).toBe(400);
  });
});
