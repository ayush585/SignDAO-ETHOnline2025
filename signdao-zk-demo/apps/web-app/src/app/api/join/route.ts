export async function POST() {
    return new Response(
        JSON.stringify({
            error: "Join is client-signed only. Use MetaMask from the /group page."
        }),
        {
            status: 400,
            headers: { "content-type": "application/json" }
        }
    )
}
