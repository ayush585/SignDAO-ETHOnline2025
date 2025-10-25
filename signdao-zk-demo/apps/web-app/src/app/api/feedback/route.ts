export async function POST() {
    return new Response(
        JSON.stringify({ error: "Client-signed only. Use the dApp UI." }),
        { status: 400, headers: { "content-type": "application/json" } }
    )
}
