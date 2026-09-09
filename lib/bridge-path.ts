import {
  getKeyCompatibility,
  type CamelotKey,
} from "@/lib/camelot";

export const BPM_TOLERANCES = [0.06, 0.08, 0.10] as const;
export const MAX_INTERMEDIATE_HOPS = 4;

const BRIDGE_KEY_TYPES = new Set([
  "perfect",
  "relative",
  "energy_boost",
  "energy_drop",
  "adjacent",
]);

export interface BridgeGraphNode {
  id: string;
  name: string;
  artist: string;
  image: string | null;
  bpm: number;
  camelot: CamelotKey;
}

export interface BridgePathSearchResult {
  nodes: BridgeGraphNode[];
  complete: boolean;
  bpmTolerance: number;
}

export function isAdjacentOrRelative(a: CamelotKey, b: CamelotKey): boolean {
  return BRIDGE_KEY_TYPES.has(getKeyCompatibility(a, b).type);
}

export function bpmWithinTolerance(
  candidateBpm: number,
  targetBpm: number,
  tolerance: number
): boolean {
  if (candidateBpm <= 0 || targetBpm <= 0) return false;
  return Math.abs(candidateBpm - targetBpm) / targetBpm <= tolerance;
}

function nodesConnected(
  a: BridgeGraphNode,
  b: BridgeGraphNode,
  tolerance: number
): boolean {
  if (a.id === b.id) return false;
  if (!isAdjacentOrRelative(a.camelot, b.camelot)) return false;
  return bpmWithinTolerance(a.bpm, b.bpm, tolerance);
}

function buildAdjacency(nodes: BridgeGraphNode[], tolerance: number): number[][] {
  const adj: number[][] = Array.from({ length: nodes.length }, () => []);
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      if (nodesConnected(nodes[i], nodes[j], tolerance)) {
        adj[i].push(j);
        adj[j].push(i);
      }
    }
  }
  return adj;
}

function reconstructPath(
  nodes: BridgeGraphNode[],
  parent: Array<number | null>,
  startIndex: number,
  endIndex: number
): BridgeGraphNode[] {
  const indexes: number[] = [];
  let current: number | null = endIndex;
  while (current != null) {
    indexes.push(current);
    if (current === startIndex) break;
    current = parent[current];
  }
  indexes.reverse();
  if (indexes[0] !== startIndex) return [];
  return indexes.map((index) => nodes[index]);
}

function shortestPathBfs(
  nodes: BridgeGraphNode[],
  startIndex: number,
  endIndex: number,
  tolerance: number
): BridgeGraphNode[] | null {
  if (startIndex === endIndex) return [nodes[startIndex]];

  const adj = buildAdjacency(nodes, tolerance);
  const maxNodes = MAX_INTERMEDIATE_HOPS + 2;
  const parent: Array<number | null> = Array(nodes.length).fill(null);
  const depth = Array(nodes.length).fill(-1);
  const queue: number[] = [startIndex];
  depth[startIndex] = 0;

  while (queue.length > 0) {
    const index = queue.shift()!;
    if (index === endIndex) {
      return reconstructPath(nodes, parent, startIndex, endIndex);
    }
    if (depth[index] >= maxNodes - 1) continue;

    for (const next of adj[index]) {
      if (depth[next] !== -1) continue;
      depth[next] = depth[index] + 1;
      parent[next] = index;
      queue.push(next);
    }
  }

  return null;
}

function closenessToTarget(node: BridgeGraphNode, target: BridgeGraphNode): number {
  const keyScore = getKeyCompatibility(node.camelot, target.camelot).score;
  const bpmDelta = Math.abs(node.bpm - target.bpm) / Math.max(target.bpm, 1);
  const bpmScore = Math.max(0, 1 - bpmDelta) * 100;
  return keyScore + bpmScore;
}

function bestPartialPath(
  nodes: BridgeGraphNode[],
  startIndex: number,
  endIndex: number,
  tolerance: number
): BridgeGraphNode[] {
  const adj = buildAdjacency(nodes, tolerance);
  const maxNodes = MAX_INTERMEDIATE_HOPS + 2;
  const parent: Array<number | null> = Array(nodes.length).fill(null);
  const depth = Array(nodes.length).fill(-1);
  const queue: number[] = [startIndex];
  depth[startIndex] = 0;

  while (queue.length > 0) {
    const index = queue.shift()!;
    if (depth[index] >= maxNodes - 1) continue;

    for (const next of adj[index]) {
      if (depth[next] !== -1) continue;
      depth[next] = depth[index] + 1;
      parent[next] = index;
      queue.push(next);
    }
  }

  const target = nodes[endIndex];
  let bestIndex = -1;
  let bestScore = -Infinity;

  for (let i = 0; i < nodes.length; i++) {
    if (i === startIndex || i === endIndex) continue;
    if (depth[i] === -1) continue;
    const score = closenessToTarget(nodes[i], target);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }

  if (bestIndex < 0) return [nodes[startIndex]];
  return reconstructPath(nodes, parent, startIndex, bestIndex);
}

export function findBridgePath(
  nodes: BridgeGraphNode[],
  startId: string,
  endId: string
): BridgePathSearchResult | null {
  const startIndex = nodes.findIndex((node) => node.id === startId);
  const endIndex = nodes.findIndex((node) => node.id === endId);
  if (startIndex < 0 || endIndex < 0) return null;

  for (const tolerance of BPM_TOLERANCES) {
    const path = shortestPathBfs(nodes, startIndex, endIndex, tolerance);
    if (path && path.length >= 2) {
      return { nodes: path, complete: true, bpmTolerance: tolerance };
    }
  }

  const widest = BPM_TOLERANCES[BPM_TOLERANCES.length - 1];
  const partial = bestPartialPath(nodes, startIndex, endIndex, widest);
  return { nodes: partial, complete: false, bpmTolerance: widest };
}
