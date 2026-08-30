export const googleDriveFolderMimeType = 'application/vnd.google-apps.folder'

export type DriveTreeItem = {
  id: string
  name: string
  mimeType: string
  sizeBytes: bigint
  parentId: string | null
}

/**
 * files.list's user corpus includes "Shared with me" entries. Walking outward
 * from the real My Drive root keeps only items that are actually mounted there.
 * The returned order is breadth-first so every folder precedes its descendants.
 */
export function reachableMyDriveItems(rootId: string, items: DriveTreeItem[]) {
  const childrenByParent = new Map<string, DriveTreeItem[]>()
  for (const item of items) {
    if (!item.parentId) continue
    const children = childrenByParent.get(item.parentId) ?? []
    children.push(item)
    childrenByParent.set(item.parentId, children)
  }

  const reachable: DriveTreeItem[] = []
  const queue = [rootId]
  const visitedFolders = new Set(queue)
  const visitedItems = new Set<string>()
  while (queue.length > 0) {
    const parentId = queue.shift()!
    for (const item of childrenByParent.get(parentId) ?? []) {
      if (visitedItems.has(item.id)) continue
      visitedItems.add(item.id)
      reachable.push(item)
      if (item.mimeType === googleDriveFolderMimeType && !visitedFolders.has(item.id)) {
        visitedFolders.add(item.id)
        queue.push(item.id)
      }
    }
  }
  return reachable
}
