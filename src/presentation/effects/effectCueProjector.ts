import type { GameSnapshot } from "../../application/game-session";
import { effectAssetManifest, type EffectKind } from "./effectAssets";
import type { EffectCue, EffectTrack } from "./effectTrack";

export type EffectCueProjector = Readonly<{
  observe: (snapshot: GameSnapshot) => EffectTrack;
  reset: () => void;
}>;

export function projectEffectTrack(snapshot: GameSnapshot): EffectTrack {
  const operation = snapshot.operation;
  if (!operation) return { cues: [] };
  const actors = new Map(operation.spatial.actors.map((actor) => [actor.actorId, actor]));
  const cues: EffectCue[] = [];

  for (const actor of operation.spatial.actors) {
    if (actor.destination === null || actor.path.length === 0) continue;
    cues.push({
      id: `movement:${actor.actorId}:${actor.destination.x},${actor.destination.y}`,
      kind: "movement",
      position: actor.position,
      startsAtMs: 0,
      endsAtMs: operation.durationMs + 1,
    });
  }

  for (const signal of operation.signals) {
    cues.push({
      id: `report:signal:${signal.id}`,
      kind: "report",
      position: signal.position,
      startsAtMs: signal.issuedAtMs,
      endsAtMs: Math.max(
        signal.issuedAtMs + effectAssetManifest.effects.report.durationMs,
        ...signal.recipients.map(({ reactionAtMs }) => reactionAtMs),
      ),
    });
  }

  for (const message of operation.messages) {
    const source = actors.get(message.sourceOfficerId);
    if (source) {
      cues.push({
        id: `report:${message.id}:source`,
        kind: "report",
        position: source.position,
        startsAtMs: message.createdAtMs,
        endsAtMs: Math.max(
          message.createdAtMs + effectAssetManifest.effects.report.durationMs,
          message.deliveryAtMs,
        ),
      });
    }
    message.recipientOfficerIds.forEach((recipientId) => {
      const recipient = actors.get(recipientId);
      if (!recipient) return;
      cues.push({
        id: `report:${message.id}:recipient:${recipientId}`,
        kind: "report",
        position: recipient.position,
        startsAtMs: message.deliveryAtMs,
        endsAtMs: message.deliveryAtMs + effectAssetManifest.effects.report.durationMs,
      });
    });
  }

  snapshot.replay.filter(({ kind }) => kind === "report-verified").forEach((event) => {
    const reportId = String(event.data.reportId ?? "");
    const message = operation.messages.find(({ authoredReportId }) => authoredReportId === reportId);
    message?.recipientOfficerIds.forEach((recipientId) => {
      const recipient = actors.get(recipientId);
      if (!recipient) return;
      cues.push({
        id: `verification:report:${reportId}:${recipientId}:${event.timeMs}`,
        kind: "verification",
        position: recipient.position,
        startsAtMs: event.timeMs,
        endsAtMs: event.timeMs + effectAssetManifest.effects.verification.durationMs,
      });
    });
  });

  for (const officer of operation.officers) {
    const commitment = officer.committedAction;
    const actor = actors.get(officer.id);
    if (!commitment || !actor) continue;
    const kindByAction = {
      defend: "attack",
      retreat: "retreat",
      verify: "verification",
    } as const satisfies Partial<Record<typeof commitment.trace.selectedAction.kind, EffectKind>>;
    const effectKind = kindByAction[commitment.trace.selectedAction.kind as keyof typeof kindByAction];
    if (!effectKind) continue;
    cues.push({
      id: `${effectKind}:${officer.id}:${commitment.startedAtMs}`,
      kind: effectKind,
      position: actor.position,
      startsAtMs: commitment.startedAtMs,
      endsAtMs: Math.max(
        commitment.startedAtMs + effectAssetManifest.effects[effectKind].durationMs,
        commitment.endsAtMs,
      ),
    });
  }

  return { cues };
}

export function createEffectCueProjector(): EffectCueProjector {
  let previous: GameSnapshot | null = null;
  let sceneId: string | null = null;
  const transientCues = new Map<string, EffectCue>();

  const appendTransient = (
    kind: EffectKind,
    actorId: string,
    position: Readonly<{ x: number; y: number }>,
    operationTimeMs: number,
    causalValue: string | number,
  ): void => {
    const id = `${kind}:${actorId}:${operationTimeMs}:${causalValue}`;
    transientCues.set(id, {
      id,
      kind,
      position,
      startsAtMs: operationTimeMs,
      endsAtMs: operationTimeMs + effectAssetManifest.effects[kind].durationMs,
    });
  };

  const reset = (): void => {
    previous = null;
    sceneId = null;
    transientCues.clear();
  };

  return {
    observe(snapshot) {
      const operation = snapshot.operation;
      if (!operation) {
        reset();
        return { cues: [] };
      }
      if (sceneId !== snapshot.scene.identity.id) reset();
      sceneId = snapshot.scene.identity.id;
      const previousOperation = previous?.operation;
      const previousUnits = new Map(previousOperation?.units.map((unit) => [unit.officerId, unit]));
      const actors = new Map(operation.spatial.actors.map((actor) => [actor.actorId, actor]));

      for (const unit of operation.units) {
        const actor = actors.get(unit.officerId);
        if (!actor) continue;
        const before = previousUnits.get(unit.officerId);
        if (before && unit.health < before.health) {
          appendTransient("hit", unit.officerId, actor.position, operation.elapsedMs, unit.health);
        }
        if ((!before && unit.suppression > 0) || (before && unit.suppression > before.suppression)) {
          appendTransient("suppression", unit.officerId, actor.position, operation.elapsedMs, unit.suppression);
        }
        if (unit.panicReaction !== null && unit.panicReaction !== before?.panicReaction) {
          appendTransient(
            unit.panicReaction === "retreat" ? "retreat" : "panic",
            unit.officerId,
            actor.position,
            operation.elapsedMs,
            unit.panicReaction,
          );
        }
      }

      for (const [id, cue] of transientCues) {
        if (cue.endsAtMs <= operation.elapsedMs) transientCues.delete(id);
      }
      previous = snapshot;
      const sustained = projectEffectTrack(snapshot).cues;
      return { cues: [...sustained, ...transientCues.values()] };
    },
    reset,
  };
}

