/// <reference lib="webworker" />
import { computeRouteVariants, computeFallbackRoute } from './routeVariants';
import type { OptimizedRoute, LatLon } from './routeOptimizer';

interface RequestMessage {
  runId: number;
  dep: LatLon;
  arr: LatLon;
}

type ResponseMessage =
  | { type: 'variant'; runId: number; id: string; info: OptimizedRoute }
  | { type: 'done'; runId: number };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (event: MessageEvent<RequestMessage>) => {
  const { runId, dep, arr } = event.data;

  const emitted = computeRouteVariants(dep, arr, (id, info) => {
    const msg: ResponseMessage = { type: 'variant', runId, id, info };
    ctx.postMessage(msg);
  });

  // Guarantee at least one route is shown, even if nothing was emitted.
  if (emitted === 0) {
    const info = computeFallbackRoute(dep, arr);
    const msg: ResponseMessage = { type: 'variant', runId, id: 'optimal', info };
    ctx.postMessage(msg);
  }

  const done: ResponseMessage = { type: 'done', runId };
  ctx.postMessage(done);
};
