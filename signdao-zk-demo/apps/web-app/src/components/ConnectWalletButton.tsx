"use client"

import { useEffect, useMemo, useState } from "react"
import { ethers } from "ethers"
import { getReadProvider } from "@/lib/eth"
import shortenString from "@/utils/shortenString"
import { useWalletAddress } from "@/lib/useWalletAddress"

const SEPOLIA_CHAIN_ID = 11155111
const SEPOLIA_CHAIN_HEX = "0xaa36a7"

export default function ConnectWalletButton() {
    const { address, chainId, connecting, connect, disconnect, refresh, setLastTxHash } = useWalletAddress()
    const [balance, setBalance] = useState<string | null>(null)
    const [balanceLoading, setBalanceLoading] = useState(false)
    const readProvider = useMemo(() => {
        try {
            return getReadProvider()
        } catch (error) {
            console.warn("[wallet] read provider unavailable", error)
            return null
        }
    }, [])

    useEffect(() => {
        let isMounted = true
        async function fetchBalance(target: string) {
            if (!readProvider) {
                setBalance(null)
                setBalanceLoading(false)
                return
            }
            setBalanceLoading(true)
            try {
                const raw = await readProvider.getBalance(target)
                if (isMounted) {
                    setBalance(ethers.formatEther(raw))
                }
            } catch (error) {
                console.error("[wallet] failed to load balance", error)
                if (isMounted) {
                    setBalance(null)
                }
            } finally {
                if (isMounted) {
                    setBalanceLoading(false)
                }
            }
        }

        if (address) {
            void fetchBalance(address)
        } else {
            setBalance(null)
            setBalanceLoading(false)
        }

        return () => {
            isMounted = false
        }
    }, [address, chainId, readProvider])

    const isWrongChain = chainId !== null && chainId !== SEPOLIA_CHAIN_ID

    async function handleConnect() {
        try {
            const { signer, provider } = await connect()
            if (!signer || !provider) {
                await refresh()
                return
            }
            const addr = await signer.getAddress()
            const bal = await provider.getBalance(addr)
            setBalance(ethers.formatEther(bal))
        } catch (error: unknown) {
            console.error("[wallet] connect failed", error)
            const message =
                typeof error === "object" && error !== null && "message" in error
                    ? (error as { message?: string }).message
                    : "Could not connect wallet"
            window.alert(message ?? "Could not connect wallet")
        }
    }

    async function handleSwitchToSepolia() {
        try {
            await window.ethereum?.request({
                method: "wallet_switchEthereumChain",
                params: [{ chainId: SEPOLIA_CHAIN_HEX }]
            })
            await refresh()
        } catch (error) {
            console.error("[wallet] chain switch rejected", error)
        }
    }

    function handleDisconnect() {
        setBalance(null)
        disconnect()
        setLastTxHash(null)
    }

    const hasEthereum = typeof window !== "undefined" && !!window.ethereum

    if (!hasEthereum) {
        return (
            <div
                style={{
                    padding: "8px 14px",
                    borderRadius: 12,
                    fontWeight: 600,
                    background: "rgba(255,255,255,0.08)",
                    color: "rgba(255,255,255,0.6)"
                }}
            >
                Install MetaMask
            </div>
        )
    }

    return (
        <div
            style={{
                display: "flex",
                alignItems: "center",
                gap: "0.75rem"
            }}
        >
            {address ? (
                <>
                    <div style={{ textAlign: "right", lineHeight: 1.1 }}>
                        <div
                            style={{
                                fontSize: "0.7rem",
                                fontWeight: 600,
                                color: isWrongChain ? "#fca5a5" : "#9ca3af",
                                textTransform: "uppercase",
                                letterSpacing: "0.05em"
                            }}
                        >
                            {isWrongChain ? "Wrong Chain" : "Sepolia"}
                        </div>
                        <div style={{ fontWeight: 600 }}>{shortenString(address, [6, 4])}</div>
                        <div style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.7)" }}>
                            {balance !== null && !balanceLoading ? `${Number(balance).toFixed(4)} ETH` : "…"}
                        </div>
                    </div>
                    {isWrongChain ? (
                        <button
                            onClick={handleSwitchToSepolia}
                            style={{
                                padding: "6px 12px",
                                borderRadius: 10,
                                border: "1px solid rgba(99,102,241,0.8)",
                                background: "rgba(79,70,229,0.1)",
                                color: "#c7d2fe",
                                fontWeight: 600
                            }}
                        >
                            Switch to Sepolia
                        </button>
                    ) : (
                        <button
                            onClick={handleDisconnect}
                            title="Clears local state. Remove this site from MetaMask to fully disconnect."
                            style={{
                                padding: "6px 12px",
                                borderRadius: 10,
                                border: "1px solid rgba(148,163,184,0.4)",
                                background: "rgba(15,23,42,0.3)",
                                color: "#e5e7eb",
                                fontWeight: 600,
                                cursor: "pointer"
                            }}
                        >
                            Disconnect
                        </button>
                    )}
                </>
            ) : (
                <button
                    onClick={handleConnect}
                    disabled={connecting}
                    style={{
                        padding: "8px 16px",
                        borderRadius: 999,
                        fontWeight: 700,
                        background: connecting
                            ? "rgba(79,70,229,0.4)"
                            : "linear-gradient(90deg, rgba(108,92,231,0.95), rgba(91,140,255,0.95))",
                        color: "#fff",
                        border: "none",
                        cursor: connecting ? "wait" : "pointer",
                        minWidth: "9.5rem"
                    }}
                >
                    {connecting ? "Connecting…" : "Connect Wallet"}
                </button>
            )}
        </div>
    )
}
