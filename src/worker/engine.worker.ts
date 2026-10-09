/// <reference lib="webworker" />
import { exploitabilityGapPct, generateSpotWithContext, type SpotContext } from '../engine/spot';
import type { SpotRequest } from '../engine/types';

export type WorkerRequest =
  | { id: number; type: 'generate'; req: SpotRequest }
  | { id: number; type: 'exploit'; spotId: string; req: SpotRequest; strategy: Float32Array };

export type WorkerResponse = { id: number; ok: true; value: unknown } | { id: number; ok: false; error: string };

const cache = new Map<string, SpotContext>();
const remember = (id: string, ctx: SpotContext) => {
  cache.delete(id);
  cache.set(id, ctx);
  while (cache.size > 8) cache.delete(cache.keys().next().value as string);
};

const ctxFor = (spotId: string, req: SpotRequest): SpotContext => {
  const hit = cache.get(spotId);
  if (hit) return hit;
  const { spot, ctx } = generateSpotWithContext(req);
  remember(spot.id, ctx);
  return ctx;
};

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  try {
    if (msg.type === 'generate') {
      const { spot, ctx } = generateSpotWithContext(msg.req);
      remember(spot.id, ctx);
      (self as unknown as Worker).postMessage({ id: msg.id, ok: true, value: spot } satisfies WorkerResponse);
    } else {
      const value = exploitabilityGapPct(ctxFor(msg.spotId, msg.req), msg.strategy);
      (self as unknown as Worker).postMessage({ id: msg.id, ok: true, value } satisfies WorkerResponse);
    }
  } catch (err) {
    (self as unknown as Worker).postMessage({ id: msg.id, ok: false, error: err instanceof Error ? err.message : String(err) } satisfies WorkerResponse);
  }
};
