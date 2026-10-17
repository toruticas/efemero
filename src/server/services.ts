import "server-only";
import { ArtifactService } from "./artifacts";
import { getDatabase } from "./db";
import { blobStorage } from "./storage";
import { origin, required } from "./config";
export function artifacts() {
  return new ArtifactService(getDatabase(), blobStorage, {
    serverSetup: required("OPAQUE_SERVER_SETUP"),
    setupVersion: process.env.OPAQUE_SETUP_VERSION || "1",
    serverIdentity: origin(),
  });
}
