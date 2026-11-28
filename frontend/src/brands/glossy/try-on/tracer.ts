import type { Silhouette } from '@px/portrait';
import type { MattingRequest, MattingResponse } from './matting.worker';

/** Main-thread side of the matting worker: one worker per page, created on first need. */
export class PortraitTracer {
  private worker: Worker | undefined;
  private readonly calls = new Map<number, { resolve: (s: Silhouette | null) => void; reject: (e: Error) => void }>();
  private nextId = 0;

  constructor(private readonly onProgress: (share: number) => void) {}

  /** Starts downloading the model (e.g. when the visitor reaches for the button). */
  warm() {
    this.send({ type: 'warm' });
  }

  trace(preview: ImageData): Promise<Silhouette | null> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.calls.set(id, { resolve, reject });
      const rgba = preview.data.buffer.slice(0) as ArrayBuffer;
      this.send({ type: 'trace', id, rgba, width: preview.width, height: preview.height }, [rgba]);
    });
  }

  dispose() {
    this.worker?.terminate();
    this.worker = undefined;
  }

  private send(message: MattingRequest, transfer: Transferable[] = []) {
    if (!this.worker) {
      this.worker = new Worker(new URL('./matting.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (event: MessageEvent<MattingResponse>) => this.receive(event.data);
      this.worker.onerror = (event) => this.failAll(new Error(event.message || 'Ошибка обработки фото'));
    }
    this.worker.postMessage(message, transfer);
  }

  private receive(message: MattingResponse) {
    if (message.type === 'progress') return this.onProgress(message.share);
    if (message.id === undefined) return message.type === 'error' ? this.failAll(new Error(message.message)) : undefined;
    const call = this.calls.get(message.id);
    this.calls.delete(message.id);
    if (message.type === 'result') call?.resolve(message.silhouette);
    else call?.reject(new Error(message.message));
  }

  private failAll(error: Error) {
    for (const call of this.calls.values()) call.reject(error);
    this.calls.clear();
  }
}
