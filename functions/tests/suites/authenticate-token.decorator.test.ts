jest.mock("../../src/lib/db/users", () => ({
  getUserByID: jest.fn(),
}));

import { makeRestApiContext } from "../factories/http";
import * as FirebaseMod from "../../src/lib/firebase";
import { getUserByID } from "../../src/lib/db/users";
import { logger } from "firebase-functions";
import { UserDB } from "../../src/lib/db/users/types";
import { makeUser } from "../factories/users";
import { makeRandomRoute, RandomRoute } from "../factories/route";
import {
  makeControllerWithAuthentication,
  TestControllerBase,
} from "../factories/controller";
import { faker } from "@faker-js/faker";

// Convenience: extend our RestApiContext mock with token
function ctxWithToken(
  token: string,
  init?: Parameters<typeof makeRestApiContext>[0]
) {
  const ctx = makeRestApiContext(init) as any;
  ctx.token = token;
  return ctx;
}

describe("AuthenticateToken decorator", () => {
  let user: UserDB;
  let controller: TestControllerBase;
  let randomRoute: RandomRoute<any>;
  let verifySpy: jest.SpyInstance;
  let getUserByIDMock: jest.Mock;
  let logSpy: jest.SpyInstance;
  let errorLogSpy: jest.SpyInstance;
  let token: string;
  let mockUserId: string;

  beforeEach(() => {
    token = faker.lorem.word();
    user = makeUser();
    mockUserId = user.id;
    randomRoute = makeRandomRoute();
    controller = makeControllerWithAuthentication(randomRoute.def);

    verifySpy = jest
      .spyOn(FirebaseMod.auth, "verifyIdToken")
      .mockResolvedValue({ uid: mockUserId } as any);
    getUserByIDMock = getUserByID as jest.Mock;
    getUserByIDMock.mockResolvedValue(user);
    logSpy = jest.spyOn(logger, "info").mockImplementation(() => {});
    errorLogSpy = jest.spyOn(logger, "error").mockImplementation(() => {})
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("happy path: verifies token, loads user, populates claims, preserves this & args", async () => {
    const ctx = ctxWithToken(token, {
      params: randomRoute.params,
      query: randomRoute.query,
      body: randomRoute.payload,
    });

    const route = controller.routes[0];
    await route.callback(ctx);

    // Assert
    expect(logSpy).toHaveBeenCalledWith("Authenticating token...");
    expect(verifySpy).toHaveBeenCalledWith(token, true); // checkRevoked = true
    expect(getUserByIDMock).toHaveBeenCalledWith(mockUserId);

    expect(controller.seen.claims).toBeDefined();
    expect(controller.seen.claims.user).toEqual(user);
  });

  it("throws UnauthorizedError when token is missing", async () => {
    const ctx = makeRestApiContext({
      params: randomRoute.params,
      query: randomRoute.query,
      body: randomRoute.payload,
    });

    const route = controller.routes[0];
    const routeCallback = route.callback(ctx);

    await expect(routeCallback).rejects.toThrow("Missing token");
  });

  it("throws UnauthorizedError when verifyIdToken fails", async () => {
    jest.spyOn(FirebaseMod.auth, "verifyIdToken").mockImplementation(() => {
      throw new Error("boom");
    });

    const ctx = ctxWithToken(token, {
      params: randomRoute.params,
      query: randomRoute.query,
      body: randomRoute.payload,
    });

    const route = controller.routes[0];
    const routeCallback = route.callback(ctx);
    expect(errorLogSpy).toHaveBeenCalledWith("Error verifying token", expect.any(Object));
    await expect(routeCallback).rejects.toThrow("Invalid token");
  });

  it("throws UnauthorizedError when user not found", async () => {
    getUserByIDMock.mockResolvedValue(null);

    const ctx = ctxWithToken(token, {
      params: randomRoute.params,
      query: randomRoute.query,
      body: randomRoute.payload,
    });

    const route = controller.routes[0];
    const routeCallback = route.callback(ctx);

    await expect(routeCallback).rejects.toThrow("User not found");
  });
});
