export interface MemoryEntry {
  readonly memoryId: string;
  readonly rememberedAtMs: number;
}

export interface BoundedMemory<Entry extends MemoryEntry> {
  readonly capacity: number;
  readonly entries: readonly Entry[];
}

function assertCapacity(capacity: number): void {
  if (!Number.isSafeInteger(capacity) || capacity < 1) {
    throw new RangeError("Memory capacity must be a positive safe integer.");
  }
}

export function createBoundedMemory<Entry extends MemoryEntry>(
  capacity: number,
  entries: readonly Entry[] = [],
): BoundedMemory<Entry> {
  assertCapacity(capacity);
  return rememberInMemory({ capacity, entries: [] }, entries);
}

export function rememberInMemory<Entry extends MemoryEntry>(
  memory: BoundedMemory<Entry>,
  entries: readonly Entry[],
): BoundedMemory<Entry> {
  assertCapacity(memory.capacity);
  const remembered = new Map(memory.entries.map((entry) => [entry.memoryId, entry]));
  entries.forEach((entry) => remembered.set(entry.memoryId, entry));
  const bounded = [...remembered.values()]
    .sort((left, right) =>
      left.rememberedAtMs - right.rememberedAtMs || left.memoryId.localeCompare(right.memoryId),
    )
    .slice(-memory.capacity);
  return { capacity: memory.capacity, entries: bounded };
}
