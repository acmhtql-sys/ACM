import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

const app = createApp();

describe('Inventory Calculation API & Invariant Rules', () => {
  let adminToken = '';
  let studentToken = '';

  beforeAll(async () => {
    const adminRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@acm.local', password: 'ACM@dev2026!' });
    if (adminRes.status === 200) {
      adminToken = adminRes.body.data.token;
    }

    const studentRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'student@acm.local', password: 'ACM@dev2026!' });
    if (studentRes.status === 200) {
      studentToken = studentRes.body.data.token;
    }
  });

  it('correctly calculates Available = OnHand - Reserved - Quarantined - KitAllocated via POST /api/v1/inventory/calculate', async () => {
    const payload = {
      onHand: 100,
      reserved: 20,
      quarantined: 5,
      kitAllocated: 15,
      borrowed: 30, // Must not be deducted twice
    };

    const res = await request(app)
      .post('/api/v1/inventory/calculate')
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.available).toBe(60);
    expect(res.body.data.borrowed).toBe(30);
  });

  it('retrieves inventory balance list via GET /api/v1/inventory/balance for authenticated ADMIN', async () => {
    const res = await request(app)
      .get('/api/v1/inventory/balance')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it('blocks unauthenticated access to GET /api/v1/inventory/balance with 401 Unauthorized', async () => {
    const res = await request(app).get('/api/v1/inventory/balance');

    expect(res.status).toBe(401);
  });

  it('forbids STUDENT from accessing GET /api/v1/inventory/balance with 403 Forbidden', async () => {
    const res = await request(app)
      .get('/api/v1/inventory/balance')
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(403);
  });
});
