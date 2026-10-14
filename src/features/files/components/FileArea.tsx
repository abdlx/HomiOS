import React, {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  Check,
  ChevronRight,
  Copy,
  Download,
  FileArchive,
  FileText,
  Folder,
  FolderInput,
  Image as ImageIcon,
  MoreHorizontal,
  Scissors,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import type { FileItem, ViewMode } from "../../../types";
import type { FileClipboard } from "../lib/files";
import { isCloudPath, normalizePath, partsPath } from "../lib/files";
import { collectDroppedFiles } from "../lib/dropped-files";
import { useDirectory } from "../hooks/useDirectory";
import { useVirtualRows } from "../../../hooks/useVirtualRows";
import {
  Button,
  EmptyState,
  ErrorPanel,
  IconButton,
  Skeleton,
} from "../../../components/ui/surfaces";
import ContextMenu from "./ContextMenu";
import LazyMediaThumbnail from "../../../components/LazyMediaThumbnail";
import { promptDialog, toast } from "../../../components/SystemUI";

interface FileAreaProps {
  isActive?: boolean;
  files: FileItem[];
  selectedFileId: string | null;
  setSelectedFileId: (id: string | null) => void;
  selectedIds?: Set<string>;
  onSelectFile?: (
    file: FileItem,
    modifiers?: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean },
  ) => void;
  onSetSelection?: (ids: Set<string>) => void;
  onClearSelection?: () => void;
  onSelectAll?: () => void;
  onFileDoubleClick: (file: FileItem) => void;
  onDeleteFile: (id: string) => void;
  onDeleteMany?: (ids: string[]) => void;
  onRenameFile: (id: string, name: string) => Promise<void> | void;
  onUploadFiles: (files: FileList | File[]) => void;
  viewMode: ViewMode;
  currentPath: string[];
  onUpdateMetadata?: (id: string, metadata: any) => void;
  clipboardState?: FileClipboard | null;
  setClipboard?: (clipboard: FileClipboard | null) => void;
  onAddNewFile?: (name: string, type: "document" | "text" | "image") => void;
  onAddNewFolder?: (name: string) => void;
  onShare?: (file: FileItem) => void;
  onPasteClipboard?: () => void;
  onMoveFilesToFolder?: (files: FileItem[], folder: FileItem) => void;
  onChooseDestination?: (action: "copy" | "move", items: FileItem[]) => void;
  onZip?: (files: FileItem[]) => void;
  onUnzip?: (file: FileItem) => void;
  onDownloadMany?: (files: FileItem[]) => void;
  onNavigatePath?: (path: string) => void;
  onBack?: () => void;
  onForward?: () => void;
  loading?: boolean;
  refreshing?: boolean;
  error?: string;
  onRetry?: () => void;
  searchTerm?: string;
  selectionMode?: boolean;
  onSelectionMode?: (enabled: boolean) => void;
}
const scrollPositions = new Map<string, number>();
export function FileGlyph({
  file,
  large = false,
}: {
  file: FileItem;
  large?: boolean;
}) {
  const gradient = useId();
  if (file.thumbnailUrl)
    return (
      <div
        className={`${large ? "h-52 w-full" : "h-14 w-16"} overflow-hidden rounded-lg`}
      >
        <LazyMediaThumbnail
          src={file.thumbnailUrl}
          alt={file.name}
          type="image"
          className="h-full w-full"
          mediaClassName="h-full w-full object-contain"
        />
      </div>
    );
  if (file.type === "folder") {
    const color = (
      {
        blue: "#2c9ced",
        orange: "#ef9e32",
        green: "#39b88a",
        purple: "#9b78ed",
        red: "#e46b79",
      } as Record<string, string>
    )[file.folderColor || "blue"];
    return (
      <svg
        aria-hidden="true"
        width={large ? 112 : 64}
        height={large ? 96 : 54}
        viewBox="0 0 64 54"
        className="drop-shadow-sm"
      >
        <defs>
          <linearGradient id={`${gradient}-back`} x2="0" y2="1">
            <stop stopColor={color} />
            <stop offset="1" stopColor={color} />
          </linearGradient>
          <linearGradient id={`${gradient}-front`} x2="0" y2="1">
            <stop stopColor="white" stopOpacity=".42" />
            <stop offset=".6" stopColor="white" stopOpacity=".1" />
            <stop offset="1" stopColor="black" stopOpacity=".07" />
          </linearGradient>
        </defs>
        <path
          d="M5 10a6 6 0 0 1 6-6h13a5 5 0 0 1 4 2l4 5h21a6 6 0 0 1 6 6v27a6 6 0 0 1-6 6H11a6 6 0 0 1-6-6Z"
          fill={`url(#${gradient}-back)`}
        />
        <rect x="4" y="17" width="56" height="34" rx="6" fill={color} />
        <rect
          x="4"
          y="17"
          width="56"
          height="34"
          rx="6"
          fill={`url(#${gradient}-front)`}
        />
        <path
          d="M10 17.5h44"
          stroke="white"
          strokeOpacity=".4"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  const Icon = file.type === "image" ? ImageIcon : FileText;
  const extension = file.name.includes(".")
    ? file.name.split(".").pop()?.slice(0, 5).toUpperCase()
    : "FILE";
  const color =
    file.type === "pdf"
      ? "#eb6378"
      : /^(ZIP|TAR|GZ|7Z|RAR)$/.test(extension || "")
        ? "#d99c38"
        : file.type === "text"
          ? "#7c91b5"
          : "#9ca3af";
  return (
    <div
      className={`${large ? "h-32 w-28" : "h-14 w-11"} relative flex items-center justify-center rounded-[12px] border border-neutral-200/70 bg-gradient-to-b from-white to-neutral-50 shadow-[0_2px_4px_rgb(0,0,0,.04)] dark:border-white/10 dark:from-[#353840] dark:to-[#282b32]`}
    >
      <Icon
        size={large ? 48 : 23}
        strokeWidth={1.3}
        style={{ color }}
        className="-mt-2"
      />
      <span
        className="absolute bottom-1.5 rounded px-1 text-[7px] font-semibold tracking-wider"
        style={{ color, background: `${color}14` }}
      >
        {extension}
      </span>
    </div>
  );
}
function AncestorColumn({
  path,
  activePath,
  onOpen,
}: {
  path: string;
  activePath: string;
  onOpen: (file: FileItem) => void;
}) {
  const directory = useDirectory(path);
  const rows = useVirtualRows(directory.files.length, 48);
  return (
    <div className="flex min-w-48 max-w-64 flex-1 flex-col border-r border-neutral-200/70 dark:border-white/10">
      <p className="truncate border-b border-neutral-200/50 px-4 py-3 text-xs font-semibold dark:border-white/10">
        {path.split("/").pop() || "Root"}
      </p>
      {directory.error ? (
        <ErrorPanel message={directory.error} onRetry={directory.refresh} />
      ) : (
        <div ref={rows.ref} className="min-h-0 flex-1 overflow-auto">
          <div style={{ height: rows.totalHeight, position: "relative" }}>
            <div
              style={{
                position: "absolute",
                top: rows.offset,
                left: 4,
                right: 4,
              }}
            >
              {directory.files.slice(rows.start, rows.end).map((file) => (
                <button
                  key={file.id}
                  onClick={() => onOpen(file)}
                  className={`flex h-12 w-full items-center gap-2 rounded-lg px-3 text-left text-xs ${activePath === normalizePath(file.id) || activePath.startsWith(normalizePath(file.id) + "/") ? "bg-blue-500/10 text-blue-500" : "hover:bg-neutral-500/5"}`}
                >
                  <Folder
                    size={16}
                    className={
                      file.type === "folder"
                        ? "text-sky-400"
                        : "text-neutral-400"
                    }
                  />
                  <span className="min-w-0 flex-1 truncate">{file.name}</span>
                  {file.type === "folder" && <ChevronRight size={13} />}
                </button>
              ))}
            </div>
          </div>
          {directory.loading && (
            <div className="space-y-3 p-4">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-8" />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function FileArea(props: FileAreaProps) {
  const { files, currentPath, viewMode, selectedFileId } = props;
  const selectedIds =
    props.selectedIds || new Set(selectedFileId ? [selectedFileId] : []);
  const selected = files.filter((file) => selectedIds.has(file.id));
  const copyUnavailable = selected.some((file) => isCloudPath(file.id))
    ? "Cloud copies are unavailable. Use upload or download instead."
    : undefined;
  const select =
    props.onSelectFile ||
    ((file: FileItem) => props.setSelectedFileId(file.id));
  const clear = props.onClearSelection || (() => props.setSelectedFileId(null));
  const isGrid = viewMode === "grid";
  const rowHeight = isGrid ? 136 : 52;
  const virtual = useVirtualRows(files.length, rowHeight, isGrid ? 128 : 0);
  const root = useRef<HTMLDivElement>(null);
  const [context, setContext] = useState<{
    file: FileItem | null;
    x: number;
    y: number;
  } | null>(null);
  const [rename, setRename] = useState<{
    id: string;
    value: string;
    busy?: boolean;
    error?: string;
  } | null>(null);
  const [uploadHover, setUploadHover] = useState(false);
  const [dropId, setDropId] = useState<string | null>(null);
  const dragItems = useRef<FileItem[]>([]);
  const touch = useRef<{
    id: string;
    x: number;
    y: number;
    timer: ReturnType<typeof setTimeout>;
    fired: boolean;
  } | null>(null);
  const [marquee, setMarquee] = useState<{
    x: number;
    y: number;
    endX: number;
    endY: number;
  } | null>(null);
  const marqueeRef = useRef<typeof marquee>(null);
  const marqueeBase = useRef<Set<string>>(new Set());
  const suppressClick = useRef(false);
  const geometry = useRef(virtual);
  geometry.current = virtual;
  const onSelectionMode = props.onSelectionMode;
  const actions = useRef({ props, selected, select, clear });
  actions.current = { props, selected, select, clear };
  const path = partsPath(currentPath);
  const scrollKey = `${path}:${viewMode}`;
  useLayoutEffect(() => {
    const node = virtual.ref.current;
    if (!node) return;
    if (!props.loading) node.scrollTop = scrollPositions.get(scrollKey) || 0;
    return () => {
      if (!props.loading) {
        scrollPositions.set(scrollKey, node.scrollTop);
        if (scrollPositions.size > 100)
          scrollPositions.delete(scrollPositions.keys().next().value!);
      }
    };
  }, [scrollKey, props.loading, virtual.ref]);
  useEffect(() => {
    setContext(null);
    setRename(null);
    onSelectionMode?.(false);
  }, [path, onSelectionMode]);
  useEffect(() => {
    if (props.isActive === false) setContext(null);
  }, [props.isActive]);
  useEffect(
    () => () => {
      if (touch.current) clearTimeout(touch.current.timer);
    },
    [],
  );
  function copy(action: "copy" | "cut", items = selected) {
    if (action === "copy" && items.some((file) => isCloudPath(file.id))) {
      toast({
        message:
          "Cloud copies are unavailable. Use upload or download instead.",
        tone: "info",
      });
      return;
    }
    props.setClipboard?.({ action, items: items.map((item) => ({ ...item })) });
  }
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const {
        props: p,
        selected: selection,
        select: choose,
        clear: clearItems,
      } = actions.current;
      const target = event.target as HTMLElement;
      if (
        root.current?.closest("[inert]") ||
        document.querySelector('[aria-modal="true"]') ||
        target.closest(
          'input, textarea, select, [contenteditable="true"], [role="menu"]',
        )
      )
        return;
      const primary = event.ctrlKey || event.metaKey;
      const lower = event.key.toLowerCase();
      if (primary && lower === "l") {
        event.preventDefault();
        window.dispatchEvent(new Event("homios:edit-path"));
        return;
      }
      if (
        event.altKey &&
        ["ArrowLeft", "ArrowRight", "ArrowUp"].includes(event.key)
      ) {
        event.preventDefault();
        if (event.key === "ArrowLeft") p.onBack?.();
        else if (event.key === "ArrowRight") p.onForward?.();
        else p.onNavigatePath?.(path.split("/").slice(0, -1).join("/") || "/");
        return;
      }
      if (p.loading || p.error) return;
      if (primary && lower === "a") {
        event.preventDefault();
        p.onSelectAll?.();
        return;
      }
      if (primary && ["c", "x"].includes(lower) && selection.length) {
        event.preventDefault();
        if (lower === "c" && selection.some((file) => isCloudPath(file.id))) {
          toast({
            message:
              "Cloud copies are unavailable. Use upload or download instead.",
            tone: "info",
          });
          return;
        }
        p.setClipboard?.({
          action: lower === "c" ? "copy" : "cut",
          items: selection.map((item) => ({ ...item })),
        });
        return;
      }
      if (primary && lower === "v") {
        event.preventDefault();
        p.onPasteClipboard?.();
        return;
      }
      if (primary && event.shiftKey && lower === "n") {
        event.preventDefault();
        void promptDialog({
          title: "New folder",
          placeholder: "Folder name",
          confirmLabel: "Create",
        }).then((name) => {
          if (name?.trim()) p.onAddNewFolder?.(name.trim());
        });
        return;
      }
      if (
        (event.key === "Delete" ||
          (event.metaKey && event.key === "Backspace")) &&
        selection.length
      ) {
        event.preventDefault();
        p.onDeleteMany?.(selection.map((file) => file.id));
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        if (context) setContext(null);
        else {
          clearItems();
          p.onSelectionMode?.(false);
        }
        return;
      }
      const active = p.files.find((file) => file.id === p.selectedFileId);
      if (event.key === "F2" && active) {
        event.preventDefault();
        setRename({ id: active.id, value: active.name });
        return;
      }
      if ((event.key === "Enter" || event.code === "Space") && active) {
        event.preventDefault();
        p.onFileDoubleClick(active);
        return;
      }
      if (
        [
          "ArrowUp",
          "ArrowDown",
          "ArrowLeft",
          "ArrowRight",
          "Home",
          "End",
        ].includes(event.key) &&
        p.files.length
      ) {
        event.preventDefault();
        const index = Math.max(
          0,
          p.files.findIndex((file) => file.id === p.selectedFileId),
        );
        const delta =
          event.key === "ArrowUp"
            ? -geometry.current.columns
            : event.key === "ArrowDown"
              ? geometry.current.columns
              : event.key === "ArrowLeft"
                ? -1
                : 1;
        const next =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? p.files.length - 1
              : Math.max(
                  0,
                  Math.min(p.files.length - 1, active ? index + delta : 0),
                );
        choose(p.files[next], {
          shiftKey: event.shiftKey,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
        });
        geometry.current.reveal(next);
        requestAnimationFrame(() =>
          root.current
            ?.querySelector<HTMLElement>(`[data-file-index="${next}"]`)
            ?.focus({ preventScroll: true }),
        );
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [path, context]);
  const contextItems = (file: FileItem) =>
    selectedIds.has(file.id) ? selected : [file];
  async function commitRename() {
    if (!rename || rename.busy) return;
    const name = rename.value.trim();
    if (!name || /[\\/\x00]/.test(name) || name === "." || name === "..") {
      setRename({ ...rename, error: "Enter a name without slashes." });
      return;
    }
    setRename({ ...rename, busy: true });
    try {
      await props.onRenameFile(rename.id, name);
      setRename(null);
    } catch (error) {
      setRename({
        ...rename,
        error: error instanceof Error ? error.message : "Rename failed",
      });
    }
  }
  function startTouch(event: React.PointerEvent, file: FileItem) {
    if (event.pointerType !== "touch") return;
    if (touch.current) clearTimeout(touch.current.timer);
    const state = {
      id: file.id,
      x: event.clientX,
      y: event.clientY,
      timer: setTimeout(() => {}, 0),
      fired: false,
    };
    state.timer = setTimeout(() => {
      state.fired = true;
      props.onSelectionMode?.(true);
      if (!selectedIds.has(file.id)) select(file, { ctrlKey: true });
    }, 420);
    touch.current = state;
  }
  function cell(file: FileItem, index: number) {
    const chosen = selectedIds.has(file.id);
    return (
      <div
        key={file.id}
        role="option"
        aria-selected={chosen}
        aria-label={file.name}
        tabIndex={
          selectedFileId === file.id || (!selectedFileId && index === 0)
            ? 0
            : -1
        }
        data-file-index={index}
        data-file-id={file.id}
        data-cut={
          props.clipboardState?.action === "cut" &&
          props.clipboardState.items.some((item) => item.id === file.id)
        }
        data-drop={dropId === file.id}
        className={`file-cell ${isGrid ? "flex h-[128px] flex-col items-center justify-center gap-2 px-2 py-2" : "flex h-12 items-center gap-3 px-3"}`}
        draggable={!rename && !props.selectionMode}
        onDragStart={(event) => {
          dragItems.current = contextItems(file);
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData(
            "application/homios-files",
            JSON.stringify(dragItems.current),
          );
          const preview = document.createElement("div");
          preview.textContent = `${dragItems.current.length} item${dragItems.current.length === 1 ? "" : "s"}`;
          preview.style.cssText =
            "position:fixed;top:-200px;padding:12px 20px;background:#2563eb;color:white;border-radius:16px";
          document.body.appendChild(preview);
          event.dataTransfer.setDragImage(preview, 20, 20);
          setTimeout(() => preview.remove(), 0);
        }}
        onDragEnd={() => {
          dragItems.current = [];
          setDropId(null);
        }}
        onDragOver={(event) => {
          if (
            file.type === "folder" &&
            event.dataTransfer.types.includes("application/homios-files")
          ) {
            event.preventDefault();
            event.stopPropagation();
            event.dataTransfer.dropEffect = "move";
            setDropId(file.id);
          }
        }}
        onDragLeave={() => setDropId(null)}
        onDrop={(event) => {
          if (file.type !== "folder") return;
          const raw = event.dataTransfer.getData("application/homios-files");
          if (!raw) return;
          event.preventDefault();
          event.stopPropagation();
          setDropId(null);
          try {
            props.onMoveFilesToFolder?.(JSON.parse(raw), file);
          } catch {
            toast({
              message: "Could not read the dragged items.",
              tone: "danger",
            });
          }
        }}
        onPointerDown={(event) => startTouch(event, file)}
        onPointerMove={(event) => {
          const state = touch.current;
          if (
            state &&
            Math.hypot(event.clientX - state.x, event.clientY - state.y) > 8
          )
            clearTimeout(state.timer);
        }}
        onPointerUp={() => {
          if (touch.current) clearTimeout(touch.current.timer);
        }}
        onPointerCancel={() => {
          if (touch.current) clearTimeout(touch.current.timer);
          touch.current = null;
        }}
        onClick={(event) => {
          if ((event.target as HTMLElement).closest("input,button,form"))
            return;
          const state = touch.current;
          if (state?.id === file.id) {
            touch.current = null;
            if (state.fired) return;
            if (props.selectionMode) select(file, { ctrlKey: true });
            else props.onFileDoubleClick(file);
          } else select(file, event);
        }}
        onDoubleClick={() => {
          if (!props.selectionMode) props.onFileDoubleClick(file);
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!chosen) select(file);
          setContext({ file, x: event.clientX, y: event.clientY });
        }}
      >
        <input
          type="checkbox"
          aria-label={`Select ${file.name}`}
          checked={chosen}
          onChange={() => select(file, { ctrlKey: true })}
          className={`file-checkbox ${isGrid ? "absolute left-2 top-2" : ""} ${!chosen && !props.selectionMode ? "opacity-0 group-hover:opacity-100 focus:opacity-100 max-md:opacity-0 max-md:pointer-events-none" : ""}`}
        />
        <div
          className={
            isGrid
              ? "flex h-14 items-center"
              : "flex h-8 w-8 shrink-0 items-center [&>svg]:h-7 [&>svg]:w-7 [&>div]:h-8 [&>div]:w-7"
          }
        >
          <FileGlyph file={file} />
        </div>
        {rename?.id === file.id ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void commitRename();
            }}
            onClick={(event) => event.stopPropagation()}
            className="z-10 min-w-0"
          >
            <input
              autoFocus
              aria-label="New filename"
              value={rename.value}
              disabled={rename.busy}
              onFocus={(event) => {
                const end =
                  file.type === "folder"
                    ? file.name.length
                    : Math.max(0, file.name.lastIndexOf("."));
                event.target.setSelectionRange(0, end || file.name.length);
              }}
              onChange={(event) =>
                setRename({ ...rename, value: event.target.value })
              }
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === "Escape") setRename(null);
              }}
              className="w-full rounded-md border border-blue-500 bg-white p-1 text-xs text-neutral-900 dark:bg-neutral-800 dark:text-white"
            />
            {rename.error && (
              <span role="alert" className="text-[10px] text-red-500">
                {rename.error}
              </span>
            )}
            <button type="submit" className="sr-only">
              Save filename
            </button>
          </form>
        ) : (
          <span
            className={`min-w-0 text-xs leading-5 ${isGrid ? "line-clamp-2 text-center" : "flex-1 truncate"}`}
            title={file.name}
          >
            {file.name}
          </span>
        )}
        {!isGrid && (
          <>
            <span className="hidden w-24 shrink-0 text-right text-[11px] text-neutral-400 sm:block">
              {file.size}
            </span>
            <span className="hidden w-28 shrink-0 text-right text-[11px] text-neutral-400 lg:block">
              {file.updatedAt ? file.updatedAt.split("T")[0] : "—"}
            </span>
            <button
              aria-label={`Actions for ${file.name}`}
              className="rounded-lg p-2 text-neutral-400 hover:bg-neutral-500/10"
              onClick={(event) => {
                event.stopPropagation();
                if (!chosen) select(file);
                setContext({ file, x: event.clientX, y: event.clientY });
              }}
            >
              <MoreHorizontal size={16} />
            </button>
          </>
        )}
        {isGrid && file.tags?.length ? (
          <div className="absolute bottom-1 flex gap-1">
            {file.tags.map((tag) => (
              <span
                key={tag}
                title={tag}
                className="h-1.5 w-1.5 rounded-full"
                style={{
                  background: (
                    {
                      Red: "#ef4444",
                      Orange: "#f97316",
                      Yellow: "#eab308",
                      Green: "#22c55e",
                      Blue: "#3b82f6",
                      Purple: "#a855f7",
                      Gray: "#6b7280",
                    } as Record<string, string>
                  )[tag],
                }}
              />
            ))}
          </div>
        ) : null}
      </div>
    );
  }
  const visible = files.slice(virtual.start, virtual.end);
  const ancestorPaths = currentPath
    .slice(1)
    .map((_, index) => partsPath(currentPath.slice(0, index + 1)))
    .slice(-2);
  const activeFile = files.find((file) => file.id === selectedFileId);
  return (
    <div
      ref={root}
      className="relative flex min-h-0 flex-1 flex-col text-neutral-700 dark:text-neutral-200"
      data-files-pane="true"
      aria-busy={props.loading || props.refreshing || undefined}
    >
      <span className="sr-only" role="status" aria-live="polite">
        {props.loading
          ? `Loading ${currentPath.at(-1)}`
          : props.refreshing
            ? "Refreshing folder"
            : `${files.length} items`}
      </span>
      {props.error && (
        <div className="px-4 pt-3">
          <ErrorPanel message={props.error} onRetry={props.onRetry} />
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        {viewMode === "column" &&
          ancestorPaths.map((ancestor) => (
            <AncestorColumn
              key={ancestor}
              path={ancestor}
              activePath={path}
              onOpen={props.onFileDoubleClick}
            />
          ))}
        <div
          ref={virtual.ref}
          role="listbox"
          aria-label="Files"
          aria-multiselectable="true"
          tabIndex={0}
          className="relative min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain px-4 py-4"
          onClick={(event) => {
            if (suppressClick.current) {
              suppressClick.current = false;
              return;
            }
            if (
              !(event.target as HTMLElement).closest(
                "[data-file-id],button,input",
              )
            )
              clear();
          }}
          onContextMenu={(event) => {
            if ((event.target as HTMLElement).closest("[data-file-id]")) return;
            event.preventDefault();
            setContext({ file: null, x: event.clientX, y: event.clientY });
          }}
          onDragOver={(event) => {
            if (event.dataTransfer.types.includes("Files")) {
              event.preventDefault();
              setUploadHover(true);
            }
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node))
              setUploadHover(false);
          }}
          onDrop={(event) => {
            if (!event.dataTransfer.types.includes("Files")) return;
            event.preventDefault();
            setUploadHover(false);
            void collectDroppedFiles(event.dataTransfer)
              .then(props.onUploadFiles)
              .catch(() =>
                toast({
                  message: "The dropped files could not be read.",
                  tone: "danger",
                }),
              );
          }}
          onPointerDown={(event) => {
            if (
              event.pointerType !== "mouse" ||
              event.button !== 0 ||
              (event.target as HTMLElement).closest(
                "[data-file-id],button,input",
              ) ||
              !props.onSetSelection
            )
              return;
            const box = event.currentTarget.getBoundingClientRect();
            const x = event.clientX - box.left - 16,
              y = event.clientY - box.top + event.currentTarget.scrollTop - 16;
            marqueeBase.current =
              event.ctrlKey || event.metaKey ? new Set(selectedIds) : new Set();
            marqueeRef.current = { x, y, endX: x, endY: y };
            setMarquee(marqueeRef.current);
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const start = marqueeRef.current;
            if (!start) return;
            const node = event.currentTarget;
            const box = node.getBoundingClientRect();
            if (event.clientY > box.bottom - 30) node.scrollTop += 16;
            else if (event.clientY < box.top + 30) node.scrollTop -= 16;
            suppressClick.current = true;
            const next = {
              ...start,
              endX: event.clientX - box.left - 16,
              endY: event.clientY - box.top + node.scrollTop - 16,
            };
            marqueeRef.current = next;
            setMarquee(next);
            const left = Math.min(next.x, next.endX),
              right = Math.max(next.x, next.endX),
              top = Math.min(next.y, next.endY),
              bottom = Math.max(next.y, next.endY);
            const width = (node.clientWidth - 32) / virtual.columns;
            const ids = new Set(marqueeBase.current);
            files.forEach((file, index) => {
              const x = (index % virtual.columns) * width,
                y = Math.floor(index / virtual.columns) * rowHeight;
              if (
                x < right &&
                x + width > left &&
                y < bottom &&
                y + rowHeight > top
              )
                ids.add(file.id);
            });
            props.onSetSelection?.(ids);
          }}
          onPointerUp={() => {
            marqueeRef.current = null;
            setMarquee(null);
          }}
          onPointerCancel={() => {
            marqueeRef.current = null;
            setMarquee(null);
          }}
        >
          {props.loading ? (
            <div
              role="status"
              aria-label="Loading folder"
              className={
                isGrid ? "grid grid-cols-3 gap-5 md:grid-cols-6" : "space-y-3"
              }
            >
              {Array.from({ length: 18 }, (_, i) => (
                <div
                  key={i}
                  className={
                    isGrid
                      ? "flex h-32 flex-col items-center justify-center gap-4"
                      : "flex h-12 items-center gap-4"
                  }
                >
                  <Skeleton className={isGrid ? "h-12 w-14" : "h-9 w-9"} />
                  <Skeleton className={isGrid ? "h-3 w-20" : "h-3 w-40"} />
                </div>
              ))}
            </div>
          ) : files.length ? (
            <div style={{ height: virtual.totalHeight, position: "relative" }}>
              <div
                className={isGrid ? "grid" : "flex flex-col gap-1"}
                style={{
                  position: "absolute",
                  top: virtual.offset,
                  left: 0,
                  right: 0,
                  gridTemplateColumns: isGrid
                    ? `repeat(${virtual.columns},minmax(0,1fr))`
                    : undefined,
                  gridAutoRows: isGrid ? 136 : undefined,
                }}
              >
                {visible.map((file, index) => (
                  <div key={file.id} className="group">
                    {cell(file, virtual.start + index)}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            !props.error && (
              <EmptyState
                title={
                  props.searchTerm
                    ? "No matching files"
                    : "This folder is empty"
                }
                description={
                  props.searchTerm
                    ? "Try another name or clear your search."
                    : "Upload files or create a folder to get started."
                }
                action={
                  !props.searchTerm && (
                    <Button
                      onClick={() =>
                        void promptDialog({
                          title: "New folder",
                          placeholder: "Folder name",
                          confirmLabel: "Create",
                        }).then((name) => {
                          if (name?.trim()) props.onAddNewFolder?.(name.trim());
                        })
                      }
                    >
                      <Folder size={15} />
                      New folder
                    </Button>
                  )
                }
              />
            )
          )}
          {marquee && (
            <div
              className="pointer-events-none absolute z-10 border border-blue-500/60 bg-blue-500/10"
              style={{
                left: Math.min(marquee.x, marquee.endX) + 16,
                top: Math.min(marquee.y, marquee.endY) + 16,
                width: Math.abs(marquee.x - marquee.endX),
                height: Math.abs(marquee.y - marquee.endY),
              }}
            />
          )}
        </div>
        {viewMode === "column" && activeFile?.type === "folder" && (
          <AncestorColumn
            path={normalizePath(activeFile.id)}
            activePath=""
            onOpen={props.onFileDoubleClick}
          />
        )}
        {viewMode === "gallery" && activeFile && (
          <aside className="flex w-1/2 flex-col items-center justify-center gap-5 border-l border-neutral-200/60 p-8 dark:border-white/10">
            <FileGlyph file={activeFile} large />
            <h3 className="max-w-full truncate text-sm font-semibold">
              {activeFile.name}
            </h3>
            <p className="text-xs text-neutral-400">{activeFile.size}</p>
            <Button onClick={() => props.onFileDoubleClick(activeFile)}>
              Open preview
            </Button>
          </aside>
        )}
      </div>
      {uploadHover && (
        <div className="pointer-events-none absolute inset-3 z-30 flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed border-blue-500 bg-blue-500/10 backdrop-blur-sm">
          <Upload size={36} className="text-blue-500" />
          <p className="rounded-full bg-white px-5 py-2 text-sm text-blue-600 dark:bg-neutral-900">
            Drop files to upload here
          </p>
        </div>
      )}
      <footer
        className="flex shrink-0 items-center gap-2 border-t border-neutral-200/60 px-4 py-2 dark:border-white/[.06]"
        style={{ paddingBottom: "max(8px, env(safe-area-inset-bottom))" }}
      >
        <span className="shrink-0 text-[11px] text-neutral-400">
          {selected.length
            ? `${selected.length} selected`
            : `${files.length} items`}
        </span>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-1 overflow-x-auto">
          {selected.length > 0 && (
            <>
              <IconButton
                disabled={!!copyUnavailable}
                title={copyUnavailable}
                label="Copy selection"
                onClick={() => copy("copy")}
              >
                <Copy size={16} />
              </IconButton>
              <IconButton label="Cut selection" onClick={() => copy("cut")}>
                <Scissors size={16} />
              </IconButton>
              <Button
                onClick={() => props.onChooseDestination?.("move", selected)}
              >
                <FolderInput size={16} />
                <span>Move to…</span>
              </Button>
              <Button
                disabled={!!copyUnavailable}
                title={copyUnavailable}
                aria-label="Copy to…"
                onClick={() => props.onChooseDestination?.("copy", selected)}
              >
                <Copy size={15} />
                <span className="hidden sm:inline">Copy to…</span>
              </Button>
              {props.onDownloadMany && (
                <IconButton
                  label="Download selection"
                  onClick={() => props.onDownloadMany?.(selected)}
                >
                  <Download size={16} />
                </IconButton>
              )}
              {props.onZip && (
                <IconButton
                  label="Compress selection"
                  onClick={() => props.onZip?.(selected)}
                >
                  <FileArchive size={16} />
                </IconButton>
              )}
              {selected.length === 1 &&
                /\.zip$/i.test(selected[0].name) &&
                props.onUnzip && (
                  <Button onClick={() => props.onUnzip?.(selected[0])}>
                    Extract
                  </Button>
                )}
              <IconButton
                label="Delete selection"
                onClick={() =>
                  props.onDeleteMany?.(selected.map((file) => file.id))
                }
              >
                <Trash2 size={16} className="text-red-500" />
              </IconButton>
              <IconButton
                label="Clear selection"
                onClick={() => {
                  clear();
                  props.onSelectionMode?.(false);
                }}
              >
                <X size={16} />
              </IconButton>
            </>
          )}
          {!selected.length && props.clipboardState && (
            <Button
              disabled={props.loading || !!props.error}
              onClick={props.onPasteClipboard}
            >
              Paste {props.clipboardState.items.length} item
              {props.clipboardState.items.length === 1 ? "" : "s"}
            </Button>
          )}
        </div>
      </footer>
      {props.isActive !== false && context && (
        <ContextMenu
          file={context.file}
          x={context.x}
          y={context.y}
          clipboardState={props.clipboardState}
          selectionCount={context.file ? contextItems(context.file).length : 0}
          onClose={() => setContext(null)}
          copyUnavailable={
            context.file &&
            contextItems(context.file).some((file) => isCloudPath(file.id))
              ? "Cloud copies are unavailable. Use upload or download instead."
              : undefined
          }
          onQuickLook={props.onFileDoubleClick}
          onRename={(file) => setRename({ id: file.id, value: file.name })}
          onFavorite={(file) =>
            props.onUpdateMetadata?.(file.id, {
              isFavorite: !file.isFavorite,
              name: file.name,
            })
          }
          onDelete={props.onDeleteFile}
          onDeleteSelection={() =>
            props.onDeleteMany?.(selected.map((file) => file.id))
          }
          onShare={props.onShare}
          onCopy={(file) => copy("copy", contextItems(file))}
          onCut={(file) => copy("cut", contextItems(file))}
          onPaste={props.onPasteClipboard}
          onMoveTo={() => {
            if (context.file)
              props.onChooseDestination?.("move", contextItems(context.file));
          }}
          onCopyTo={() => {
            if (context.file)
              props.onChooseDestination?.("copy", contextItems(context.file));
          }}
          onCreateFile={() =>
            void promptDialog({
              title: "New file",
              placeholder: "Note.txt",
              confirmLabel: "Create",
            }).then((name) => {
              if (name?.trim()) props.onAddNewFile?.(name.trim(), "text");
            })
          }
          onCreateFolder={() =>
            void promptDialog({
              title: "New folder",
              placeholder: "Folder name",
              confirmLabel: "Create",
            }).then((name) => {
              if (name?.trim()) props.onAddNewFolder?.(name.trim());
            })
          }
          onTag={(file, tag) =>
            props.onUpdateMetadata?.(file.id, {
              name: file.name,
              tags: file.tags?.includes(tag)
                ? file.tags.filter((value) => value !== tag)
                : [...(file.tags || []), tag],
            })
          }
          onZip={
            props.onZip
              ? () =>
                  props.onZip?.(
                    context.file ? contextItems(context.file) : selected,
                  )
              : undefined
          }
          onUnzip={props.onUnzip}
          onDownloadSelection={() => props.onDownloadMany?.(selected)}
        />
      )}
    </div>
  );
}
