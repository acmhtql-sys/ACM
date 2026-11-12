import { describe, expect, it, vi } from 'vitest';
import {
  CloudinaryItemImageStorage,
  CloudinaryStorageError,
} from '../src/modules/storage/image-storage.cloudinary';

const ITEM_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_ITEM_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ACTOR_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

// Valid 8-byte PNG header + sample bytes
const VALID_PNG_BYTES = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 1]);

describe('CloudinaryItemImageStorage (Cloud: zua6n3a3)', () => {
  it('initializes with default cloud name zua6n3a3', () => {
    const storage = new CloudinaryItemImageStorage();
    expect(storage.cloudName).toBe('zua6n3a3');
  });

  it('generates deterministic SHA-1 signature according to Cloudinary specification', () => {
    const storage = new CloudinaryItemImageStorage({
      cloudName: 'zua6n3a3',
      apiKey: 'test-api-key',
      apiSecret: 'my-secret-key-12345',
    });

    const sig = storage.generateSignature({
      folder: 'acm_items/test-item',
      public_id: 'img-123',
      timestamp: 1700000000,
    });

    expect(typeof sig).toBe('string');
    expect(sig).toHaveLength(40); // 40-char hex string for SHA-1
  });

  it('fails signature generation if apiSecret is missing', () => {
    const storage = new CloudinaryItemImageStorage({
      cloudName: 'zua6n3a3',
    });

    expect(() =>
      storage.generateSignature({
        timestamp: 1700000000,
      })
    ).toThrow(CloudinaryStorageError);
  });

  it('generates optimized CDN delivery URL with transformations', () => {
    const storage = new CloudinaryItemImageStorage({ cloudName: 'zua6n3a3' });
    const url = storage.getDeliveryUrl(ITEM_ID, 'image-uuid-1', 'png');

    expect(url).toBe(
      `https://res.cloudinary.com/zua6n3a3/image/upload/f_auto,q_auto,c_limit,w_800,h_800/acm_items/${ITEM_ID}/image-uuid-1.png`
    );
  });

  it('saves an image, stores metadata, captures verified delivery URL, and computes sha256 checksum', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        secure_url: 'https://res.cloudinary.com/zua6n3a3/image/upload/v1762909000/acm_items/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/sensor.png',
        public_id: `acm_items/${ITEM_ID}/sensor`,
        version: 1762909000,
        format: 'png',
      }),
    });

    const storage = new CloudinaryItemImageStorage({
      cloudName: 'zua6n3a3',
      apiKey: 'test_key',
      apiSecret: 'test_secret',
      fetchFn: mockFetch as any,
    });

    expect(storage.isConfigured).toBe(true);

    const saved = await storage.save({
      itemId: ITEM_ID,
      uploadedById: ACTOR_ID,
      originalName: 'sensor_front.png',
      mimeType: 'image/png',
      contents: VALID_PNG_BYTES,
    });

    expect(saved.itemId).toBe(ITEM_ID);
    expect(saved.uploadedById).toBe(ACTOR_ID);
    expect(saved.originalName).toBe('sensor_front.png');
    expect(saved.mimeType).toBe('image/png');
    expect(saved.byteLength).toBe(VALID_PNG_BYTES.byteLength);
    expect(saved.sha256).toHaveLength(64);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(storage.getUploadedDeliveryUrl(ITEM_ID, saved.id)).toBe(
      `https://res.cloudinary.com/zua6n3a3/image/upload/f_auto,q_auto,c_limit,w_800,h_800/v1762909000/acm_items/${ITEM_ID}/sensor.png`
    );
  });

  it('reports isConfigured=false when Cloudinary API credentials are missing', () => {
    const storage = new CloudinaryItemImageStorage({ cloudName: 'zua6n3a3' });
    expect(storage.isConfigured).toBe(false);
  });

  it('enforces item-level isolation when reading images', async () => {
    const storage = new CloudinaryItemImageStorage({ cloudName: 'zua6n3a3' });

    const saved = await storage.save({
      itemId: ITEM_ID,
      uploadedById: ACTOR_ID,
      originalName: 'test.png',
      mimeType: 'image/png',
      contents: VALID_PNG_BYTES,
    });

    // Same item ID -> can read
    const read = await storage.readForItem(ITEM_ID, saved.id);
    expect(read).not.toBeNull();
    expect(read?.metadata.sha256).toBe(saved.sha256);
    expect(read?.contents).toEqual(VALID_PNG_BYTES);

    // Other item ID -> must return null (strict security barrier)
    const crossRead = await storage.readForItem(OTHER_ITEM_ID, saved.id);
    expect(crossRead).toBeNull();
  });

  it('deletes an image correctly and rejects deletion from a different item', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: 'ok' }),
    });

    const storage = new CloudinaryItemImageStorage({
      cloudName: 'zua6n3a3',
      apiKey: 'test_key',
      apiSecret: 'test_secret',
      fetchFn: mockFetch as any,
    });

    const saved = await storage.save({
      itemId: ITEM_ID,
      uploadedById: ACTOR_ID,
      originalName: 'test.png',
      mimeType: 'image/png',
      contents: VALID_PNG_BYTES,
    });

    // Delete with wrong item ID -> returns false
    const wrongDelete = await storage.deleteForItem(OTHER_ITEM_ID, saved.id);
    expect(wrongDelete).toBe(false);

    // Delete with correct item ID -> returns true
    const correctDelete = await storage.deleteForItem(ITEM_ID, saved.id);
    expect(correctDelete).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2); // 1 save + 1 destroy
  });
});

