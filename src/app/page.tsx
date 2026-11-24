import { redirect } from "next/navigation";
import { currentUser } from "@/modules/auth/session";
export const dynamic = "force-dynamic";
export default async function Page() {
  const user = await currentUser();
  redirect(user ? "/home" : "/login");
}
