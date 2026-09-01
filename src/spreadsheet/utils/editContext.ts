/*
 * Edit authorship context: the reducer stamps every cell write with
 * (timestamp, author) so concurrent edits from multiple clients merge
 * deterministically (highest stamp wins, tie broken by author id).
 */

let currentAuthor = 'local';

export function setEditAuthor(author: string) {
  currentAuthor = author;
}

export function getEditAuthor(): string {
  return currentAuthor;
}

export function stampEditMeta(): { ts: number; by: string } {
  return { ts: Date.now(), by: currentAuthor };
}

/** Total order over edit stamps: positive if a wins over b. */
export function editStampWins(
  a: { ts: number; by: string } | undefined,
  b: { ts: number; by: string } | undefined
): boolean {
  if (!a && !b) return false;
  if (!b) return true;
  if (!a) return false;
  if (a.ts !== b.ts) return a.ts > b.ts;
  return a.by > b.by;
}

// Remote-applied edits (collaboration) must not create local undo history
let remoteApplyDepth = 0;

export function beginRemoteApply() {
  remoteApplyDepth++;
}

export function endRemoteApply() {
  remoteApplyDepth = Math.max(0, remoteApplyDepth - 1);
}

export function isRemoteApplying(): boolean {
  return remoteApplyDepth > 0;
}
