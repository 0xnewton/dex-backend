import { CreateReferralFunction, createReferral } from "./createReferral";

interface ReferralServiceInterface {
  createReferral: CreateReferralFunction;
}

export class ReferralService implements ReferralServiceInterface {
  createReferral = createReferral;
}
