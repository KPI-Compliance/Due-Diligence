import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/layout/AppHeader";
import { AppSidebar } from "@/components/layout/AppSidebar";

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = (await cookies()).get("dd_session")?.value;

  if (session !== "authenticated") {
    redirect("/");
  }

  return (
    <div className="min-h-screen bg-[var(--color-surface)]">
      <AppSidebar />
      <div className="lg:pl-64">
        <AppHeader />
        <main className="px-4 py-8 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
