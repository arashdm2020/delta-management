"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { readInbox } from "./actions";
export function ReadThread({ id }: { id: string }) {
  const router = useRouter();
  useEffect(() => {
    const form = new FormData();
    form.set("thread", id);
    void readInbox(form).then(() => router.refresh());
  }, [id, router]);
  return null;
}
