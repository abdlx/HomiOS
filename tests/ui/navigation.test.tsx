import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useShellNavigation } from '../../src/hooks/useShellNavigation';
describe('shell history', () => {
  it('hydrates a direct folder URL and restores app context after switching views', () => {
    window.history.replaceState({}, '', '/files?path=%2Fphotos%2Ffamily');
    const onView = vi.fn(); const { result } = renderHook(() => useShellNavigation('files', onView));
    expect(result.current.route.filePath).toBe('/photos/family');
    act(() => result.current.navigate({ view: 'app-store', storeCategory: 'Media', storeQuery: 'photos', storeApp: 'atlas' }));
    expect(window.location.search).toContain('app=atlas');
    act(() => result.current.navigate({ view: 'files' })); expect(result.current.route.filePath).toBe('/photos/family');
    act(() => result.current.navigate({ view: 'app-store' })); expect(result.current.route.storeQuery).toBe('photos'); expect(result.current.route.storeApp).toBe('atlas');
  });
  it('handles popstate without pushing another history entry', () => {
    window.history.replaceState({}, '', '/dashboard?view=app-store&app=atlas');
    const { result } = renderHook(() => useShellNavigation('desktop', () => {}));
    const push = vi.spyOn(window.history, 'pushState');
    act(() => { window.history.replaceState({}, '', '/settings?tab=appearance'); window.dispatchEvent(new PopStateEvent('popstate')); });
    expect(result.current.route.view).toBe('settings'); expect(result.current.route.settingsTab).toBe('appearance'); expect(push).not.toHaveBeenCalled();
  });
});
