/** Canonicalize loopback navigation without widening the authentication origin allowlist. */
export function developmentOriginRedirects(
  environment: string | undefined,
  appOrigin: string | undefined,
) {
  if (environment !== "development" || !appOrigin) return [];
  let url: URL;
  try {
    url = new URL(appOrigin);
  } catch {
    return [];
  }
  if (
    url.protocol !== "http:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    !["localhost", "127.0.0.1"].includes(url.hostname)
  )
    return [];
  return [
    {
      source: "/:path*",
      has: [
        {
          type: "host" as const,
          value: url.hostname === "localhost" ? "127\\.0\\.0\\.1" : "localhost",
        },
        // Only canonicalize browser document navigation, never Server Action subrequests.
        { type: "header" as const, key: "sec-fetch-dest", value: "document" },
      ],
      destination: `${url.origin}/:path*`,
      permanent: false as const,
    },
  ];
}
