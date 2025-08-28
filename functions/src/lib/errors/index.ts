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

export class UnauthorizedError extends BaseApiError {
  constructor(message: string = "Unauthorized") {
    super(message, 401);
  }
}

export class ExpiredTokenError extends BaseApiError {
  constructor(message: string = "Token has expired") {
    super(message, 401);
  }
}

export class BadRequestError extends BaseApiError {
  constructor(message: string) {
    super(message, 400);
  }
}

export class ValidationError extends BadRequestError {
  constructor(message: string) {
    super(message);
  }
}