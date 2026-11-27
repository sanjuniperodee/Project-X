import type { Readable } from 'node:stream';

export interface StoredObject {
  stream: Readable;
  size: number;
}

/**
 * Object storage port. `LocalDiskStorage` is used in development and single-node setups;
 * an S3-compatible driver (AWS, Yandex Object Storage, MinIO) implements the same interface.
 */
export interface Storage {
  put(key: string, data: Readable): Promise<number>;
  get(key: string): Promise<StoredObject | null>;
  ping(): Promise<void>;
}
