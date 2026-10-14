import React from 'react';
import { act, fireEvent, render, renderHook as rtlRenderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useDirectory, invalidateDirectories } from '../../src/features/files/hooks/useDirectory';
import { useFileSelection } from '../../src/features/files/hooks/useFileSelection';
import { useFileClipboard } from '../../src/features/files/hooks/useFileOperations';
import FileArea from '../../src/features/files/components/FileArea';
import { Sheet } from '../../src/components/ui/surfaces';
import { parseShellRoute, shellRouteUrl } from '../../src/hooks/useShellNavigation';
import type { FileItem } from '../../src/types';
import ServerDataProvider from '../../src/providers/ServerDataProvider';
const renderHook: typeof rtlRenderHook = (hook: any, options?: any) => rtlRenderHook(hook, { ...options, wrapper: ServerDataProvider }) as any;

const items: FileItem[] = ['alpha.txt', 'bravo.txt', 'charlie.txt'].map(name => ({ id: name, name, type: 'text', size: '1 B', updatedAt: '2026-01-01' }));
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
const response = (names: string[]) => ({ ok: true, json: async () => names.map(name => ({ name, path: name, size: 1, modified: '2026-01-01' })) }) as Response;
function pane(overrides: Partial<React.ComponentProps<typeof FileArea>> = {}) {
  return { files: items, selectedFileId: items[0].id, setSelectedFileId: vi.fn(), selectedIds: new Set([items[0].id]), onSelectFile: vi.fn(), onClearSelection: vi.fn(), onSelectAll: vi.fn(), onFileDoubleClick: vi.fn(), onDeleteFile: vi.fn(), onDeleteMany: vi.fn(), onRenameFile: vi.fn(), onUploadFiles: vi.fn(), viewMode: 'grid' as const, currentPath: ['Root'], ...overrides };
}
afterEach(() => vi.useRealTimers());
describe('directory state', () => {
  it('hides old items immediately and ignores an out-of-order response', async () => {
    const a = deferred<Response>(), b = deferred<Response>();
    vi.stubGlobal('fetch', vi.fn((url: string) => url.includes('%2Frace-a') ? a.promise : b.promise));
    const { result, rerender } = renderHook(({ path }) => useDirectory(path), { initialProps: { path: '/race-a' } });
    rerender({ path: '/race-b' });
    expect(result.current.files).toEqual([]);
    await act(async () => b.resolve(response(['bravo.txt'])));
    await waitFor(() => expect(result.current.files[0]?.name).toBe('bravo.txt'));
    await act(async () => a.resolve(response(['alpha.txt'])));
    expect(result.current.files[0].name).toBe('bravo.txt');
  });
  it('renders cached destinations immediately and invalidates them after mutation', async () => {
    const fetcher = vi.fn(async () => response(['cached.txt'])); vi.stubGlobal('fetch', fetcher);
    const { result, rerender } = renderHook(({ path }) => useDirectory(path), { initialProps: { path: '/cached' } });
    await waitFor(() => expect(result.current.files.length).toBe(1));
    rerender({ path: '/another' }); await waitFor(() => expect(result.current.status).toBe('ready'));
    rerender({ path: '/cached' }); expect(result.current.files[0]?.name).toBe('cached.txt');
    expect(fetcher).toHaveBeenCalledTimes(2);
    act(() => invalidateDirectories('/cached'));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
  });
  it('distinguishes a failed listing from an empty directory', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 403, json: async () => ({ error: 'Permission denied' }) })));
    const { result } = renderHook(() => useDirectory('/denied'));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('Permission denied');
  });
});
describe('selection and clipboard', () => {
  it('uses ordered range selection, additive toggles, and clears on navigation', () => {
    const { result, rerender } = renderHook(({ path }) => useFileSelection(items, path), { initialProps: { path: '/' } });
    act(() => result.current.handleSelectFile(items[0]));
    act(() => result.current.handleSelectFile(items[2], { shiftKey: true }));
    expect([...result.current.selectedIds]).toEqual(items.map(item => item.id));
    act(() => result.current.handleSelectFile(items[1], { ctrlKey: true }));
    expect(result.current.selectedIds.has(items[1].id)).toBe(false);
    rerender({ path: '/other' }); expect(result.current.selectedIds.size).toBe(0);
  });
  it('takes an immutable clipboard snapshot independent of later selection changes', () => {
    const { result } = renderHook(useFileClipboard);
    const source = { ...items[0] };
    act(() => result.current[1]({ action: 'copy', items: [source] })); source.name = 'changed';
    expect(result.current[0]?.items[0].name).toBe('alpha.txt');
    expect(Object.isFrozen(result.current[0]?.items)).toBe(true);
    act(() => result.current[1](null));
  });
});
describe('file interaction', () => {
  it('scopes shortcuts away from inactive panes, inputs, and dialogs', () => {
    const props = pane(); const { rerender } = render(<div inert><FileArea {...props}/></div>);
    fireEvent.keyDown(document.body, { key: 'a', ctrlKey: true }); expect(props.onSelectAll).not.toHaveBeenCalled();
    rerender(<div><input aria-label="Editing"/><FileArea {...props}/></div>);
    fireEvent.keyDown(screen.getByLabelText('Editing'), { key: 'Delete' }); expect(props.onDeleteMany).not.toHaveBeenCalled();
    fireEvent.keyDown(document.body, { key: 'a', ctrlKey: true }); expect(props.onSelectAll).toHaveBeenCalledOnce();
    rerender(<div><FileArea {...props}/><Sheet title="Another operation" onClose={() => {}}>Dialog</Sheet></div>);
    fireEvent.keyDown(document.body, { key: 'Delete' }); expect(props.onDeleteMany).not.toHaveBeenCalled();
  });
  it('copies the full selection and does not delete on plain Backspace', () => {
    const setClipboard = vi.fn(); const props = pane({ selectedIds: new Set(items.map(item => item.id)), setClipboard }); render(<FileArea {...props}/>);
    fireEvent.keyDown(document.body, { key: 'c', ctrlKey: true }); expect(setClipboard.mock.calls[0][0].items).toHaveLength(3);
    fireEvent.keyDown(document.body, { key: 'Backspace' }); expect(props.onDeleteMany).not.toHaveBeenCalled();
    fireEvent.keyDown(document.body, { key: 'Delete' }); expect(props.onDeleteMany).toHaveBeenCalledWith(items.map(item => item.id));
  });
  it('opens on touch tap, selects on long-press, and cancels long-press on scroll', () => {
    vi.useFakeTimers(); const props = pane({ selectedIds: new Set(), selectedFileId: null, onSelectionMode: vi.fn() }); render(<FileArea {...props}/>);
    const item = screen.getByRole('option', { name: 'alpha.txt' });
    fireEvent.pointerDown(item, { pointerType: 'touch', clientX: 10, clientY: 10 }); fireEvent.pointerUp(item); fireEvent.click(item);
    expect(props.onFileDoubleClick).toHaveBeenCalledOnce();
    fireEvent.pointerDown(item, { pointerType: 'touch', clientX: 10, clientY: 10 }); act(() => vi.advanceTimersByTime(450)); fireEvent.pointerUp(item); fireEvent.click(item);
    expect(props.onSelectionMode).toHaveBeenCalledWith(true); expect(props.onSelectFile).toHaveBeenCalledWith(items[0], { ctrlKey: true }); expect(props.onFileDoubleClick).toHaveBeenCalledOnce();
    vi.mocked(props.onSelectFile!).mockClear(); fireEvent.pointerDown(item, { pointerType: 'touch', clientX: 10, clientY: 10 }); fireEvent.pointerMove(item, { pointerType: 'touch', clientX: 10, clientY: 30 }); act(() => vi.advanceTimersByTime(500)); expect(props.onSelectFile).not.toHaveBeenCalled();
  });
  it('bounds rendered items in a 10,000-file listing', () => {
    const files = Array.from({ length: 10000 }, (_, index) => ({ ...items[0], id: `file-${index}`, name: `file-${index}` })); render(<FileArea {...pane({ files })}/>);
    expect(screen.getAllByRole('option').length).toBeLessThan(100);
  });
});
it('round-trips paths and app detail search state through public URLs', () => {
  const route = { view: 'app-store', filePath: '/', storeCategory: 'Media & Tools', storeQuery: 'a+b', storeApp: 'app/special', settingsTab: 'overview' };
  expect(parseShellRoute(new URL(shellRouteUrl(route), 'http://homios.test'))).toEqual(route);
  const files = { ...route, view: 'files', filePath: '/Photos/Family #1', storeCategory: 'Discover', storeQuery: '', storeApp: null };
  expect(parseShellRoute(new URL(shellRouteUrl(files), 'http://homios.test'))).toEqual(files);
});
