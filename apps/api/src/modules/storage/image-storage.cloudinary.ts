/**
 * ACM Cloud Storage Provider: Cloudinary CDN Integration
 * Target: Cloudinary Media CDN (Cloud: zua6n3a3)
 * Implements: ItemImageStorageProvider
 * 
 * Capabilities:
 *   - Native fetch + crypto implementation (Zero unneeded external dependencies)
 *   - Strict MIME, magic-bytes, filename, and 5MB payload validation (validateItemImage)
 *   - Cryptographic signature generation (SHA-1) for authenticated Cloudinary REST API
 *   - Item-isolated folder hierarchy (acm_items/{itemId}/{imageId})
 *   - Optimized CDN transformations (f_auto, q_auto, c_limit, w_800, h_800)
 *   - Rollback / deletion support via Cloudinary destroy endpoint
 *   - SHA-256 integrity check and audit correlation
 */

import { createHash, randomUUID } from 'node:crypto';
import {
  AllowedImageMime,
  ItemImageRead,
  ItemImageStorageProvider,
  ItemImageUpload,
  StoredItemImage,
  validateItemImage,
} from './image-storage.contract';

export interface CloudinaryStorageConfig {
  cloudName: string;
  apiKey?: string;
  apiSecret?: string;
  folder?: string;
  fetchFn?: typeof fetch;
}

export class CloudinaryStorageError extends Error {
  readonly statusCode: number;
  constructor(message: string, statusCode = 500) {
    super(message);
    this.name = 'CloudinaryStorageError';
    this.statusCode = statusCode;
  }
}

export class CloudinaryItemImageStorage implements ItemImageStorageProvider {
  readonly cloudName: string;
  private readonly apiKey?: string;
  private readonly apiSecret?: string;
  private readonly folder: string;
  private readonly fetchFn: typeof fetch;

  // Metadata cache for audit records and instant lookup
  private readonly metadataStore = new Map<string, StoredItemImage>();
  private readonly contentCache = new Map<string, Uint8Array>();

  constructor(config?: Partial<CloudinaryStorageConfig>) {
    this.cloudName = config?.cloudName || process.env.CLOUDINARY_CLOUD_NAME || 'zua6n3a3';
    this.apiKey = config?.apiKey || process.env.CLOUDINARY_API_KEY;
    this.apiSecret = config?.apiSecret || process.env.CLOUDINARY_API_SECRET;
    this.folder = config?.folder || process.env.CLOUDINARY_FOLDER || 'acm_items';
    this.fetchFn = config?.fetchFn || globalThis.fetch;
  }

  /**
   * Generates SHA-1 signature for Cloudinary API requests.
   * Parameters must be sorted alphabetically by key.
   */
  generateSignature(params: Record<string, string | number>): string {
    if (!this.apiSecret) {
      throw new CloudinaryStorageError('CLOUDINARY_API_SECRET is required to sign upload requests', 500);
    }
    const sortedKeys = Object.keys(params).sort();
    const serialized = sortedKeys
      .filter((k) => params[k] !== undefined && params[k] !== '')
      .map((k) => `${k}=${params[k]}`)
      .join('&');

    return createHash('sha1').update(`${serialized}${this.apiSecret}`).digest('hex');
  }

  /**
   * Generates public CDN delivery URL with optimal responsive transformations.
   */
  getDeliveryUrl(
    itemId: string,
    imageId: string,
    extension: string,
    transformations = 'f_auto,q_auto,c_limit,w_800,h_800'
  ): string {
    const ext = extension.startsWith('.') ? extension.slice(1) : extension;
    const publicId = `${this.folder}/${itemId}/${imageId}`;
    return `https://res.cloudinary.com/${this.cloudName}/image/upload/${transformations}/${publicId}.${ext}`;
  }

  /**
   * Saves and uploads an item image to Cloudinary.
   */
  async save(input: ItemImageUpload): Promise<StoredItemImage> {
    const { sha256 } = validateItemImage(input);
    const imageId = randomUUID();
    const timestamp = Math.floor(Date.now() / 1000);
    const publicId = imageId;
    const itemFolder = `${this.folder}/${input.itemId}`;

    const metadata: StoredItemImage = {
      id: imageId,
      itemId: input.itemId,
      uploadedById: input.uploadedById,
      originalName: input.originalName,
      mimeType: input.mimeType,
      byteLength: input.contents.byteLength,
      sha256,
      createdAt: new Date().toISOString(),
    };

    // If API credentials are configured, perform actual remote upload
    if (this.apiKey && this.apiSecret) {
      const signature = this.generateSignature({
        folder: itemFolder,
        public_id: publicId,
        timestamp,
      });

      const base64Data = Buffer.from(input.contents).toString('base64');
      const fileUri = `data:${input.mimeType};base64,${base64Data}`;

      const formData = new URLSearchParams();
      formData.append('file', fileUri);
      formData.append('api_key', this.apiKey);
      formData.append('timestamp', timestamp.toString());
      formData.append('public_id', publicId);
      formData.append('folder', itemFolder);
      formData.append('signature', signature);

      const endpoint = `https://api.cloudinary.com/v1_1/${this.cloudName}/image/upload`;
      const res = await this.fetchFn(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData.toString(),
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        throw new CloudinaryStorageError(
          `Cloudinary upload failed (HTTP ${res.status}): ${errorText}`,
          res.status >= 400 && res.status < 500 ? res.status : 502
        );
      }
    }

    // Persist metadata and local content cache for audit & verification
    const lookupKey = `${input.itemId}/${imageId}`;
    this.metadataStore.set(lookupKey, metadata);
    this.contentCache.set(lookupKey, input.contents);

    return metadata;
  }

  /**
   * Reads stored image bytes and metadata for an item.
   * Guarantees item-isolation: returns null if the image does not belong to itemId.
   */
  async readForItem(itemId: string, imageId: string): Promise<ItemImageRead | null> {
    const lookupKey = `${itemId}/${imageId}`;
    const metadata = this.metadataStore.get(lookupKey);
    if (!metadata || metadata.itemId !== itemId) {
      return null;
    }

    const cachedContents = this.contentCache.get(lookupKey);
    if (cachedContents) {
      return { metadata, contents: cachedContents };
    }

    // If content not in memory, fetch from CDN
    const ext = metadata.mimeType === 'image/png' ? 'png' : metadata.mimeType === 'image/webp' ? 'webp' : 'jpg';
    const cdnUrl = this.getDeliveryUrl(itemId, imageId, ext);
    const res = await this.fetchFn(cdnUrl);
    if (!res.ok) {
      return null;
    }

    const buffer = new Uint8Array(await res.arrayBuffer());
    return { metadata, contents: buffer };
  }

  /**
   * Deletes an image from Cloudinary and clears local caches.
   */
  async deleteForItem(itemId: string, imageId: string): Promise<boolean> {
    const lookupKey = `${itemId}/${imageId}`;
    const metadata = this.metadataStore.get(lookupKey);
    if (!metadata || metadata.itemId !== itemId) {
      return false;
    }

    if (this.apiKey && this.apiSecret) {
      const publicId = `${this.folder}/${itemId}/${imageId}`;
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = this.generateSignature({
        public_id: publicId,
        timestamp,
      });

      const formData = new URLSearchParams();
      formData.append('public_id', publicId);
      formData.append('api_key', this.apiKey);
      formData.append('timestamp', timestamp.toString());
      formData.append('signature', signature);

      const endpoint = `https://api.cloudinary.com/v1_1/${this.cloudName}/image/destroy`;
      const res = await this.fetchFn(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData.toString(),
      });

      if (!res.ok) {
        return false;
      }
    }

    this.metadataStore.delete(lookupKey);
    this.contentCache.delete(lookupKey);
    return true;
  }
}
