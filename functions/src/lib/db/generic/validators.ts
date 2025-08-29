import { ValidationError } from "../../backend-framework/errors";

export const assertIntBps = (
  n: number,
  name: string,
  min = 0,
  max = 10_000
) => {
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < min || n > max) {
    throw new ValidationError(
      `${name} must be an integer between ${min} and ${max}`
    );
  }
};
