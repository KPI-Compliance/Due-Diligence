import Link from "next/link";
import { getAuthenticatedSession, isDevAuthBypassEnabled } from "@/lib/auth";

const loginErrorMessages: Record<string, string> = {
  google_access_denied: "O acesso com Google foi cancelado antes da conclusão do login.",
  google_missing_code: "O Google não retornou o código de autorização esperado.",
  google_invalid_state: "A validação de segurança do SSO expirou. Tente entrar novamente.",
  google_token_exchange_failed: "Não foi possível validar o login com o Google.",
  google_userinfo_failed: "O Google autenticou a conta, mas não retornou os dados do usuário.",
  google_unauthorized_account: "Sua conta Google não está autorizada para acessar este ambiente.",
  google_sso_failed: "O login corporativo falhou por um erro inesperado.",
  dev_login_disabled: "O bypass de login local está desativado neste ambiente.",
};

export default async function HomePage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const params = searchParams ? await searchParams : undefined;
  const session = await getAuthenticatedSession();
  const devAuthBypassEnabled = isDevAuthBypassEnabled();
  const errorCode = params?.error ?? "";
  const errorMessage = loginErrorMessages[errorCode];

  return (
    <main className="min-h-screen bg-white">
      <div className="grid min-h-screen w-full lg:grid-cols-2">
        <section className="relative hidden overflow-hidden bg-[var(--color-secondary)] px-12 py-12 text-white lg:flex xl:px-20 xl:py-16">
          <div className="absolute left-12 top-12 z-20 flex flex-col items-start gap-2 xl:left-20 xl:top-16">
            <div className="flex h-16 w-40 items-center justify-center">
              <img src="/Logo_branco.png" alt="VTEX" className="h-full w-full object-contain" />
            </div>
            <div className="text-2xl font-extrabold tracking-tight">
              <span>Due Diligence System</span>
            </div>
          </div>

          <div className="absolute inset-0 z-10 flex items-center px-12 xl:px-20">
            <div className="max-w-lg">
              <h1 className="text-4xl font-extrabold leading-tight xl:text-5xl">
                Centralize fornecedores, parceiros e revisões de compliance em um só lugar.
              </h1>
            </div>
          </div>

          <div className="absolute -left-20 -top-20 h-80 w-80 rounded-full bg-blue-700/30 blur-3xl" />
          <div className="absolute bottom-32 -right-20 h-96 w-96 rounded-full bg-[var(--color-primary)]/20 blur-[120px]" />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-20">
            <svg viewBox="0 0 200 200" className="h-[520px] w-[520px]" aria-hidden="true">
              <circle cx="100" cy="100" r="80" fill="none" stroke="white" strokeWidth="0.5" />
              <circle cx="100" cy="100" r="50" fill="none" stroke="white" strokeWidth="0.5" />
              <path d="M100 20 L100 180 M20 100 L180 100" stroke="white" strokeWidth="0.5" />
              <circle cx="100" cy="20" r="3" fill="white" />
              <circle cx="180" cy="100" r="3" fill="white" />
              <circle cx="100" cy="180" r="3" fill="white" />
              <circle cx="20" cy="100" r="3" fill="white" />
              <circle cx="156" cy="156" r="3" fill="white" />
              <circle cx="44" cy="44" r="3" fill="white" />
            </svg>
          </div>
        </section>

        <section className="flex w-full items-center justify-center bg-gray-50 px-6 py-8 sm:px-12 lg:bg-white">
          <div className="w-full max-w-md">
            <div className="mb-10 flex flex-col items-center justify-center gap-2 lg:hidden">
              <div className="flex h-12 w-32 items-center justify-center">
                <img src="/Logo_branco.png" alt="VTEX" className="h-full w-full object-contain" />
              </div>
              <div className="text-xl font-extrabold tracking-tight text-[var(--color-secondary)]">
                <span>Due Diligence System</span>
              </div>
            </div>

            <div className="mb-10 text-center lg:text-left">
              <h2 className="text-3xl font-extrabold text-[var(--color-secondary)]">Entrar no sistema</h2>
              <p className="mt-3 text-base font-medium text-[var(--color-neutral-700)]">
                Use sua conta corporativa Google para abrir o painel de due diligence.
              </p>
            </div>

            {errorMessage ? (
              <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {errorMessage}
              </div>
            ) : null}

            {session ? (
              <div className="space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
                <div>
                  <p className="text-sm font-semibold text-emerald-700">Sessão ativa</p>
                  <p className="mt-1 text-lg font-bold text-[var(--color-secondary)]">{session.name}</p>
                  <p className="text-sm text-[var(--color-neutral-700)]">{session.email}</p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Link
                    href="/dashboard"
                    className="flex items-center justify-center rounded-lg bg-[var(--color-primary)] px-4 py-3 text-sm font-bold text-white transition hover:brightness-95"
                  >
                    Ir para o painel
                  </Link>
                  <Link
                    href="/api/auth/logout"
                    className="flex items-center justify-center rounded-lg border border-[var(--color-neutral-300)] bg-white px-4 py-3 text-sm font-semibold text-[var(--color-secondary)] transition hover:border-[var(--color-secondary)]"
                  >
                    Trocar de conta
                  </Link>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <Link
                  href="/api/auth/google"
                  className="flex w-full items-center justify-center gap-3 rounded-lg border border-gray-300 bg-white py-4 text-sm font-semibold text-[var(--color-secondary)] transition-all hover:border-[var(--color-secondary)]"
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      fill="#EA4335"
                      d="M12 10.2v3.9h5.4c-.2 1.3-1.6 3.9-5.4 3.9-3.2 0-5.9-2.7-5.9-6s2.7-6 5.9-6c1.9 0 3.2.8 3.9 1.5l2.7-2.6C16.9 3.4 14.7 2.5 12 2.5 6.8 2.5 2.5 6.8 2.5 12s4.3 9.5 9.5 9.5c5.5 0 9.1-3.9 9.1-9.3 0-.6-.1-1.1-.2-1.6H12Z"
                    />
                    <path fill="#34A853" d="M2.5 12c0 1.7.5 3.3 1.4 4.6l3.2-2.5c-.4-.6-.6-1.3-.6-2.1s.2-1.5.6-2.1L3.9 7.4A9.4 9.4 0 0 0 2.5 12Z" />
                    <path fill="#FBBC05" d="M12 21.5c2.6 0 4.8-.9 6.4-2.5l-3.1-2.4c-.9.6-2 .9-3.3.9-2.5 0-4.6-1.7-5.3-4l-3.2 2.5c1.6 3.2 4.9 5.5 9.5 5.5Z" />
                    <path fill="#4285F4" d="M21.1 12.2c0-.7-.1-1.3-.2-2H12v3.9h5.4c-.3 1.4-1.1 2.5-2.1 3.4l3.1 2.4c1.8-1.7 2.7-4.2 2.7-7.7Z" />
                  </svg>
                  Entrar com SSO Corporativo
                </Link>

                {devAuthBypassEnabled ? (
                  <Link
                    href="/api/auth/dev-login"
                    className="flex w-full items-center justify-center rounded-lg bg-[var(--color-secondary)] px-4 py-4 text-sm font-semibold text-white transition hover:brightness-95"
                  >
                    Entrar com Bypass Local
                  </Link>
                ) : null}

                <div className="rounded-lg border border-dashed border-[var(--color-secondary)]/15 bg-[var(--color-secondary)]/3 px-4 py-3 text-xs leading-6 text-[var(--color-neutral-700)]">
                  O acesso agora usa autenticação Google OAuth. Se ocorrer erro de redirecionamento, confira se a URL do callback autorizada no Google
                  corresponde ao ambiente atual.
                </div>
              </div>
            )}

            <p className="mt-10 text-center text-sm text-gray-500">
              Precisa de ajuda? <span className="font-bold text-[var(--color-secondary)]">Fale com o suporte</span>
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
