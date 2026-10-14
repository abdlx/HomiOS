/** Directory entries arrive in batches (often 100). Drain every batch before recursing. */
export async function collectDroppedFiles(transfer: DataTransfer): Promise<File[]> {
  async function collect(entry: any): Promise<File[]> {
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) => entry.file(resolve, reject));
      Object.defineProperty(file, 'relativePath', { value: String(entry.fullPath || file.name).replace(/^\/+/, ''), configurable: true });
      return [file];
    }
    if (!entry.isDirectory) return [];
    const reader = entry.createReader(); const entries: any[] = [];
    while (true) {
      const batch = await new Promise<any[]>((resolve, reject) => reader.readEntries(resolve, reject));
      if (!batch.length) break;
      entries.push(...batch);
    }
    return (await Promise.all(entries.map(collect))).flat();
  }
  const entries = Array.from(transfer.items || []).map(item => (item as any).webkitGetAsEntry?.()).filter(Boolean);
  return entries.length ? (await Promise.all(entries.map(collect))).flat() : Array.from(transfer.files);
}
