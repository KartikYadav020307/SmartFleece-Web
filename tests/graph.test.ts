import { describe, expect, it } from "vitest";
import { ancestorIds, pathExists, type Edge } from "../lib/graph";

describe("pathExists (lineage cycle prevention)", () => {
  it("follows parent→child edges transitively", () => {
    const edges: Edge[] = [
      { parentLotId: "A", childLotId: "B" },
      { parentLotId: "B", childLotId: "C" },
    ];
    expect(pathExists(edges, "A", "C")).toBe(true);
    expect(pathExists(edges, "C", "A")).toBe(false);
  });

  it("detects the edge that would create a cycle", () => {
    // Existing: A → B. Proposed new edge: B→A would mean pathExists(A→...→B)
    // is already true, and adding B→A must be rejected because from A we can
    // reach B — adding B→A closes the loop. The guard checks
    // pathExists(edges, child, parent): child=B, parent=A.
    const edges: Edge[] = [{ parentLotId: "A", childLotId: "B" }];
    expect(pathExists(edges, "B", "A")).toBe(false); // safe to add B→A once…
    // But with a longer chain A→B→C, adding C→A is a cycle:
    const chain: Edge[] = [
      { parentLotId: "A", childLotId: "B" },
      { parentLotId: "B", childLotId: "C" },
    ];
    expect(pathExists(chain, "C", "A")).toBe(false); // no path C→A yet
    const withCycleEdge: Edge[] = [...chain, { parentLotId: "C", childLotId: "A" }];
    expect(pathExists(withCycleEdge, "A", "A")).toBe(true); // A reaches itself
    expect(pathExists(withCycleEdge, "B", "A")).toBe(true); // now B→C→A
  });

  it("treats a node as reaching itself", () => {
    expect(pathExists([], "A", "A")).toBe(true); // self-ancestry guard
  });

  it("handles disconnected graphs", () => {
    const edges: Edge[] = [
      { parentLotId: "A", childLotId: "B" },
      { parentLotId: "X", childLotId: "Y" },
    ];
    expect(pathExists(edges, "A", "Y")).toBe(false);
  });
});

describe("ancestorIds (backward traceability)", () => {
  it("collects transitive parents only", () => {
    const edges: Edge[] = [
      { parentLotId: "A", childLotId: "B" },
      { parentLotId: "B", childLotId: "C" },
      { parentLotId: "D", childLotId: "B" },
    ];
    const ancestors = ancestorIds(edges, "C");
    expect(ancestors.has("A")).toBe(true);
    expect(ancestors.has("B")).toBe(true);
    expect(ancestors.has("D")).toBe(true);
    expect(ancestors.has("C")).toBe(false);
    expect(ancestors.size).toBe(3);
  });

  it("returns empty for a root lot", () => {
    expect(ancestorIds([], "A").size).toBe(0);
  });
});
