import { PrismaClient } from "@prisma/client";
import { normalizePhone } from "../src/lib/validation/index";
process.loadEnvFile();
const phone = normalizePhone(process.argv[2] || "");
const db = new PrismaClient();
try {
  await db.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({ where: { phone } });
    if (!user.name)
      throw new Error("Complete registration through OTP before bootstrap.");
    const role = await tx.role.findUniqueOrThrow({
      where: { name: "SUPER_ADMIN" },
    });
    await tx.user.update({
      where: { id: user.id },
      data: { status: "APPROVED", approvedAt: new Date() },
    });
    await tx.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      create: { userId: user.id, roleId: role.id },
      update: {},
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "security.admin.bootstrap",
        targetId: user.id,
      },
    });
  });
  console.info(
    "Explicit administrator bootstrap completed. Sign in using your own OTP.",
  );
} finally {
  await db.$disconnect();
}
