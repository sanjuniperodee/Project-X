import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parentPort, workerData } from 'node:worker_threads';
import { findSilhouette } from '@px/portrait';
import jpeg from 'jpeg-js';
import * as ort from 'onnxruntime-web';

/**
 * Worker thread running MODNet. The WebAssembly heap (~250 MB with the model) belongs to this
 * thread and goes back to the system when the layout service terminates it after the cover.
 * Messages: { id, jpeg } → { id, silhouette } | { id, error }.
 */
const { modelPath } = workerData as { modelPath: string };

ort.env.wasm.numThreads = 1;
// The bundle carries the runtime next to it (dist/ort); in development it resolves from node_modules.
const wasmDir = new URL('./ort/', import.meta.url);
if (existsSync(fileURLToPath(new URL('ort-wasm-simd-threaded.wasm', wasmDir)))) ort.env.wasm.wasmPaths = wasmDir.href;
const session = ort.InferenceSession.create(readFileSync(modelPath));

parentPort!.on('message', async ({ id, jpeg: data }: { id: number; jpeg: Uint8Array }) => {
  try {
    const model = await session;
    const image = jpeg.decode(data, { useTArray: true, formatAsRGBA: true, maxResolutionInMP: 4 });
    const silhouette = await findSilhouette(
      {
        run: async (input, width, height) => {
          const output = await model.run({ [model.inputNames[0]!]: new ort.Tensor('float32', input, [1, 3, height, width]) });
          return output[model.outputNames[0]!]!.data as Float32Array;
        },
      },
      image.data,
      image.width,
      image.height,
    );
    parentPort!.postMessage({ id, silhouette });
  } catch (error) {
    parentPort!.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
});
