import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

const app = createApp();

describe('Inventory Calculation API & Invariant Rules', () => {
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

  it('retrieves inventory balance list via GET /api/v1/inventory/balance', async () => {
    const res = await request(app).get('/api/v1/inventory/balance');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
  });
});
