import { SecretManagerServiceClient } from "@google-cloud/secret-manager";
import { logger } from "firebase-functions";
import { getProjectID } from "../firebase";

const client = new SecretManagerServiceClient();

/**
 * Gets a secret from GSM
 * @param secretID ID of the secret like "my-secret"
 * @returns the secret value
 */
export const getSecret = async (secretID: string): Promise<string> => {
  logger.info("Accessing secret", { secretID });
  const projectID = getProjectID();
  const secretName = getSecretResourceName(secretID, projectID, "latest");
  const [accessResponse] = await client.accessSecretVersion({
    name: secretName,
  });
  if (!accessResponse.payload?.data) {
    logger.error("No data found for secret", { secretName });
    throw new Error("No data found for secret");
  }
  return accessResponse.payload.data.toString();
};

export const createSecret = async (
  secretId: string, // Secret ID like, "my-secret"
  secretValue: string
): Promise<string> => {
  logger.info("Creating secret", { secretId });

  const projectID = getProjectID();

  await client.createSecret({
    parent: `projects/${projectID}`,
    secretId,
    secret: {
      replication: {
        automatic: {},
      },
    },
  });

  const secretNameFull = `projects/${projectID}/secrets/${secretId}`;
  const [version] = await client.addSecretVersion({
    parent: secretNameFull,
    payload: {
      data: Buffer.from(secretValue, "utf8"),
    },
  });

  logger.info("Created secret version", {
    version: version.name,
    secretNameFull,
  });

  return secretNameFull;
};

export const deleteSecret = async (secretID: string): Promise<void> => {
  logger.info("Deleting secret", { secretID });
  const projectID = getProjectID();
  const secretName = getSecretResourceName(secretID, projectID);
  await client.deleteSecret({ name: secretName });
};

// Helper function to generate the full secret resource name
const getSecretResourceName = (
  secretID: string,
  projectID: string,
  version = "latest"
): string => {
  return `projects/${projectID}/secrets/${secretID}/versions/${version}`;
};
