import EmbeddedPostgres from "embedded-postgres";
import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import { randomBytes } from "node:crypto";
if (process.env.NODE_ENV === "production")
  throw new Error("Local database helper is development-only");
mkdirSync(".local", { recursive: true });
if (!existsSync(".env")) {
  const password = randomBytes(24).toString("hex");
  writeFileSync(
    ".env",
    `DATABASE_URL=postgresql://delta:${password}@127.0.0.1:55432/delta
TEST_DATABASE_URL=postgresql://delta:${password}@127.0.0.1:55432/delta_test
AUTH_SECRET=${randomBytes(48).toString("hex")}
APP_ORIGIN=http://localhost:3000
DEV_SMS=true
DEV_FIXED_OTP_ENABLED=true
PAYMENT_PROVIDER=mock
TRUST_PROXY=false
`,
    { mode: 0o600 },
  );
}
process.loadEnvFile();
const url = new URL(process.env.DATABASE_URL!);
if (url.hostname !== "127.0.0.1" || url.port !== "55432")
  throw new Error("Refusing non-local database configuration");
const pg = new EmbeddedPostgres({
  databaseDir: ".local/postgres",
  user: "delta",
  password: decodeURIComponent(url.password),
  port: 55432,
  persistent: true,
  authMethod: "scram-sha-256",
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
  postgresFlags: ["-h", "127.0.0.1"],
  onLog: () => {},
  onError: () => {},
});
if (!existsSync(".local/postgres/PG_VERSION")) await pg.initialise();
await pg.start();
const client = pg.getPgClient();
await client.connect();
for (const name of ["delta", "delta_test"]) {
  const result = await client.query(
    "SELECT 1 FROM pg_database WHERE datname=$1",
    [name],
  );
  if (!result.rowCount)
    await client.query(
      "CREATE DATABASE " +
        name +
        " ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C' TEMPLATE template0",
    );
}
await client.end();
console.info(
  "Isolated PostgreSQL ready on 127.0.0.1:55432. Keep this process running. Credentials are only in ignored .env.",
);
async function stop() {
  await pg.stop();
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
setInterval(() => {}, 60000);
