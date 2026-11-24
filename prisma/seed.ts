process.loadEnvFile();
import { PrismaClient, RoleName } from "@prisma/client";
const db = new PrismaClient();
try {
  await db.building.upsert({
    where: { key: "delta" },
    create: {
      key: "delta",
      name: "ساختمان دلتا",
      city: "اردبیل",
      capacity: 18,
    },
    update: {},
  });
  for (const name of Object.values(RoleName))
    await db.role.upsert({ where: { name }, create: { name }, update: {} });
  console.info(
    "Delta building and role vocabulary ready. No units, residents or administrators invented.",
  );
} finally {
  await db.$disconnect();
}
