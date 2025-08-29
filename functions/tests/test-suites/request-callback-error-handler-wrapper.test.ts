import { logger } from "firebase-functions";
import { ZodError } from "zod";
import { BaseApiError } from "../../src/lib/backend-framework";
import {
  requestCallbackErrorHandlerWrapper,
  RestApiContext,
} from "../../src/lib/backend-framework";
import { makeRestApiContext } from "../factories/http";
import { faker } from "@faker-js/faker";

jest.mock("firebase-functions", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
  },
}));

describe("requestCallbackErrorHandlerWrapper", () => {
  let controllerName: string;
  let methodName: string;
  let handler: jest.Mock;
  let statusMock: jest.Mock;
  let sendMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    controllerName = faker.lorem.word();
    methodName = faker.lorem.word();
    statusMock = jest.fn().mockReturnThis();
    sendMock = jest.fn().mockReturnThis();
    handler = jest.fn(async (ctx: RestApiContext) => {
      return ctx.response.status(200).send({ ok: true });
    });
  });

  it("happy path: calls callback and returns its response", async () => {
    const ctx = makeRestApiContext();
    ctx.response.status = statusMock;
    ctx.response.send = sendMock;
    const wrapped = requestCallbackErrorHandlerWrapper(
      controllerName,
      methodName,
      handler
    );

    const res = await wrapped(ctx);

    expect(handler).toHaveBeenCalledWith(ctx);
    expect(ctx.response.status).toHaveBeenCalledWith(200);
    expect(ctx.response.send).toHaveBeenCalledWith({ ok: true });
    expect(res).toBe(ctx.response);
    expect(logger.info).toHaveBeenCalled();
  });

  it("extracts bearer token (case-insensitive, trims space)", async () => {
    const authToken = faker.lorem.word();
    const ctx = makeRestApiContext({
      headers: { authorization: `BeArEr  ${authToken}  ` },
    });
    ctx.response.status = statusMock;
    ctx.response.send = sendMock;
    const wrapped = requestCallbackErrorHandlerWrapper(
      controllerName,
      methodName,
      handler
    );

    await wrapped(ctx);

    expect(handler).toHaveBeenCalled();
    expect(ctx.token).toBe(authToken);
  });

  it("does not set token for non-bearer auth", async () => {
    const ctx = makeRestApiContext();
    const wrapped = requestCallbackErrorHandlerWrapper(
      controllerName,
      methodName,
      handler
    );

    await wrapped(ctx);

    expect(handler).toHaveBeenCalled();
    expect(ctx.token).toBeUndefined();
  });

  it("BaseApiError → returns status & message", async () => {
    class NotFoundError extends BaseApiError {
      constructor() {
        super("Not found", 404);
      }
    }
    const handler = jest.fn(async () => {
      throw new NotFoundError();
    });
    const ctx = makeRestApiContext();
    ctx.response.status = statusMock;
    ctx.response.send = sendMock;
    const wrapped = requestCallbackErrorHandlerWrapper(
      controllerName,
      methodName,
      handler
    );

    await wrapped(ctx);

    expect(ctx.response.status).toHaveBeenCalledWith(404);
    expect(ctx.response.send).toHaveBeenCalledWith({ message: "Not found" });
    expect(logger.error).toHaveBeenCalled();
  });

  it("ZodError → 400 with issues", async () => {
    const zErr = new ZodError([
      { code: "custom", path: ["x"], message: "bad" } as any,
    ]);
    const handler = jest.fn(async () => {
      throw zErr;
    });
    const ctx = makeRestApiContext();
    ctx.response.status = statusMock;
    ctx.response.send = sendMock;
    const wrapped = requestCallbackErrorHandlerWrapper(
      controllerName,
      methodName,
      handler
    );

    await wrapped(ctx);

    expect(ctx.response.status).toHaveBeenCalledWith(400);
    expect(ctx.response.send).toHaveBeenCalledWith({
      message: "Validation error",
      issues: zErr.issues,
    });
    expect(logger.error).toHaveBeenCalled();
  });

  it("Unexpected error → 500 generic message", async () => {
    const ctx = makeRestApiContext();
    ctx.response.status = statusMock;
    ctx.response.send = sendMock;
    const handler = jest.fn(async () => {
      throw new Error("kaboom");
    });
    const wrapped = requestCallbackErrorHandlerWrapper(
      controllerName,
      methodName,
      handler
    );

    await wrapped(ctx);

    expect(ctx.response.status).toHaveBeenCalledWith(500);
    expect(ctx.response.send).toHaveBeenCalledWith({
      message: "Unexpected error occurred",
    });
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining(
        `${controllerName}.${methodName} unexpected error`
      ),
      expect.objectContaining({ message: "kaboom" })
    );
  });
});
