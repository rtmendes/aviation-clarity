export type LifeBlock =
  | 'flight_training'
  | 'work'
  | 'family'
  | 'sleep'
  | 'health'
  | 'admin'
  | 'travel'
  | 'recovery'
  | 'personal';

export type LifeEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  block: LifeBlock;
  priority: 1 | 2 | 3;
  flexible: boolean;
};

/** Returns pairs of events whose time ranges overlap, in chronological order. */
export function detectConflicts(events: LifeEvent[]): { a: string; b: string }[] {
  const sorted = [...events].sort((a, b) => a.start.localeCompare(b.start));
  const conflicts: { a: string; b: string }[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const previous = sorted[i - 1];
    const current = sorted[i];
    if (!previous || !current) continue;
    if (current.start < previous.end) {
      conflicts.push({ a: previous.id, b: current.id });
    }
  }
  return conflicts;
}

/** Total scheduled hours per calendar day, keyed by YYYY-MM-DD. */
export function weeklyLoad(events: LifeEvent[]): Record<string, number> {
  return events.reduce<Record<string, number>>((out, event) => {
    const day = event.start.slice(0, 10);
    const hours = (Date.parse(event.end) - Date.parse(event.start)) / 3_600_000;
    out[day] = (out[day] ?? 0) + Math.max(0, Number.isFinite(hours) ? hours : 0);
    return out;
  }, {});
}
