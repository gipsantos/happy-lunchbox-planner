import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Apple, ArrowLeft, LogIn } from "lucide-react";
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

const inputClass = "h-11 w-full rounded-md border border-input bg-background px-3 text-sm";

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
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (result.error) { setNotice(result.error.message); return; }
    if (result.redirected) return;
    navigate({ to: "/", replace: true });
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <span className="grid size-9 place-items-center rounded-md bg-primary text-primary-foreground"><Apple size={20} /></span>
            <span className="font-display text-2xl">Lancheira</span>
          </Link>
          <Link to="/" className="ml-auto"><Button variant="ghost" size="sm"><ArrowLeft size={16} />Voltar</Button></Link>
        </div>
      </header>

      <main className="mx-auto flex max-w-md flex-col px-4 py-14 sm:px-6">
        <h1 className="text-4xl">{mode === "login" ? "Entrar" : "Criar conta"}</h1>
        <p className="mt-2 mb-8 text-muted-foreground">Guarde os perfis dos seus filhos, as receitas, as lancheiras escolhidas e os planos da semana.</p>

        {notice && <div className="mb-6 rounded-md border-l-4 border-berry bg-card p-4 text-sm">{notice}</div>}

        <Button variant="outline" className="w-full" onClick={withGoogle}>Continuar com Google</Button>

        <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />ou com email<span className="h-px flex-1 bg-border" /></div>

        <form onSubmit={withEmail} className="space-y-3">
          <input name="email" type="email" required autoComplete="email" placeholder="Email" className={inputClass} />
          <input name="password" type="password" required minLength={6} autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder="Palavra-passe" className={inputClass} />
          <Button type="submit" className="w-full" disabled={busy}><LogIn size={16} />{mode === "login" ? "Entrar" : "Criar conta"}</Button>
        </form>

        <Button variant="ghost" className="mt-3 w-full" onClick={() => { setNotice(""); setMode(mode === "login" ? "signup" : "login"); }}>
          {mode === "login" ? "Ainda não tenho conta" : "Já tenho conta"}
        </Button>
      </main>
    </div>
  );
}
