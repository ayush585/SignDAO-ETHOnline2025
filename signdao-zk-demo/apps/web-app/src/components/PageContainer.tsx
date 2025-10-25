"use client"

import { useLogContext } from "@/context/LogContext"
import { usePathname } from "next/navigation"

export default function PageContainer({
    children
}: Readonly<{
    children: React.ReactNode
}>) {
    const pathname = usePathname()
    const { log } = useLogContext()

    return (
        <>
            <div className="container">{children}</div>

            <div className="divider-footer" />

            <div className="footer">
                {log.endsWith("...")}
                <p>{log || `Current step: ${pathname}`}</p>
            </div>
        </>
    )
}
