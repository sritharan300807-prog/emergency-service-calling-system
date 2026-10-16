import { randomUUID } from 'node:crypto';

type Listener = (event: string, payload: unknown) => void;

const listeners = new Set<Listener>();

export function publish(event: string, payload: unknown): void {
  for (const listener of listeners) {
    try {
      listener(event, payload);
    } catch {
      // ignore listener errors
    }
  }
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function uid(): string {
  return randomUUID();
}
