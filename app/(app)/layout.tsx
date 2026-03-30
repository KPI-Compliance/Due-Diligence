import { redirect } from "next/navigation";
import { AppHeader } from "@/components/layout/AppHeader";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { resolveUserAccess } from "@/lib/access-control";
import { getAuthenticatedSessionResult, getSessionErrorCode } from "@/lib/auth";

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const sessionResult = await getAuthenticatedSessionResult();
  const session = sessionResult.session;

  if (!session) {
    redirect(`/?error=${encodeURIComponent(getSessionErrorCode(sessionResult.reason))}`);
  }
  const access = await resolveUserAccess(session.email);

  return (
    <div className="min-h-screen bg-[var(--color-surface)]">
      <AppSidebar userName={session.name} canManageSettings={access.permissions.canManageSettings} />
      <div className="lg:pl-64">
        <AppHeader userName={session.name} userEmail={session.email} />
        <main className="px-4 py-8 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
