import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { Identity } from "@semaphore-protocol/identity";
import { Group } from "@semaphore-protocol/group";
import { generateProof } from "@semaphore-protocol/proof";
import { unpackGroth16Proof } from "@zk-kit/utils/proof-packing";
import { keccak256 } from "ethers/crypto";
import { toBeHex } from "ethers";

const require = createRequire(import.meta.url);

const resolveArtifact = (specifier) => {
  try {
    return require.resolve(specifier);
  } catch (error) {
    throw new Error(
      `Missing circuit artifact ${specifier}. Ensure semaphore.wasm and semaphore.zkey are stored locally.`
    );
  }
};

const wasmFilePath = resolveArtifact("@semaphore-protocol/circuits/semaphore.wasm");
const zkeyFilePath = resolveArtifact("@semaphore-protocol/circuits/semaphore.zkey");

const depth = Number(process.env.MERKLE_DEPTH ?? "20");
if (!Number.isInteger(depth) || depth <= 0) {
  throw new Error(`MERKLE_DEPTH must be a positive integer. Received: ${process.env.MERKLE_DEPTH}`);
}

const identitySeed = process.env.IDENTITY_SEED ?? "sign-dao-demo-identity";
const signalInput = process.env.SIGNAL ?? "sign-dao-vote-signal";
const externalNullifierInput = process.env.EXTERNAL_NULLIFIER ?? "sign-dao-proposal-42";

const identity = new Identity(identitySeed);
const group = new Group();
group.addMember(identity.commitment);

const semaphoreProof = await generateProof(identity, group, signalInput, externalNullifierInput, depth, {
  wasm: wasmFilePath,
  zkey: zkeyFilePath
});

const unpacked = unpackGroth16Proof(semaphoreProof.points);

const hashToField = (value) => {
  const big = BigInt(value);
  const hashed = keccak256(toBeHex(big, 32));
  return (BigInt(hashed) >> 8n).toString();
};

const publicSignals = [
  semaphoreProof.merkleTreeRoot,
  semaphoreProof.nullifier,
  hashToField(semaphoreProof.message),
  hashToField(semaphoreProof.scope)
];

const fullProof = {
  proof: {
    pi_a: [unpacked.pi_a[0].toString(), unpacked.pi_a[1].toString()],
    pi_b: [
      [unpacked.pi_b[0][0].toString(), unpacked.pi_b[0][1].toString()],
      [unpacked.pi_b[1][0].toString(), unpacked.pi_b[1][1].toString()]
    ],
    pi_c: [unpacked.pi_c[0].toString(), unpacked.pi_c[1].toString()]
  },
  publicSignals,
  signal: signalInput,
  signalField: publicSignals[2],
  externalNullifier: publicSignals[3],
  merkleTreeDepth: semaphoreProof.merkleTreeDepth,
  merkleTreeRoot: semaphoreProof.merkleTreeRoot,
  nullifierHash: semaphoreProof.nullifier,
  identityCommitment: identity.commitment.toString()
};

const outputPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "proof.json");
fs.writeFileSync(outputPath, JSON.stringify(fullProof, null, 2), "utf-8");

console.log("✅ proof.json written to", outputPath);
process.exit(0);
