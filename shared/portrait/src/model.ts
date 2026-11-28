/**
 * MODNet portrait matting (Apache-2.0), ONNX export from Xenova/modnet, pinned to one revision.
 * The same network runs on the server (fp32: lighter on memory in WebAssembly) and in the
 * browser (fp16: half the download, same masks).
 */
const REVISION = 'fa2fa546052fba4c08921230a26cc69a333fca12';
const BASE = `https://huggingface.co/Xenova/modnet/resolve/${REVISION}/onnx`;

export const PORTRAIT_MODELS = {
  fp32: { file: 'modnet.onnx', url: `${BASE}/model.onnx`, sha256: '07c308cf0fc7e6e8b2065a12ed7fc07e1de8febb7dc7839d7b7f15dd66584df9', bytes: 25_888_640 },
  fp16: { file: 'modnet-fp16.onnx', url: `${BASE}/model_fp16.onnx`, sha256: '25f165da9bfd30830a575f1f0490f1acd995975cb349bc02f3d79332e1fe5cf6', bytes: 12_984_781 },
} as const;
export type PortraitModelVariant = keyof typeof PORTRAIT_MODELS;

/** Shorter side of the network input; both sides are multiples of 32. */
export const INPUT_SHORT_EDGE = 512;

/** Network input size for a photo of `width` × `height`. */
export function inputSize(width: number, height: number): { width: number; height: number } {
  const scale = INPUT_SHORT_EDGE / Math.min(width, height);
  const round = (value: number) => Math.max(32, Math.round((value * scale) / 32) * 32);
  return { width: round(width), height: round(height) };
}

/**
 * NCHW float tensor data from RGBA pixels, resized to the input size with bilinear sampling
 * and normalised to [-1, 1] as MODNet expects.
 */
export function toInputTensor(rgba: Uint8Array | Uint8ClampedArray, width: number, height: number): { data: Float32Array; width: number; height: number } {
  const size = inputSize(width, height);
  const { width: W, height: H } = size;
  const plane = W * H;
  const data = new Float32Array(3 * plane);
  const sx = width / W;
  const sy = height / H;
  for (let y = 0; y < H; y++) {
    const fy = Math.min(height - 1, Math.max(0, (y + 0.5) * sy - 0.5));
    const y0 = Math.floor(fy);
    const y1 = Math.min(height - 1, y0 + 1);
    const wy = fy - y0;
    for (let x = 0; x < W; x++) {
      const fx = Math.min(width - 1, Math.max(0, (x + 0.5) * sx - 0.5));
      const x0 = Math.floor(fx);
      const x1 = Math.min(width - 1, x0 + 1);
      const wx = fx - x0;
      const a = (y0 * width + x0) * 4;
      const b = (y0 * width + x1) * 4;
      const c = (y1 * width + x0) * 4;
      const d = (y1 * width + x1) * 4;
      for (let ch = 0; ch < 3; ch++) {
        const top = rgba[a + ch]! * (1 - wx) + rgba[b + ch]! * wx;
        const bottom = rgba[c + ch]! * (1 - wx) + rgba[d + ch]! * wx;
        data[ch * plane + y * W + x] = (top * (1 - wy) + bottom * wy) / 127.5 - 1;
      }
    }
  }
  return { data, ...size };
}

/** Whatever runs the network: onnxruntime-web on the server or in the browser. */
export interface MattingModel {
  /** Alpha matte (0…1) of the input, `width` × `height`. */
  run(input: Float32Array, width: number, height: number): Promise<Float32Array>;
}
