/*
 * Presence state shared across the app: who is connected (with their
 * selection and sheet), toasts for join/leave, all as a module-level store
 * so the header avatar stack, sheet tabs and grid overlay can subscribe
 * without prop drilling.
 */

export interface CollabUser {
  id: string;
  name: string;
  color: string;
  sheetId?: string;
  editing?: boolean;
  selection?: {
    sheetId: string;
    startRow: number;
    startCol: number;
    endRow: number;
    endCol: number;
  };
}

export interface CollabToast {
  id: number;
  text: string;
  color: string;
}

let users: CollabUser[] = [];
let toasts: CollabToast[] = [];
let toastSeq = 1;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

export function setCollabUsers(next: CollabUser[]) {
  users = next;
  emit();
}

export function getCollabUsers() {
  return users;
}

export function pushCollabToast(text: string, color: string) {
  const toast = { id: toastSeq++, text, color };
  toasts = [...toasts, toast];
  emit();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== toast.id);
    emit();
  }, 3500);
}

export function getCollabToasts() {
  return toasts;
}

export function subscribeCollab(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Fixed palette that meets contrast on both Crisp themes. */
export const COLLAB_PALETTE = [
  '#e11d48', '#2563eb', '#16a34a', '#d97706', '#7c3aed',
  '#0891b2', '#be185d', '#4d7c0f', '#dc2626', '#0f766e',
];
