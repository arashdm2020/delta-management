export {};
process.loadEnvFile();
const { runOneJob, queueMonthlyCharges } =
  await import("../src/modules/billing/jobs");
const { db } = await import("../src/lib/db");
try {
  const limit = Number(process.argv[2] || 20);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new Error("Limit must be 1..100");
  const { queueCommunicationMaintenance } =
    await import("../src/modules/notifications/jobs");
  await queueMonthlyCharges();
  await queueCommunicationMaintenance();
  let completed = 0;
  while (completed < limit && (await runOneJob())) completed++;
  console.info(`Processed ${completed} outbox jobs.`);
} finally {
  await db.$disconnect();
}
