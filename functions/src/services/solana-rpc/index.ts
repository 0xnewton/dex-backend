import { postUpstream } from "./post-upstream";

interface SolanaRPCServiceInterface {
  postUpstream: typeof postUpstream;
}

export default class SolanaRPCService implements SolanaRPCServiceInterface {
  postUpstream = postUpstream;
}

