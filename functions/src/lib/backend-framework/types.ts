import * as express from 'express';

export type ExpressRequest = express.Request;
export type ExpressResponse<T extends any = any> = 
  express.Response<T | { data: T, message?: string } | { message?: string } | string>;
export type ExpressRequestHandler = express.RequestHandler;
export type ExpressNextFunction = express.NextFunction;
export type ExpressRouter = express.Router;
