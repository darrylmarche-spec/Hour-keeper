// Problems the app runs into (a screen crashing, an unexpected error) are
// saved as app_errors rows and sent with the normal sync, so they can be fixed
// without anyone having to describe what happened.
//
// Kept small on purpose: the same problem is counted on one row, and a
// session sends at most MAX_PER_SESSION different problems.

export interface ErrorSink {
  (row: { id: string; message: string; stack: string; screen: string; count: number }): void;
}

export const MAX_PER_SESSION = 20;

export function errorText(err: unknown): { message: string; stack: string } {
  if (err instanceof Error) return { message: `${err.name}: ${err.message}`.slice(0, 2000), stack: (err.stack ?? '').slice(0, 8000) };
  if (typeof err === 'string') return { message: err.slice(0, 2000), stack: '' };
  try {
    return { message: JSON.stringify(err).slice(0, 2000), stack: '' };
  } catch {
    return { message: String(err).slice(0, 2000), stack: '' };
  }
}

// Noise that isn't a fault in the app: no signal, the user leaving a page.
export function isNoise(message: string): boolean {
  return /Failed to fetch|NetworkError|Network request failed|Load failed|AbortError|ResizeObserver loop/i.test(message);
}

export class ErrorReporter {
  private seen = new Map<string, { id: string; count: number; stack: string; screen: string }>();
  private sink: ErrorSink | null = null;
  private pending: { message: string; stack: string; screen: string }[] = [];
  screen = '';

  constructor(private newId: () => string) {}

  // Connected once the signed-in user's data is loaded; anything reported
  // before then is held and sent on connect.
  connect(sink: ErrorSink | null): void {
    this.sink = sink;
    if (sink) {
      const held = this.pending;
      this.pending = [];
      for (const p of held) this.record(p.message, p.stack, p.screen);
    }
  }

  report(err: unknown, screen = this.screen): void {
    const { message, stack } = errorText(err);
    if (!message || isNoise(message)) return;
    if (!this.sink) {
      if (this.pending.length < MAX_PER_SESSION) this.pending.push({ message, stack, screen });
      return;
    }
    this.record(message, stack, screen);
  }

  private record(message: string, stack: string, screen: string): void {
    let item = this.seen.get(message);
    if (!item) {
      if (this.seen.size >= MAX_PER_SESSION) return;
      item = { id: this.newId(), count: 0, stack, screen };
      this.seen.set(message, item);
    }
    item.count += 1;
    try {
      this.sink!({ id: item.id, message, stack: item.stack, screen: item.screen, count: item.count });
    } catch {
      // Reporting must never cause a problem of its own.
    }
  }
}
