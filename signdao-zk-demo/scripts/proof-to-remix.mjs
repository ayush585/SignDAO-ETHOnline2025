import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const filename = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "proof.json");

if (!fs.existsSync(filename)) {
  throw new Error(`proof.json not found at ${filename}. Run scripts/gen-proof.mjs first.`);
}

const payload = JSON.parse(fs.readFileSync(filename, "utf8"));
const { proof, publicSignals } = payload;

if (!proof?.pi_a || !proof?.pi_b || !proof?.pi_c) {
  throw new Error("Proof JSON is missing Groth16 proof components (pi_a, pi_b, pi_c).");
}

if (!Array.isArray(publicSignals) || publicSignals.length < 4) {
  throw new Error("Proof JSON is missing publicSignals[4].");
}

const toDecimal = (value) => {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number") return BigInt(value).toString();
  if (typeof value === "string") {
    if (value.startsWith("0x") || value.startsWith("0X")) {
      return BigInt(value).toString();
    }
    return BigInt(value).toString();
  }
  throw new TypeError(`Unsupported field element type: ${value}`);
};

const a = proof.pi_a.map(toDecimal);
const b = proof.pi_b.map((row) => row.map(toDecimal));
const c = proof.pi_c.map(toDecimal);

const merkleRoot = toDecimal(publicSignals[0]);
const nullifierHash = toDecimal(publicSignals[1]);
const signalField = toDecimal(publicSignals[2]);
const externalNullifier = toDecimal(publicSignals[3]);

console.log("a =", `[${a.join(", ")}]`);
console.log("b =", `[[${b[0].join(", ")}], [${b[1].join(", ")}]]`);
console.log("c =", `[${c.join(", ")}]`);
console.log("merkleRoot =", merkleRoot);
console.log("nullifierHash =", nullifierHash);
console.log("signalField =", signalField);
console.log("externalNullifier =", externalNullifier);
