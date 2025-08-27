import { logger } from "firebase-functions";

export const getProjectID = () => {
  // Retrieve the project ID from the environment
  const projectID =
    process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
  if (!projectID) {
    logger.error("Project ID is not defined in the environment.");
    throw new Error("Project ID is not defined in the environment.");
  }

  return projectID;
};
