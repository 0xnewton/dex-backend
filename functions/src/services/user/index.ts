import { onUserCreated, OnUserCreatedFunction } from "./on-user-created";

interface UserServiceInterface {
  onUserCreated: OnUserCreatedFunction;
}

export class UserService implements UserServiceInterface {
  onUserCreated = onUserCreated;
}
