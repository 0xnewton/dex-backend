import { user } from "firebase-functions/v1/auth";
import { UserService } from "../../services/user";
import { logger } from "firebase-functions";

export const onUserCreated = user().onCreate(async (user) => {
  // Handle user creation
  logger.info("User created", {
    uid: user.uid,
    user,
  });
  const userService: UserService = new UserService();
  try {
    await userService.onUserCreated(user);
  } catch (error) {
    logger.error("Error in onUserCreated", { error });
  }
});
