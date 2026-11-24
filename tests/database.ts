import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";

// Never reset an existing database. Each run owns a uniquely named database.
export async function isolatedDatabase(cloneExisting = false) {
  const source = new URL(process.env.DATABASE_URL!);
  if (source.hostname !== "127.0.0.1") throw new Error("Local database required");
  const existing = new PrismaClient({ datasources: { db: { url: source.href } } });
  async function snapshot() {
    const tables = await existing.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`;
    const rows = [];
    for (const { tablename } of tables) {
      const name = '"' + tablename.replaceAll('"', '""') + '"';
      rows.push(await existing.$queryRawUnsafe(`SELECT md5(COALESCE(string_agg(row_to_json(t)::text, '' ORDER BY row_to_json(t)::text), '')) AS hash FROM ${name} t`));
    }
    return rows;
  }
  const before = await snapshot();
  const adminUrl = new URL(source); adminUrl.pathname = "/postgres";
  const admin = new PrismaClient({ datasources: { db: { url: adminUrl.href } } });
  const name = "delta_acceptance_" + randomBytes(8).toString("hex");
  await existing.$disconnect();
  const template = cloneExisting ? ' TEMPLATE "' + source.pathname.slice(1).replaceAll('"', '""') + '"' : " TEMPLATE template0 ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C'";
  await admin.$executeRawUnsafe('CREATE DATABASE "' + name + '"' + template);
  const url = new URL(source); url.pathname = "/" + name;
  return {
    url: url.href,
    async cleanup() {
      try {
        await admin.$executeRawUnsafe('DROP DATABASE "' + name + '" WITH (FORCE)');
        assert.deepEqual(await snapshot(), before, "Existing database must remain byte-for-byte unchanged");
        console.info("Disposable database removed; all existing table contents unchanged.");
      } finally { await existing.$disconnect(); await admin.$disconnect(); }
    },
  };
}
