"use client"

import Link from "next/link"
import ConnectWalletButton from "@/components/ConnectWalletButton"
import { useWalletAddress } from "@/lib/useWalletAddress"

const SEPOLIA_CHAIN_HEX = "0xaa36a7"

export default function Header() {
    const { chainId, lastTxHash, refresh } = useWalletAddress()
    const isWrongChain = chainId !== null && chainId !== 11155111
    const missingEnv: string[] = []
    if (!process.env.NEXT_PUBLIC_SEPOLIA_RPC) {
        missingEnv.push("NEXT_PUBLIC_SEPOLIA_RPC")
    }
    if (!process.env.NEXT_PUBLIC_DAO_ACTIONS_ADDR) {
        missingEnv.push("NEXT_PUBLIC_DAO_ACTIONS_ADDR")
    }
    const showConfigWarning = process.env.NODE_ENV !== "production" && missingEnv.length > 0
    const feedbackAddress = process.env.NEXT_PUBLIC_FEEDBACK_CONTRACT_ADDRESS

    async function switchToSepolia() {
        try {
            await window.ethereum?.request({
                method: "wallet_switchEthereumChain",
                params: [{ chainId: SEPOLIA_CHAIN_HEX }]
            })
            await refresh()
        } catch (error) {
            console.error("[wallet] failed to switch chain from banner", error)
        }
    }

    return (
        <>
            <header className="header">
                <div className="header-left" style={{ gap: "1rem" }}>
                    <Link href="/">SignDAO (ZK)</Link>
                    {feedbackAddress && (
                        <a
                            href={`https://sepolia.etherscan.io/address/${feedbackAddress}`}
                            target="_blank"
                            rel="noreferrer noopener nofollow"
                            style={{ fontSize: "0.85rem", opacity: 0.8 }}
                        >
                            Feedback Contract
                        </a>
                    )}
                    <a
                        href="https://github.com/semaphore-protocol/semaphore/tree/main/packages/cli-template-monorepo-ethers"
                        target="_blank"
                        rel="noreferrer noopener nofollow"
                        aria-label="Github repository"
                        className="github-button"
                        style={{ paddingRight: 0 }}
                    >
                        <svg height="24" aria-hidden="true" viewBox="0 0 24 24" width="24" data-view-component="true">
                            <path d="M12.5.75C6.146.75 1 5.896 1 12.25c0 5.089 3.292 9.387 7.863 10.91.575.101.79-.244.79-.546 0-.273-.014-1.178-.014-2.142-2.889.532-3.636-.704-3.866-1.35-.13-.331-.69-1.352-1.18-1.625-.402-.216-.977-.748-.014-.762.906-.014 1.553.834 1.769 1.179 1.035 1.74 2.688 1.25 3.349.948.1-.747.402-1.25.733-1.538-2.559-.287-5.232-1.279-5.232-5.678 0-1.25.445-2.285 1.178-3.09-.115-.288-.517-1.467.115-3.048 0 0 .963-.302 3.163 1.179.92-.259 1.897-.388 2.875-.388.977 0 1.955.13 2.875.388 2.2-1.495 3.162-1.179 3.162-1.179.633 1.581.23 2.76.115 3.048.733.805 1.179 1.825 1.179 3.09 0 4.413-2.688 5.39-5.247 5.678.417.36.776 1.05.776 2.128 0 1.538-.014 2.774-.014 3.162 0 .302.216.662.79.547C20.709 21.637 24 17.324 24 12.25 24 5.896 18.854.75 12.5.75Z"></path>
                        </svg>
                    </a>
                </div>
                <div className="header-right" style={{ gap: "0.75rem" }}>
                    {lastTxHash && (
                        <a
                            href={`https://sepolia.etherscan.io/tx/${lastTxHash}`}
                            target="_blank"
                            rel="noreferrer noopener nofollow"
                            className="last-tx-pill"
                        >
                            Last tx ↗
                        </a>
                    )}
                    <ConnectWalletButton />
                </div>
            </header>
            {showConfigWarning && (
                <div className="config-banner" role="alert">
                    Missing env vars: {missingEnv.join(", ")}
                </div>
            )}
            {isWrongChain && (
                <div className="chain-banner" role="alert">
                    <span>Connected to wrong network.</span>
                    <button type="button" onClick={switchToSepolia}>
                        Switch to Sepolia
                    </button>
                </div>
            )}
        </>
    )
}
