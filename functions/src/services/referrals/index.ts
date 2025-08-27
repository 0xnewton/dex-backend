import { CreateReferralFunction, createReferral } from "./create-referral";

interface ReferralServiceInterface {
  createReferral: CreateReferralFunction;
}

export class ReferralService implements ReferralServiceInterface {
  createReferral = createReferral;
}
