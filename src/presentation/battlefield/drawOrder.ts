import type { WorldPosition } from "./battlefieldFrame";

export type BattlefieldRenderable = Readonly<{
  id: string;
  kind: "effect" | "actor" | "threat" | "prop";
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
    if (left.kind !== right.kind) {
      const kindDepth = { effect: 0, actor: 1, threat: 1, prop: 2 } as const;
      const kindDifference = kindDepth[left.kind] - kindDepth[right.kind];
      if (kindDifference !== 0) return kindDifference;
    }
    return left.id.localeCompare(right.id);
  });
}
