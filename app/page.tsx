"use client";

import { FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function HomePage() {
  const router = useRouter();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    document.cookie = "dd_session=authenticated; path=/; max-age=28800; SameSite=Lax";
    router.push("/dashboard");
    router.refresh();
  }

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
                Use seu acesso corporativo para abrir o painel de due diligence.
              </p>
            </div>

            <form className="space-y-6" onSubmit={handleSubmit}>
              <label className="block space-y-2">
                <span className="block text-sm font-semibold text-gray-700">Email</span>
                <input
                  type="email"
                  name="email"
                  placeholder="seu@email.com.br"
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm outline-none transition-all focus:border-[var(--color-secondary)] focus:ring-2 focus:ring-[var(--color-secondary)]/15"
                />
              </label>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-700">Senha</span>
                  <button type="button" className="text-sm font-semibold text-[var(--color-secondary)] hover:underline">
                    Esqueci minha senha
                  </button>
                </div>
                <input
                  type="password"
                  name="password"
                  placeholder="••••••••"
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm outline-none transition-all focus:border-[var(--color-secondary)] focus:ring-2 focus:ring-[var(--color-secondary)]/15"
                />
              </div>

              <label className="flex items-center">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300 text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
                />
                <span className="ml-2 text-sm text-gray-700">Lembrar deste dispositivo</span>
              </label>

              <button
                type="submit"
                className="w-full rounded-lg bg-[var(--color-primary)] py-4 text-base font-bold text-white shadow-lg shadow-pink-200 transition-all hover:bg-[#d91658] active:scale-[0.98]"
              >
                Entrar
              </button>

              <div className="relative py-2">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="bg-gray-50 px-2 font-medium uppercase tracking-wider text-gray-500 lg:bg-white">Ou</span>
                </div>
              </div>

              <button
                type="button"
                className="flex w-full items-center justify-center gap-3 rounded-lg border border-gray-300 bg-white py-3 text-sm font-semibold text-[var(--color-secondary)] transition-all hover:border-[var(--color-secondary)]"
              >
                <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m12 2.5 2.86 5.8 6.4.93-4.63 4.5 1.1 6.37L12 17.1l-5.73 3.01 1.1-6.37-4.63-4.5 6.4-.93L12 2.5Z" />
                </svg>
                Entrar com SSO Corporativo
              </button>
            </form>

            <p className="mt-10 text-center text-sm text-gray-500">
              Precisa de ajuda? <span className="font-bold text-[var(--color-secondary)]">Fale com o suporte</span>
            </p>

            <div className="mt-6 rounded-lg border border-dashed border-[var(--color-secondary)]/15 bg-[var(--color-secondary)]/3 px-4 py-3 text-xs leading-6 text-[var(--color-neutral-700)]">
              Login e SSO ainda nao estao integrados. O botao <span className="font-semibold text-[var(--color-secondary)]">Entrar</span> libera o acesso provisoriamente.
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
