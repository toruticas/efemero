import "server-only";
import type { ArtifactService } from "./artifacts";

export async function dailyCleanup(
  service: Pick<ArtifactService, "cleanup">,
  clock = Date.now,
) {
  const deadline = clock() + 45_000;
  let examined = 0,
    deleted = 0;
  // A daily invocation must drain more than one batch. Keep a time and work
  // budget so an unusually large backlog can resume in a later invocation.
  for (let batches = 1; batches <= 500; batches++) {
    const result = await service.cleanup(20);
    examined += result.examined;
    deleted += result.deleted;
    if (result.examined < 20 && !result.moreAttempts)
      return { examined, deleted, batches, limited: false };
    if (clock() >= deadline || batches === 500)
      return { examined, deleted, batches, limited: true };
  }
  throw new Error("Unreachable cleanup state");
}
