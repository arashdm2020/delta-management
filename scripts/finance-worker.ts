import { writeFile } from "node:fs/promises";
export {};
if (!process.env.DATABASE_URL) process.loadEnvFile();
const { runOneJob, queueMonthlyCharges } =
  await import("../src/modules/billing/jobs");
const { db } = await import("../src/lib/db");
try {
  const limit = Number(process.argv[2] || 20);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new Error("Limit must be 1..100");
  const { queueCommunicationMaintenance } =
    await import("../src/modules/notifications/jobs");
  if (process.env.DELTA_WORKER_DISABLED === "true")
    throw new Error("Worker disabled");
  await db.$transaction(
    async (lease) => {
      const [state] = await lease.$queryRaw<{ acquired: boolean }[]>`
      SELECT pg_try_advisory_xact_lock(hashtext('delta-global-outbox-worker')) AS acquired
    `;
      if (!state.acquired) return;
      await queueMonthlyCharges();
      await queueCommunicationMaintenance();
      let completed = 0;
      while (completed < limit && (await runOneJob())) completed++;
      await writeFile("/tmp/delta-worker-heartbeat", String(Date.now()));
      console.info(`Processed ${completed} outbox jobs.`);
    },
    { timeout: 180000 },
  );
} finally {
  await db.$disconnect();
}
