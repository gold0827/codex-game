import type { WorldPosition } from "./battlefieldFrame";

export type BattlefieldRenderable = Readonly<{
  id: string;
  kind: "actor" | "prop";
  position: WorldPosition;
  depthOffset?: number;
}>;

function finiteDepth(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) ? value : 0;
}

export function battlefieldDepth(renderable: BattlefieldRenderable): number {
  return renderable.position.x + renderable.position.y + finiteDepth(renderable.depthOffset);
}

export function orderBattlefieldRenderables<T extends BattlefieldRenderable>(
  renderables: readonly T[],
): readonly T[] {
  return [...renderables].sort((left, right) => {
    const depthDifference = battlefieldDepth(left) - battlefieldDepth(right);
    if (depthDifference !== 0) return depthDifference;
    if (left.kind !== right.kind) return left.kind === "actor" ? -1 : 1;
    return left.id.localeCompare(right.id);
  });
}
