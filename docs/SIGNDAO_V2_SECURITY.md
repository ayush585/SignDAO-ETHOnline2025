# SignDAO V2 security hardening

This work is intentionally separate from the original ETHGlobal 2025 prototype. It documents the prototype's security limitations and adds a smaller hardened voting contract.

## Design

SignDAOVotingV2 delegates proof verification, group-root validation, and nullifier consumption to Semaphore v4.13.2. The application contract adds proposal windows, membership administration, vote-choice binding, and proposal-specific scope binding.

The contract itself administers its Semaphore group. Membership is append-only in this version. The deployment admin can add members and create proposals but has no function to change vote totals.

Vote authorization does not depend on msg.sender. A relayer may submit a valid member proof.

## Core invariants

1. Only the deployment admin can add members or create proposals.
2. A proof must belong to SignDAO's Semaphore group.
3. proof.message must equal the requested YES or NO choice.
4. proof.scope must equal the domain-separated proposal scope.
5. One identity can vote at most once per proposal.
6. The same identity can vote in separate proposals.
7. Failed or replayed proofs do not change vote totals.
8. Application-level rejection occurs before Semaphore.validateProof, so it does not consume a valid nullifier.

## Scope separation

scopeForProposal hashes a domain constant, chain id, voting contract address, Semaphore group id, and proposal id. This separates authorizations across proposals, deployments, and chains.

## Privacy boundary

Semaphore protects the identity behind the proof, but direct wallet submission still exposes the Ethereum transaction sender. V2 therefore supports relayed submission and does not claim transport-layer anonymity.

## Deliberate simplifications

- no proxy or upgradeability
- no member removal in V2
- proposal metadata is represented by a hash
- the Semaphore deployment is an immutable trusted dependency
- the deployment admin is immutable for this focused hardening exercise

## Adversarial coverage

The tests cover unauthorized administration, duplicate members, YES and NO voting, relayed submission, replay attempts, per-proposal nullifier separation, message substitution, wrong scopes, foreign groups, malformed proof points, voting windows, cross-deployment scope separation, and vote-total accounting.
