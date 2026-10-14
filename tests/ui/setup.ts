import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
const storage = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key), clear: () => storage.clear() } });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); });
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
class TestPointerEvent extends MouseEvent {
  pointerType: string; pointerId: number;
  constructor(type: string, options: PointerEventInit = {}) { super(type, options); this.pointerType = options.pointerType || 'mouse'; this.pointerId = options.pointerId || 1; }
}
window.PointerEvent = TestPointerEvent as typeof PointerEvent;
HTMLElement.prototype.setPointerCapture = () => {};
HTMLElement.prototype.releasePointerCapture = () => {};
window.matchMedia = () => ({ matches: false, media: '', onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false });
