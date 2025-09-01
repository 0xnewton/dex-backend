import { CreateReferralFunction, createReferral } from "./create-referral";

interface ReferralServiceInterface {
  createReferral: CreateReferralFunction;
}

export default class ReferralService implements ReferralServiceInterface {
  createReferral = createReferral;
}
