import type { SpotPackage, SpotRequest } from '../engine/types';
import type { WorkerRequest, WorkerResponse } from './engine.worker';

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };
type Job = { type: 'generate'; req: SpotRequest } | { type: 'exploit'; spotId: string; req: SpotRequest; strategy: Float32Array };

/** Promise wrapper around two engine workers: one for user-facing work, one for prefetching. */
class EngineClient {
  private workers: Worker[] = [];
  private seq = 0;
  private pending = new Map<number, Pending>();

  private worker(lane: 0 | 1): Worker {
    if (!this.workers[lane]) {
      const w = new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e: MessageEvent<WorkerResponse>) => {
        const p = this.pending.get(e.data.id);
        if (!p) return;
        this.pending.delete(e.data.id);
        if (e.data.ok) p.resolve(e.data.value);
        else p.reject(new Error(e.data.error));
      };
      this.workers[lane] = w;
    }
    return this.workers[lane];
  }

  private call<T>(lane: 0 | 1, job: Job): Promise<T> {
    const id = ++this.seq;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.worker(lane).postMessage({ ...job, id } as WorkerRequest);
    });
  }

  generate(req: SpotRequest, background = false): Promise<SpotPackage> {
    return this.call<SpotPackage>(background ? 1 : 0, { type: 'generate', req });
  }

  exploitability(spot: SpotPackage, strategy: Float32Array): Promise<number> {
    return this.call<number>(0, { type: 'exploit', spotId: spot.id, req: spot.request, strategy });
  }
}

export const engine = new EngineClient();

/** Small queue that keeps the next spot(s) solving in the background. */
export class SpotQueue {
  private queue: { req: SpotRequest; promise: Promise<SpotPackage> }[] = [];

  constructor(private nextRequest: () => SpotRequest) {}

  fill(n = 1): void {
    while (this.queue.length < n) {
      const req = this.nextRequest();
      const promise = engine.generate(req, true);
      promise.catch(() => undefined);
      this.queue.push({ req, promise });
    }
  }

  async next(): Promise<SpotPackage> {
    const item = this.queue.shift();
    const promise = item ? item.promise : engine.generate(this.nextRequest());
    try {
      return await promise;
    } catch {
      return engine.generate(this.nextRequest());
    }
  }

  clear(): void {
    this.queue = [];
  }
}
