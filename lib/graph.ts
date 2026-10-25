// Pure DAG helpers for lot lineage (no database) — unit tested in tests/graph.test.ts.

export type Edge = { parentLotId: string; childLotId: string };

function adjacency(edges: Edge[]): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    const list = adj.get(e.parentLotId) ?? [];
    list.push(e.childLotId);
    adj.set(e.parentLotId, list);
  }
  return adj;
}

/**
 * True if `to` is reachable from `from` following parent→child edges.
 * Used to prevent lineage cycles: adding edge parent→child is safe only if
 * pathExists(edges, child, parent) is false.
 */
export function pathExists(edges: Edge[], from: string, to: string): boolean {
  if (from === to) return true;
  const adj = adjacency(edges);
  const visited = new Set<string>([from]);
  const queue = [from];
  while (queue.length) {
    const node = queue.shift()!;
    for (const next of adj.get(node) ?? []) {
      if (next === to) return true;
      if (!visited.has(next)) {
        visited.add(next);
        queue.push(next);
      }
    }
  }
  return false;
}

/** All ancestor lot ids of `id` (transitive parents). */
export function ancestorIds(edges: Edge[], id: string): Set<string> {
  const childToParents = new Map<string, string[]>();
  for (const e of edges) {
    const list = childToParents.get(e.childLotId) ?? [];
    list.push(e.parentLotId);
    childToParents.set(e.childLotId, list);
  }
  const visited = new Set<string>();
  const queue = [id];
  while (queue.length) {
    const node = queue.shift()!;
    for (const p of childToParents.get(node) ?? []) {
      if (!visited.has(p)) {
        visited.add(p);
        queue.push(p);
      }
    }
  }
  return visited;
}
