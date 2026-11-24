import { z } from "zod";
import { db } from "@/lib/db";
import { hasRole, type Actor, fail } from "@/lib/security/core";
import { audit } from "@/modules/audit/service";
export async function saveBuilding(actor: Actor, input: unknown) {
  if (!hasRole(actor, "SUPER_ADMIN")) fail("دسترسی کافی نیست.");
  const data = z
    .object({
      name: z.string().trim().min(3).max(100),
      address: z.string().trim().max(500),
    })
    .parse(input);
  return db.$transaction(async (tx) => {
    const building = await tx.building.update({
      where: { key: "delta" },
      data,
    });
    await audit("building.update", actor.id, building.id, {}, tx);
    return building;
  });
}
