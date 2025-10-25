export async function POST() {
    return new Response(
        JSON.stringify({
            error: "Feedback submissions are client-signed only. Use MetaMask from the web UI."
        }),
        {
            status: 400,
            headers: { "content-type": "application/json" }
        }
    )
}
