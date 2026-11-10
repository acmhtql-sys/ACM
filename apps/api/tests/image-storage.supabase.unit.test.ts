import { describe, expect, it, vi, beforeEach } from 'vitest';
import { SupabaseItemImageStorage, ImageStorageIntegrityError, ImageStorageAccessDeniedError } from '../src/modules/storage/image-storage.supabase';
import { ItemImageUpload } from '../src/modules/storage/image-storage.contract';

describe('SupabaseItemImageStorage Unit Tests (STO-01 Hardened)', () => {
  const ITEM_ID = '11111111-1111-4111-8111-111111111111';
  const USER_ID = '22222222-2222-4222-8222-222222222222';

  // Valid 8-byte PNG header + 4 data bytes
  const VALID_PNG_BYTES = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);

  let storage: SupabaseItemImageStorage;

  beforeEach(() => {
    vi.restoreAllMocks();
    storage = new SupabaseItemImageStorage({
      supabaseUrl: 'https://test-project.supabase.co',
      serviceRoleKey: 'test-service-role-key',
      bucketName: 'item-images',
      isPrivateBucket: true,
    });
  });

  it('rejects upload with invalid magic bytes before network call', async () => {
    const invalidUpload: ItemImageUpload = {
      itemId: ITEM_ID,
      uploadedById: USER_ID,
      originalName: 'test.png',
      mimeType: 'image/png',
      contents: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
    };

    await expect(storage.save(invalidUpload)).rejects.toThrow('Chữ ký nội dung hình ảnh không khớp');
  });

  it('rejects upload exceeding 5MB limit', async () => {
    const hugeUpload: ItemImageUpload = {
      itemId: ITEM_ID,
      uploadedById: USER_ID,
      originalName: 'huge.png',
      mimeType: 'image/png',
      contents: new Uint8Array(6 * 1024 * 1024),
    };

    await expect(storage.save(hugeUpload)).rejects.toThrow('Kích thước hình ảnh không hợp lệ');
  });

  it('successfully uploads valid PNG and stores genuine metadata', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ Key: 'item-images/mock-key' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const validUpload: ItemImageUpload = {
      itemId: ITEM_ID,
      uploadedById: USER_ID,
      originalName: 'valid-resistor.png',
      mimeType: 'image/png',
      contents: VALID_PNG_BYTES,
    };

    const result = await storage.save(validUpload);

    expect(result.itemId).toBe(ITEM_ID);
    expect(result.uploadedById).toBe(USER_ID);
    expect(result.originalName).toBe('valid-resistor.png');
    expect(result.mimeType).toBe('image/png');
    expect(result.sha256).toHaveLength(64);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain('https://test-project.supabase.co/storage/v1/object/item-images/');
    expect(url).toContain(ITEM_ID);
    expect(options.method).toBe('POST');
    expect(options.headers.Authorization).toBe('Bearer test-service-role-key');
  });

  it('denies getPublicUrl when bucket is private and generates signed URL', async () => {
    expect(() => storage.getPublicUrl(ITEM_ID, 'image-abc', 'png')).toThrow(ImageStorageAccessDeniedError);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ signedURL: '/object/sign/item-images/signed-token' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const signedUrl = await storage.createSignedUrl(ITEM_ID, 'image-abc', 'png', 3600);
    expect(signedUrl).toContain('https://test-project.supabase.co/storage/v1/object/sign/item-images/signed-token');
  });

  it('detects byte corruption upon read and throws ImageStorageIntegrityError', async () => {
    // Save first to register metadata
    const fetchMockSave = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMockSave);

    const saved = await storage.save({
      itemId: ITEM_ID,
      uploadedById: USER_ID,
      originalName: 'sensor.png',
      mimeType: 'image/png',
      contents: VALID_PNG_BYTES,
    });

    // Mock read returning corrupted bytes (different checksum)
    const corruptedBytes = new Uint8Array([137, 80, 78, 71, 99, 99, 99, 99]);
    const fetchMockRead = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () => corruptedBytes.buffer,
    });
    vi.stubGlobal('fetch', fetchMockRead);

    await expect(storage.readForItem(ITEM_ID, saved.id)).rejects.toThrow(ImageStorageIntegrityError);
  });

  it('deletes stored image and cleans up metadata', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    });
    vi.stubGlobal('fetch', fetchMock);

    const deleted = await storage.deleteForItem(ITEM_ID, 'image-to-delete');
    expect(deleted).toBe(true);
    expect(fetchMock).toHaveBeenCalled();
  });

  it('safely handles rollback on failure without throwing', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('Network error'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(storage.rollbackUpload(ITEM_ID, 'rollback-image')).resolves.not.toThrow();
  });
});
