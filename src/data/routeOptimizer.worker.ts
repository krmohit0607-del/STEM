/// <reference lib="webworker" />
import { computeRouteVariants, computeFallbackRoute } from './routeVariants';
import type { OptimizedRoute, LatLon, OptimizeOptions } from './routeOptimizer';

interface RequestMessage {
  runId: number;
  dep: LatLon;
  arr: LatLon;
  /** Minimum charted depth (m), voyage date (ISO) and vessel DWT — see `OptimizeOptions`. */
  minDepthM?: number;
  voyageDateIso?: string;
  vesselDwt?: number;
}

type ResponseMessage =
  | { type: 'variant'; runId: number; id: string; info: OptimizedRoute }
  | { type: 'done'; runId: number };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (event: MessageEvent<RequestMessage>) => {
  const { runId, dep, arr, minDepthM, voyageDateIso, vesselDwt } = event.data;
  const extraOptions: OptimizeOptions = {
    minDepthM,
    voyageDate: voyageDateIso ? new Date(voyageDateIso) : undefined,
    vesselDwt,
  };

  const emitted = computeRouteVariants(dep, arr, (id, info) => {
    const msg: ResponseMessage = { type: 'variant', runId, id, info };
    ctx.postMessage(msg);
  }, extraOptions);

  // Guarantee at least one route is shown, even if nothing was emitted.
  if (emitted === 0) {
    const info = computeFallbackRoute(dep, arr, extraOptions);
    const msg: ResponseMessage = { type: 'variant', runId, id: 'optimal', info };
    ctx.postMessage(msg);
  }

  const done: ResponseMessage = { type: 'done', runId };
  ctx.postMessage(done);
};
