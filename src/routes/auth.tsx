import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Apple, ArrowLeft, ChefHat, LogIn, Mail, ShoppingBasket, Sparkles, UtensilsCrossed } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [
    { title: "Entrar na Lancheira — guardar planos e receitas" },
    { name: "description", content: "Entre com Google ou email para guardar os perfis dos filhos, receitas e planos de lanches." },
    { property: "og:title", content: "Entrar na Lancheira" },
    { property: "og:description", content: "Guarde perfis, receitas e planos semanais de lanches na sua conta." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ]}),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => { if (active && data.user) navigate({ to: "/", replace: true }); });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) navigate({ to: "/", replace: true });
    });
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, [navigate]);

  async function withEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email"));
    const password = String(form.get("password"));
    setNotice("");
    setBusy(true);
    const result = mode === "login"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
    setBusy(false);
    if (result.error) { setNotice(result.error.message); return; }
    if (mode === "signup" && !result.data.session) { setNotice("Enviámos um email de confirmação. Abra o link para entrar."); return; }
    navigate({ to: "/", replace: true });
  }

  async function withGoogle() {
    setNotice("");
    setBusy(true);
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    setBusy(false);
    if (result.error) { setNotice(result.error.message); return; }
    if (result.redirected) return;
    navigate({ to: "/", replace: true });
  }

  const toggleMode = () => {
    setNotice("");
    setMode(mode === "login" ? "signup" : "login");
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="fixed left-0 right-0 top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <span className="grid size-9 place-items-center rounded-md bg-primary text-primary-foreground"><Apple size={20} /></span>
            <span className="font-display text-2xl">Lancheira</span>
          </Link>
          <Link to="/" className="ml-auto"><Button variant="ghost" size="sm"><ArrowLeft size={16} />Voltar</Button></Link>
        </div>
      </header>

      <main className="grid min-h-screen lg:grid-cols-2">
        {/* Decorative panel */}
        <div className="relative hidden items-center justify-center overflow-hidden bg-primary p-12 text-primary-foreground lg:flex">
          <div className="absolute inset-0 opacity-10">
            <div className="absolute -left-20 -top-20 h-96 w-96 rounded-full bg-white blur-3xl" />
            <div className="absolute bottom-10 right-10 h-80 w-80 rounded-full bg-white blur-3xl" />
          </div>

          <div className="relative z-10 max-w-md text-center">
            <div className="mb-8 flex justify-center gap-4">
              <span className="grid size-16 place-items-center rounded-2xl bg-white/15 backdrop-blur-sm"><ChefHat size={32} /></span>
              <span className="grid size-16 place-items-center rounded-2xl bg-white/15 backdrop-blur-sm"><ShoppingBasket size={32} /></span>
              <span className="grid size-16 place-items-center rounded-2xl bg-white/15 backdrop-blur-sm"><UtensilsCrossed size={32} /></span>
            </div>
            <h2 className="font-display text-4xl leading-tight">Planos de lanches que acompanham a família</h2>
            <p className="mt-4 text-lg text-primary-foreground/80">
              Guarde os perfis dos seus filhos, as receitas preferidas e os planos semanais. A lista de compras fica pronta num clique.
            </p>

            <div className="mt-10 inline-flex items-center gap-2 rounded-full bg-white/10 px-5 py-2.5 text-sm backdrop-blur-sm">
              <Sparkles size={16} />
              <span>Simples, saudável e feito a pensar em si</span>
            </div>
          </div>
        </div>

        {/* Form panel */}
        <div className="flex items-center justify-center px-4 pb-12 pt-28 sm:px-6 lg:pb-12 lg:pt-20">
          <div className="w-full max-w-md">
            <div className="rounded-3xl border border-border bg-card p-8 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.08)] sm:p-10">
              <div className="text-center">
                <h1 className="font-display text-3xl sm:text-4xl">
                  {mode === "login" ? "Bem-vindo de volta" : "Criar conta"}
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  {mode === "login"
                    ? "Entre para aceder aos seus planos e receitas."
                    : "Junte-se à Lancheira e comece a planear hoje."}
                </p>
              </div>

              {notice && (
                <div className="mt-6 rounded-xl border border-berry/20 bg-berry/10 p-4 text-sm text-berry">
                  {notice}
                </div>
              )}

              <div className="mt-8 space-y-5">
                <Button
                  variant="outline"
                  className="relative h-12 w-full rounded-xl border border-border bg-background font-semibold text-foreground shadow-sm transition-all hover:bg-muted/60 hover:shadow-md"
                  onClick={withGoogle}
                  disabled={busy}
                >
                  <svg className="absolute left-4 size-5" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  </svg>
                  Continuar com Google
                </Button>

                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="h-px flex-1 bg-border" />
                  ou com email
                  <span className="h-px flex-1 bg-border" />
                </div>

                <form onSubmit={withEmail} className="space-y-4">
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
                    <input
                      name="email"
                      type="email"
                      required
                      autoComplete="email"
                      placeholder="Email"
                      className="h-12 w-full rounded-xl border border-input bg-background pl-11 pr-4 text-sm outline-none ring-ring transition-all focus:border-ring focus:ring-2 focus:ring-ring/30"
                    />
                  </div>
                  <div className="relative">
                    <input
                      name="password"
                      type="password"
                      required
                      minLength={6}
                      autoComplete={mode === "login" ? "current-password" : "new-password"}
                      placeholder="Palavra-passe"
                      className="h-12 w-full rounded-xl border border-input bg-background px-4 text-sm outline-none ring-ring transition-all focus:border-ring focus:ring-2 focus:ring-ring/30"
                    />
                  </div>
                  <Button
                    type="submit"
                    className="h-12 w-full rounded-xl text-base shadow-md transition-all hover:shadow-lg"
                    disabled={busy}
                  >
                    <LogIn size={18} className="mr-2" />
                    {mode === "login" ? "Entrar" : "Criar conta"}
                  </Button>
                </form>

                <button
                  type="button"
                  onClick={toggleMode}
                  className="w-full text-center text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
                >
                  {mode === "login" ? "Ainda não tenho conta" : "Já tenho conta"}
                </button>
              </div>
            </div>

            <p className="mt-6 text-center text-xs text-muted-foreground">
              Ao entrar, concorda com os nossos termos de utilização e política de privacidade.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
