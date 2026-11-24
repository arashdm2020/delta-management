import { notFound } from "next/navigation";
import { DomainError } from "@/lib/security/core";
import { z } from "zod";
// Missing and unauthorized records use the same not-found screen.
// Next.js may retain HTTP 200 when a page has already started streaming.
export async function privateRecord<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (error) {
    if (
      error instanceof DomainError ||
      error instanceof z.ZodError ||
      (error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "P2025")
    )
      notFound();
    throw error;
  }
}
