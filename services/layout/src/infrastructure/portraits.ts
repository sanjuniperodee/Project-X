import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import type { Silhouette } from '@px/portrait';
import type { Logger } from '@px/service-kit';
import type { PortraitFinder } from '../application/ports';

/**
 * Portrait matting with MODNet on onnxruntime-web (WebAssembly: the release carries no native
 * addons). Runs in a worker thread started for the cover photos of one layout and terminated
 * by `release()`, so the model's memory is not held between layouts. ≈2 s per photo on one core.
 * Without the model file covers are laid out without the cut-out head.
 */
export class OnnxPortraitFinder implements PortraitFinder {
  private worker: Worker | undefined;
  private readonly pending = new Map<number, { resolve: (s: Silhouette | null) => void; reject: (e: Error) => void }>();
  private nextId = 0;
  private warned = false;

  constructor(
    private readonly modelPath: string | undefined,
    private readonly log: Logger,
  ) {}

  silhouette(jpeg: Uint8Array): Promise<Silhouette | null> {
    if (!this.modelPath || !existsSync(this.modelPath)) {
      if (!this.warned) this.log.warn({ modelPath: this.modelPath }, 'Portrait model not found: covers are laid out without the cut-out head');
      this.warned = true;
      return Promise.resolve(null);
    }
    const worker = this.start(this.modelPath);
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      worker.postMessage({ id, jpeg });
    });
  }

  async release(): Promise<void> {
    const worker = this.worker;
    this.worker = undefined;
    if (worker) await worker.terminate();
  }

  private start(modelPath: string): Worker {
    if (this.worker) return this.worker;
    // dist/portrait-worker.js next to the bundle; the TypeScript source in development (tsx).
    const file = import.meta.url.endsWith('.ts') ? './portrait-worker.ts' : './portrait-worker.js';
    const worker = new Worker(new URL(file, import.meta.url), { workerData: { modelPath } });
    worker.on('message', ({ id, silhouette, error }: { id: number; silhouette?: Silhouette | null; error?: string }) => {
      const call = this.pending.get(id);
      this.pending.delete(id);
      if (error) call?.reject(new Error(error));
      else call?.resolve(silhouette ?? null);
    });
    const fail = (error: Error) => {
      for (const call of this.pending.values()) call.reject(error);
      this.pending.clear();
      if (this.worker === worker) this.worker = undefined;
    };
    worker.on('error', fail);
    worker.on('exit', (code) => fail(new Error(`portrait worker exited (${code})`)));
    this.worker = worker;
    return worker;
  }
}

/** The model next to the bundle (dist/models) or, in development, in the shared package. */
export function defaultPortraitModel(): string | undefined {
  const candidates = [new URL('./models/modnet.onnx', import.meta.url), new URL('../../../../shared/portrait/models/modnet.onnx', import.meta.url)];
  return candidates.map((url) => fileURLToPath(url)).find((file) => existsSync(file));
}
