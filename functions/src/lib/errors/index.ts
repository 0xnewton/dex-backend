export class BaseApiError extends Error {
  public status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export class NotFoundError extends BaseApiError {
  constructor(message: string) {
    super(message, 404);
  }
}

export class AlreadyExistsError extends BaseApiError {
  constructor(message: string) {
    super(message, 409);
  }
}
