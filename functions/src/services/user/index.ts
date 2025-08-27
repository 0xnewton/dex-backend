import { onUserCreated, OnUserCreatedFunction } from "./onUserCreated";

interface UserServiceInterface {
  onUserCreated: OnUserCreatedFunction;
}

export class UserService implements UserServiceInterface {
  onUserCreated = onUserCreated;
}
