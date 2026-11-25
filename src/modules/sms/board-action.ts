"use server";

import { requireManager } from "@/modules/auth/session";
import { assertOrigin } from "@/modules/auth/http";
import { DomainError } from "@/lib/security/core";
import { confirmBoardSms, previewBoardSms, smsAudience } from "./board";
import { revalidatePath } from "next/cache";

export type BoardSmsState = {
  message: string;
  error?: boolean;
  preview?: Awaited<ReturnType<typeof previewBoardSms>>;
};

export async function boardSmsAction(
  previous: BoardSmsState,
  form: FormData,
): Promise<BoardSmsState> {
  const actor = await requireManager();
  await assertOrigin();
  try {
    if (form.get("operation") === "confirm") {
      if (!previous.preview)
        return { message: "ابتدا پیش‌نمایش بگیرید.", error: true };
      await confirmBoardSms(actor, previous.preview.input, previous.preview);
      revalidatePath("/management/communications");
      return { message: "پیامک‌ها در صف ارسال ثبت شدند." };
    }
    const kind = String(form.get("kind"));
    const selected = form.getAll("selected-" + kind).map(String);
    const input = smsAudience.parse({ kind, selected });
    return { message: "", preview: await previewBoardSms(actor, input) };
  } catch (error) {
    return {
      ...previous,
      message:
        error instanceof DomainError
          ? error.message
          : "اطلاعات، گیرندگان یا پیکربندی پیامک را بررسی کنید.",
      error: true,
    };
  }
}
