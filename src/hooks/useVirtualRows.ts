import { useEffect, useRef, useState } from "react";

/** A bounded DOM window. The spacer preserves scroll geometry and native scroll behavior. */
export function useVirtualRows(
  count: number,
  rowHeight: number,
  minColumnWidth = 0,
) {
  const ref = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ width: 800, height: 700, top: 0 });
  const hasItems = count > 0;
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() =>
        setViewport({
          width: node.clientWidth || 800,
          height: node.clientHeight || 700,
          top: node.scrollTop,
        }),
      );
    };
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    observer?.observe(node);
    node.addEventListener("scroll", measure, { passive: true });
    measure();
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      node.removeEventListener("scroll", measure);
    };
  }, [hasItems]);
  const columns = minColumnWidth
    ? Math.max(1, Math.floor(viewport.width / minColumnWidth))
    : 1;
  const rows = Math.ceil(count / columns);
  const startRow = Math.max(0, Math.floor(viewport.top / rowHeight) - 3);
  const endRow = Math.min(
    rows,
    Math.ceil((viewport.top + viewport.height) / rowHeight) + 3,
  );
  return {
    ref,
    columns,
    start: Math.min(count, startRow * columns),
    end: Math.min(count, endRow * columns),
    offset: startRow * rowHeight,
    totalHeight: rows * rowHeight,
    reveal: (index: number) => {
      const node = ref.current;
      if (!node) return;
      const top = Math.floor(index / columns) * rowHeight;
      if (top < node.scrollTop) node.scrollTop = top;
      else if (top + rowHeight > node.scrollTop + node.clientHeight)
        node.scrollTop = top + rowHeight - node.clientHeight;
    },
  };
}
