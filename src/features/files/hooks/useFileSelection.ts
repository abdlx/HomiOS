import { useCallback, useEffect, useRef, useState } from "react";
import type { FileItem } from "../../../types";
export type SelectionModifiers = {
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
};
export function useFileSelection(items: FileItem[], path: string) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const anchor = useRef<string | null>(null);
  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setSelectedFileId(null);
    anchor.current = null;
  }, []);
  useEffect(clearSelection, [path, clearSelection]);
  useEffect(() => {
    const ids = new Set(items.map((item) => item.id));
    setSelectedIds((current) => {
      const next = new Set([...current].filter((id) => ids.has(id)));
      return next.size === current.size ? current : next;
    });
    setSelectedFileId((current) =>
      current && ids.has(current) ? current : null,
    );
  }, [items]);
  const handleSelectFile = (
    file: FileItem,
    modifiers: SelectionModifiers = {},
  ) => {
    const additive = modifiers.ctrlKey || modifiers.metaKey;
    if (modifiers.shiftKey && anchor.current) {
      const start = items.findIndex((item) => item.id === anchor.current);
      const end = items.findIndex((item) => item.id === file.id);
      if (start >= 0 && end >= 0) {
        const range = items.slice(
          Math.min(start, end),
          Math.max(start, end) + 1,
        );
        setSelectedIds(
          (previous) =>
            new Set([
              ...(additive ? previous : []),
              ...range.map((item) => item.id),
            ]),
        );
        setSelectedFileId(file.id);
        return;
      }
    }
    setSelectedIds((previous) => {
      const next = additive ? new Set(previous) : new Set<string>();
      if (additive && next.has(file.id)) next.delete(file.id);
      else next.add(file.id);
      return next;
    });
    setSelectedFileId(file.id);
    anchor.current = file.id;
  };
  const selectAll = () => {
    setSelectedIds(new Set(items.map((item) => item.id)));
    setSelectedFileId(items[0]?.id || null);
    anchor.current = items[0]?.id || null;
  };
  return {
    selectedIds,
    selectedFileId,
    setSelectedFileId,
    setSelectedIds,
    handleSelectFile,
    clearSelection,
    selectAll,
  };
}
