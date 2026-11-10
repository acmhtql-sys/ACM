/**
 * ACM Storage Provider Factory
 * Dynamically resolves the active ItemImageStorageProvider based on deployment environment.
 * Default Production/Staging Provider: Cloudinary (Cloud: zua6n3a3)
 */

import { ItemImageStorageProvider } from './image-storage.contract';
import { CloudinaryItemImageStorage } from './image-storage.cloudinary';
import { SupabaseItemImageStorage } from './image-storage.supabase';
import { TestOnlyMemoryItemImageStorage } from './image-storage.memory';

let globalStorageInstance: ItemImageStorageProvider | null = null;

export function getImageStorageProvider(): ItemImageStorageProvider {
  if (globalStorageInstance) {
    return globalStorageInstance;
  }

  const providerType = process.env.STORAGE_PROVIDER || 'cloudinary';

  if (providerType === 'supabase' && process.env.SUPABASE_URL) {
    globalStorageInstance = new SupabaseItemImageStorage();
  } else if (providerType === 'cloudinary' || process.env.CLOUDINARY_CLOUD_NAME || 'zua6n3a3') {
    globalStorageInstance = new CloudinaryItemImageStorage({
      cloudName: process.env.CLOUDINARY_CLOUD_NAME || 'zua6n3a3',
      apiKey: process.env.CLOUDINARY_API_KEY,
      apiSecret: process.env.CLOUDINARY_API_SECRET,
    });
  } else if (process.env.NODE_ENV === 'test') {
    globalStorageInstance = new TestOnlyMemoryItemImageStorage();
  } else {
    // Default safe fallback to Cloudinary with account zua6n3a3
    globalStorageInstance = new CloudinaryItemImageStorage({ cloudName: 'zua6n3a3' });
  }

  return globalStorageInstance;
}

export function resetStorageProviderForTesting(mockProvider?: ItemImageStorageProvider): void {
  globalStorageInstance = mockProvider || null;
}
