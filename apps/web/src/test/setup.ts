import * as workerThreads from 'node:worker_threads';

// Polyfill for markAsUncloneable when running undici / jsdom on Node environments
if (typeof (workerThreads as any).markAsUncloneable !== 'function') {
  (workerThreads as any).markAsUncloneable = (val: any) => val;
}
