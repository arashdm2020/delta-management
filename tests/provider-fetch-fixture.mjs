// Test-only preload; never imported by application code. No live provider requests.
if (
  !/^\/delta_acceptance_/.test(
    new URL(process.env.DATABASE_URL || "http://invalid").pathname,
  )
) {
  throw new Error("Provider fixture requires an isolated acceptance database");
}
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.hostname === "api.iranpayamak.com") {
    if (url.pathname !== "/ws/v1/lines/accessible")
      throw new Error("Real SMS is prohibited in browser acceptance");
    await new Promise((resolve) => setTimeout(resolve, 350));
    const key = new Headers(init?.headers).get("Api-Key");
    if (key === "browser-sender-one")
      return Response.json({
        status: "success",
        data: [{ number: "3000505" }],
      });
    if (key === "browser-sender-many")
      return Response.json({
        status: "success",
        data: [{ number: "500201" }, { number: "500202" }],
      });
    return new Response("", { status: 401 });
  }
  if (url.hostname === "edge.ippanel.com")
    throw new Error("Real SMS is prohibited in browser acceptance");
  return realFetch(input, init);
};
