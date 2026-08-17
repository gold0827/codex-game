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

  for (const event of snapshot.operationEvents) {
    const actorId = String(event.data.actorId ?? "");
    const targetId = String(event.data.targetId ?? "");
    const kind = event.kind === "unit-hit"
      ? "hit"
      : event.kind === "unit-suppressed"
        ? "suppression"
        : event.kind === "unit-retreated"
          ? "retreat"
          : event.kind === "target-misidentified" ||
              event.kind === "unit-froze" ||
              event.kind === "ally-followed"
            ? "panic"
            : null;
    if (!kind) continue;
    const actor = actors.get(event.kind === "unit-hit" ? targetId : actorId);
    if (!actor) continue;
    cues.push({
      id: event.id,
      kind,
      position: actor.position,
      startsAtMs: event.timeMs,
      endsAtMs: event.timeMs + effectAssetManifest.effects[kind].durationMs,
    });
  }

  return { cues };
}

export function createEffectCueProjector(): EffectCueProjector {
  return {
    observe: projectEffectTrack,
    reset: () => undefined,
  };
}

