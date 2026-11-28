/// <reference lib="webworker" />
import { findSilhouette, PORTRAIT_MODELS, type Silhouette } from '@px/portrait';
import type { InferenceSession } from 'onnxruntime-web';

/**
 * Finds the person on a photo off the main thread: MODNet (fp16) on onnxruntime-web, WebAssembly,
 * one thread. The model (~13 MB) and the runtime (~11 MB, ~3 MB compressed) load on first use and
 * stay cached by the browser. Messages in: warm | trace; out: progress | result | error.
 */
export type MattingRequest = { type: 'warm' } | { type: 'trace'; id: number; rgba: ArrayBuffer; width: number; height: number };
export type MattingResponse =
  | { type: 'progress'; share: number }
  | { type: 'result'; id: number; silhouette: Silhouette | null }
  | { type: 'error'; id?: number; message: string };

declare const self: DedicatedWorkerGlobalScope;
const MODEL = PORTRAIT_MODELS.fp16;
const MODEL_URL = `/models/modnet-fp16-${MODEL.sha256.slice(0, 8)}.onnx`;
const ORT_VERSION = '1.22.0';

type Ort = typeof import('onnxruntime-web/wasm');
let ready: Promise<{ ort: Ort; session: InferenceSession }> | undefined;

const post = (message: MattingResponse) => self.postMessage(message);

function load() {
  ready ??= (async () => {
    const ort = await import('onnxruntime-web/wasm');
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.wasmPaths = `/vendor/ort-${ORT_VERSION}/`;
    const bytes = await download(MODEL_URL, MODEL.bytes);
    const session = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'] });
    return { ort, session };
  })();
  ready.catch(() => (ready = undefined));
  return ready;
}

async function download(url: string, expected: number): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error(`Модель не загрузилась (${response.status})`);
  const total = Number(response.headers.get('content-length')) || expected;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    post({ type: 'progress', share: Math.min(1, received / total) });
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

self.onmessage = async (event: MessageEvent<MattingRequest>) => {
  const message = event.data;
  if (message.type === 'warm') {
    load().catch((error: unknown) => post({ type: 'error', message: String(error) }));
    return;
  }
  try {
    const { ort, session } = await load();
    const silhouette = await findSilhouette(
      {
        run: async (input, width, height) => {
          const output = await session.run({ [session.inputNames[0]!]: new ort.Tensor('float32', input, [1, 3, height, width]) });
          return output[session.outputNames[0]!]!.data as Float32Array;
        },
      },
      new Uint8ClampedArray(message.rgba),
      message.width,
      message.height,
    );
    post({ type: 'result', id: message.id, silhouette });
  } catch (error) {
    post({ type: 'error', id: message.id, message: error instanceof Error ? error.message : String(error) });
  }
};
