export const MAP_CONTROL_OPEN_EVENT = 'fv-map-control-open';

export function notifyMapControlOpen(id: string): void {
  window.dispatchEvent(new CustomEvent(MAP_CONTROL_OPEN_EVENT, { detail: id }));
}
