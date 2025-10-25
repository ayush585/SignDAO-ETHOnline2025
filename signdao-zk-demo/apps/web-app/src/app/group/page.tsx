"use client";

import Stepper from "@/components/Stepper";
import ClientOnly from "@/components/ClientOnly";
import { useLogContext } from "@/context/LogContext";
import { useSemaphoreContext } from "@/context/SemaphoreContext";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import useSemaphoreIdentity from "@/hooks/useSemaphoreIdentity";
import { useWalletAddress } from "@/lib/useWalletAddress";
import { assertDaoDeployed, getDaoWrite, DAO_ADDR } from "@/lib/contracts";

const SEPOLIA_CHAIN_ID = 11155111;
const SEPOLIA_CHAIN_HEX = "0xaa36a7";

function parseGroupId(raw?: string): bigint | null {
  if (!raw) return null;
  try {
    return BigInt(raw);
  } catch (error) {
    console.error("[group] invalid NEXT_PUBLIC_GROUP_ID", error);
    return null;
  }
}

async function joinGroup(groupId: bigint, identityCommitment: bigint) {
  await assertDaoDeployed();
  const dao = await getDaoWrite();
  const tx = await dao.joinGroup(groupId, identityCommitment);
  console.log("[joinGroup] tx:", tx.hash);
  await tx.wait();
  return tx.hash as string;
}

type TxInfo = {
  hash: string;
  message: string;
};

export default function GroupsPage() {
  const router = useRouter();
  const { setLog } = useLogContext();
  const { _users, refreshUsers, addUser } = useSemaphoreContext();
  const { _identity } = useSemaphoreIdentity();
  const { address, chainId, setLastTxHash } = useWalletAddress();

  const [joining, setJoining] = useState(false);
  const [txInfo, setTxInfo] = useState<TxInfo | null>(null);

  const isConnected = Boolean(address);
  const isCorrectChain = chainId === SEPOLIA_CHAIN_ID;
  const canTransact = isConnected && isCorrectChain;

  const groupId = useMemo(() => parseGroupId(process.env.NEXT_PUBLIC_GROUP_ID), []);
  const commitmentString = useMemo(() => (_identity ? _identity.commitment.toString() : null), [_identity]);
  const userHasJoined = useMemo(
    () => (commitmentString ? _users.includes(commitmentString) : false),
    [_users, commitmentString]
  );

  const requestSepoliaSwitch = useCallback(async () => {
    try {
      await window.ethereum?.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: SEPOLIA_CHAIN_HEX }]
      });
    } catch (error) {
      console.error("[wallet] failed to switch chain from group page", error);
    }
  }, []);

  useEffect(() => {
    if (_users.length > 0) {
      setLog(`${_users.length} member${_users.length > 1 ? "s" : ""} loaded from the group`);
    }
  }, [_users, setLog]);

  useEffect(() => {
    if (!canTransact && txInfo) {
      setTxInfo(null);
    }
  }, [canTransact, txInfo]);

  const users = useMemo(() => [..._users].reverse(), [_users]);

  const handleJoinGroup = useCallback(async () => {
    if (!_identity) return;
    if (!isConnected) {
      setLog("Connect your wallet before joining the group.");
      return;
    }
    if (!isCorrectChain) {
      setLog("Switch to Sepolia before joining the group.");
      return;
    }
    if (!groupId) {
      setLog("NEXT_PUBLIC_GROUP_ID is not configured.");
      return;
    }

    const commitment = BigInt(_identity.commitment.toString());

    setJoining(true);
    setTxInfo(null);
    setLog("Joining the group...");

    try {
      const hash = await joinGroup(groupId, commitment);
      setTxInfo({ hash, message: "Join confirmed on Sepolia." });
      setLastTxHash(hash);
      await refreshUsers();
      addUser(commitment.toString());
      setLog("You have joined the group. Welcome!");
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : "Transaction failed.";
      setLog(`Error joining group: ${message}`);
      setTxInfo(null);
    } finally {
      setJoining(false);
    }
  }, [
    _identity,
    addUser,
    groupId,
    isConnected,
    isCorrectChain,
    refreshUsers,
    setLastTxHash,
    setLog
  ]);

  const disableJoin = joining || !_identity || userHasJoined || !canTransact || !groupId;

  return (
    <ClientOnly>
      <>
        {!isConnected && (
          <div className="wallet-guard" role="alert">
            Connect your wallet to manage group membership.
          </div>
        )}
        {isConnected && !isCorrectChain && (
          <div className="wallet-guard" role="alert">
            <span>Switch your wallet to Sepolia to manage the group.</span>
            <button type="button" onClick={requestSepoliaSwitch}>
              Switch to Sepolia
            </button>
          </div>
        )}
        {txInfo && (
          <div className="tx-toast" role="status">
            <span>{txInfo.message}</span>
            <a
              href={`https://sepolia.etherscan.io/tx/${txInfo.hash}`}
              target="_blank"
              rel="noreferrer noopener nofollow"
            >
              View on Etherscan
            </a>
          </div>
        )}
        <h2>Groups</h2>

        <p>
          <a
            href="https://docs.semaphore.pse.dev/guides/groups"
            target="_blank"
            rel="noreferrer noopener nofollow"
          >
            Semaphore groups
          </a>{" "}
          map identities to Merkle tree leaves. DaoActionsZK contract: {DAO_ADDR}.
        </p>

        <div className="divider"></div>

        <div className="text-top">
          <h3 className="users-header">Group users ({_users.length})</h3>
          <button className="refresh-button" onClick={refreshUsers}>
            <span className="refresh-span">
              <svg viewBox="0 0 24 24" focusable="false" className="refresh-icon">
                <path
                  fill="currentColor"
                  d="M5.463 4.43301C7.27756 2.86067 9.59899 1.99666 12 2.00001C17.523 2.00001 22 6.47701 22 12C22 14.136 21.33 16.116 20.19 17.74L17 12H20C20.0001 10.4316 19.5392 8.89781 18.6747 7.58927C17.8101 6.28072 16.5799 5.25517 15.1372 4.64013C13.6944 4.0251 12.1027 3.84771 10.56 4.13003C9.0172 4.41234 7.59145 5.14191 6.46 6.22801L5.463 4.43301ZM18.537 19.567C16.7224 21.1393 14.401 22.0034 12 22C6.477 22 2 17.523 2 12C2 9.86401 2.67 7.88401 3.81 6.26001L7 12H4C3.99987 13.5684 4.46075 15.1022 5.32534 16.4108C6.18992 17.7193 7.42007 18.7449 8.86282 19.3599C10.3056 19.9749 11.8973 20.1523 13.44 19.87C14.9828 19.5877 16.4085 18.8581 17.54 17.772L18.537 19.567Z"
                ></path>
              </svg>
            </span>
            Refresh
          </button>
        </div>

        {_users.length > 0 && (
          <div className="users-wrapper">
            {users.map((user, i) => (
              <div key={i}>
                <p className="box box-text">{commitmentString === user ? <b>{user}</b> : user}</p>
              </div>
            ))}
          </div>
        )}

        <div className="join-group-button">
          <button
            className="button"
            onClick={handleJoinGroup}
            disabled={disableJoin}
            title={!isConnected ? "Connect wallet first" : !isCorrectChain ? "Switch to Sepolia" : !groupId ? "Configure NEXT_PUBLIC_GROUP_ID" : ""}
            type="button"
          >
            <span>Join group</span>
            {joining && <div className="loader"></div>}
          </button>
        </div>

        <div className="divider" />

        <Stepper
          step={2}
          onPrevClick={() => router.push("/")}
          onNextClick={userHasJoined ? () => router.push("/proofs") : undefined}
        />
      </>
    </ClientOnly>
  );
}
