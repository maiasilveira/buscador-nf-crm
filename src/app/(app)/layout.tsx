import { requireUser } from "@/lib/auth";
import { NavBar } from "./nav-bar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <div className="flex min-h-full flex-col">
      <NavBar user={user} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-24 pt-6 sm:pb-10">{children}</main>
    </div>
  );
}
