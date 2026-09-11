import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Apple, CalendarDays, Check, Clock3, Dumbbell, LogIn, Plus, Search, ShoppingBasket, Snowflake, Sparkles, UserRound, UtensilsCrossed, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import muffins from "@/assets/muffins-banana.jpeg.asset.json";
import lunchbox from "@/assets/lancheira-colorida.jpeg.asset.json";
import fruitBoxes from "@/assets/caixas-fruta.jpeg.asset.json";

type Tab = "plano" | "receitas" | "compras" | "familia";
type Child = Pick<Tables<"children">, "id" | "name" | "age" | "snacks_per_day" | "training_days" | "training_timing">;
type Recipe = Tables<"recipes">;
type Ingredient = { name: string; quantity: number; unit: string };
type PlanCell = { childId: string; day: number; snack: number; recipeId: string; training: boolean };

const demoChildren: Child[] = [
  { id: "ines", name: "Inês", age: 5, snacks_per_day: 1, training_days: [2], training_timing: "after" },
  { id: "matilde", name: "Matilde", age: 12, snacks_per_day: 2, training_days: [1, 3], training_timing: "before" },
];
const weekDays = ["Seg", "Ter", "Qua", "Qui", "Sex"];
const fullDays = ["segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira"];

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "Lancheira — Planeador de lanches escolares" },
    { name: "description", content: "Crie planos semanais de lanches completos por filho ou para toda a família." },
    { property: "og:title", content: "Lancheira — Planeador de lanches escolares" },
    { property: "og:description", content: "Lanches saudáveis, receitas e uma lista de compras pronta para a semana." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ]}),
  component: Index,
});

function Index() {
  const [tab, setTab] = useState<Tab>("plano");
  const [children, setChildren] = useState<Child[]>(demoChildren);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [plan, setPlan] = useState<PlanCell[]>([]);
  const [familyMode, setFamilyMode] = useState(true);
  const [period, setPeriod] = useState<"week" | "month">("week");
  const [selectedChild, setSelectedChild] = useState("all");
  const [modal, setModal] = useState<"child" | "recipe" | "auth" | null>(null);
  const [search, setSearch] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      const [{ data: recipeData }, { data: auth }] = await Promise.all([
        supabase.from("recipes").select("*").order("created_at"),
        supabase.auth.getUser(),
      ]);
      if (!active) return;
      if (recipeData) setRecipes(recipeData);
      if (auth.user) {
        setSessionId(auth.user.id);
        const { data } = await supabase.from("children").select("*").order("created_at");
        if (data?.length) setChildren(data);
      }
    }
    load();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!recipes.length || plan.length) return;
    const next: PlanCell[] = [];
    for (let day = 0; day < 5; day++) {
      const common = recipes.find((r) => children.every((c) => r.min_age <= c.age && r.max_age >= c.age) && (children.some((c) => c.training_days.includes(day)) ? r.training_suitable : true)) ?? recipes[day % recipes.length];
      children.forEach((child) => {
        for (let snack = 1; snack <= child.snacks_per_day; snack++) {
          const training = child.training_days.includes(day);
          const suitable = recipes.filter((r) => r.min_age <= child.age && r.max_age >= child.age && (!training || r.training_suitable));
          next.push({ childId: child.id, day, snack, recipeId: snack === 1 && common ? common.id : (suitable[(day + snack) % suitable.length]?.id ?? common?.id ?? ""), training });
        }
      });
    }
    setPlan(next);
  }, [recipes, children, plan.length]);

  const visibleChildren = selectedChild === "all" ? children : children.filter((c) => c.id === selectedChild);
  const shopping = useMemo(() => {
    const totals = new Map<string, { quantity: number; unit: string }>();
    plan.filter((p) => visibleChildren.some((c) => c.id === p.childId)).forEach((p) => {
      const recipe = recipes.find((r) => r.id === p.recipeId);
      const ingredients = Array.isArray(recipe?.ingredients) ? recipe.ingredients as Ingredient[] : [];
      ingredients.forEach((item) => {
        const old = totals.get(item.name) ?? { quantity: 0, unit: item.unit };
        totals.set(item.name, { quantity: old.quantity + item.quantity / Math.max(recipe?.portions ?? 1, 1), unit: item.unit });
      });
    });
    return [...totals].sort(([a], [b]) => a.localeCompare(b));
  }, [plan, recipes, visibleChildren]);

  function regenerate() {
    setPlan([]);
    setNotice("Plano ajustado às idades, número de lanches e dias de treino.");
    window.setTimeout(() => setNotice(""), 3200);
  }

  async function savePlan() {
    if (!sessionId) { setModal("auth"); return; }
    const chosenChild = selectedChild === "all" ? null : selectedChild;
    const { data: saved, error } = await supabase.from("meal_plans").insert({
      user_id: sessionId,
      title: period === "week" ? "Plano semanal" : "Plano mensal",
      period_type: period,
      plan_mode: chosenChild ? "child" : "family",
      child_id: chosenChild,
      starts_on: "2026-09-14",
    }).select().single();
    if (error || !saved) { setNotice("Não foi possível guardar o plano."); return; }
    const baseDate = new Date("2026-09-14T12:00:00");
    const rows = plan.map((item) => {
      const date = new Date(baseDate); date.setDate(date.getDate() + item.day);
      return { plan_id: saved.id, child_id: item.childId, recipe_id: item.recipeId, snack_date: date.toISOString().slice(0,10), snack_number: item.snack, training_boost: item.training };
    });
    const { error: itemError } = await supabase.from("plan_items").insert(rows);
    setNotice(itemError ? "O plano foi criado, mas faltaram alguns lanches." : "Plano guardado com sucesso.");
  }

  async function addChild(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const child: Child = { id: crypto.randomUUID(), name: String(form.get("name")), age: Number(form.get("age")), snacks_per_day: Number(form.get("snacks")), training_days: form.getAll("training").map(Number), training_timing: String(form.get("timing")) };
    if (sessionId) {
      const { data, error } = await supabase.from("children").insert({ ...child, user_id: sessionId }).select().single();
      if (!error && data) setChildren((old) => [...old, data]);
    } else setChildren((old) => [...old, child]);
    setPlan([]); setModal(null);
  }

  async function addRecipe(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const ingredients = String(form.get("ingredients")).split("\n").filter(Boolean).map((line) => ({ name: line.trim(), quantity: 1, unit: "un" }));
    const payload = { user_id: sessionId, name: String(form.get("name")), description: String(form.get("description")), min_age: Number(form.get("minAge")), max_age: 18, prep_minutes: Number(form.get("time")), portions: Number(form.get("portions")), ingredients, nutrition_tags: form.getAll("nutrition").map(String), meal_components: form.getAll("components").map(String), training_suitable: form.get("training") === "on", freezable: form.get("freezable") === "on" };
    if (!sessionId) { setModal("auth"); return; }
    const { data, error } = await supabase.from("recipes").insert(payload).select().single();
    if (!error && data) setRecipes((old) => [...old, data]);
    setModal(null);
  }

  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const email = String(form.get("email")); const password = String(form.get("password"));
    const result = authMode === "login" ? await supabase.auth.signInWithPassword({ email, password }) : await supabase.auth.signUp({ email, password });
    if (result.error) setNotice(result.error.message); else if (result.data.user) { setSessionId(result.data.user.id); setModal(null); setNotice(authMode === "signup" && !result.data.session ? "Confirme o email para entrar." : "Sessão iniciada."); }
  }

  async function googleLogin() {
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (result.error) setNotice(result.error.message);
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6">
          <div className="flex items-center gap-2"><span className="grid size-9 place-items-center rounded-md bg-primary text-primary-foreground"><Apple size={20} /></span><span className="font-display text-2xl">Lancheira</span></div>
          <nav className="ml-auto hidden items-center gap-1 md:flex" aria-label="Navegação principal">
            {([['plano','Plano',CalendarDays],['receitas','Receitas',UtensilsCrossed],['compras','Compras',ShoppingBasket],['familia','Família',UserRound]] as const).map(([id,label,Icon]) => <Button key={id} variant={tab === id ? "secondary" : "ghost"} onClick={() => setTab(id)}><Icon size={17}/>{label}</Button>)}
          </nav>
          {sessionId ? <span className="hidden rounded-full bg-leaf-soft px-3 py-1 text-xs font-bold text-primary sm:block">Plano guardado</span> : <Button size="sm" variant="outline" onClick={() => setModal("auth")}><LogIn size={16}/>Entrar</Button>}
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 pb-24 pt-8 sm:px-6">
        {notice && <div className="fixed right-5 top-20 z-50 rounded-md bg-foreground px-4 py-3 text-sm text-background shadow-xl">{notice}</div>}
        {tab === "plano" && <PlanView children={visibleChildren} allChildren={children} recipes={recipes} plan={plan} familyMode={familyMode} selectedChild={selectedChild} setSelectedChild={setSelectedChild} setFamilyMode={setFamilyMode} period={period} setPeriod={setPeriod} regenerate={regenerate} savePlan={savePlan} />}
        {tab === "receitas" && <RecipesView recipes={recipes} search={search} setSearch={setSearch} openAdd={() => setModal("recipe")} />}
        {tab === "compras" && <ShoppingView items={shopping} childName={selectedChild === "all" ? "toda a família" : visibleChildren[0]?.name ?? "plano"} />}
        {tab === "familia" && <FamilyView children={children} openAdd={() => setModal("child")} />}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-border bg-background p-2 md:hidden">
        {([['plano','Plano',CalendarDays],['receitas','Receitas',UtensilsCrossed],['compras','Compras',ShoppingBasket],['familia','Família',UserRound]] as const).map(([id,label,Icon]) => <Button key={id} variant="ghost" className={tab === id ? "text-primary" : ""} onClick={() => setTab(id)}><span className="flex flex-col items-center text-xs"><Icon size={18}/>{label}</span></Button>)}
      </nav>
      {modal && <Modal title={modal === "child" ? "Adicionar criança" : modal === "recipe" ? "Nova receita" : "Guardar os meus planos"} close={() => setModal(null)}>{modal === "child" ? <ChildForm submit={addChild}/> : modal === "recipe" ? <RecipeForm submit={addRecipe}/> : <AuthForm submit={authenticate} google={googleLogin} mode={authMode} setMode={setAuthMode}/>}</Modal>}
    </div>
  );
}

function PageHeading({ eyebrow, title, text, action }: { eyebrow: string; title: string; text: string; action?: React.ReactNode }) {
  return <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="mb-2 text-xs font-extrabold uppercase text-primary">{eyebrow}</p><h1 className="text-4xl sm:text-5xl">{title}</h1><p className="mt-2 max-w-2xl text-muted-foreground">{text}</p></div>{action}</div>;
}

function PlanView({ children, allChildren, recipes, plan, familyMode, selectedChild, setSelectedChild, setFamilyMode, period, setPeriod, regenerate, savePlan }: { children: Child[]; allChildren: Child[]; recipes: Recipe[]; plan: PlanCell[]; familyMode: boolean; selectedChild: string; setSelectedChild:(v:string)=>void; setFamilyMode:(v:boolean)=>void; period:"week"|"month"; setPeriod:(v:"week"|"month")=>void; regenerate:()=>void; savePlan:()=>void }) {
  return <section><PageHeading eyebrow={period === "week" ? "Semana de 14 a 18 de setembro" : "Setembro de 2026 · 4 semanas"} title="O que vai na lancheira?" text={`${period === "week" ? "Uma semana" : "Um mês"} equilibrado, adaptado a cada idade e aos dias com mais energia.`} action={<div className="flex gap-2"><Button variant="outline" onClick={savePlan}><Check size={17}/>Guardar</Button><Button onClick={regenerate}><Sparkles size={17}/>Gerar novo plano</Button></div>}/>
    <div className="mb-6 flex flex-wrap items-center gap-3">
      <div className="inline-flex rounded-md border border-border bg-card p-1"><Button size="sm" variant={period === "week" ? "secondary":"ghost"} onClick={()=>setPeriod("week")}>Semana</Button><Button size="sm" variant={period === "month" ? "secondary":"ghost"} onClick={()=>setPeriod("month")}>Mês</Button></div>
      <div className="inline-flex rounded-md border border-border bg-card p-1"><Button size="sm" variant={familyMode ? "secondary":"ghost"} onClick={()=>{setFamilyMode(true);setSelectedChild("all")}}>Agregado</Button><Button size="sm" variant={!familyMode ? "secondary":"ghost"} onClick={()=>{setFamilyMode(false);setSelectedChild(allChildren[0]?.id ?? "all")}}>Por filho</Button></div>
      {!familyMode && <select value={selectedChild} onChange={(e)=>setSelectedChild(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">{allChildren.map((c)=><option key={c.id} value={c.id}>{c.name}</option>)}</select>}
      <p className="text-sm text-muted-foreground">No plano agregado, repetimos receitas adequadas para poupar preparação.</p>
    </div>
    {period === "month" && <div className="mb-5 grid grid-cols-4 gap-2">{[1,2,3,4].map((week)=><button key={week} className={`rounded-md border p-3 text-left text-sm ${week===1?'border-primary bg-leaf-soft':'border-border bg-card'}`} onClick={()=>setPeriod("week")}><b>Semana {week}</b><span className="block text-xs text-muted-foreground">{week===1?'14–18 set':week===2?'21–25 set':week===3?'28 set–2 out':'5–9 out'}</span></button>)}</div>}
    <div className="overflow-x-auto border-y border-border bg-card"><div className="grid min-w-[920px] grid-cols-[150px_repeat(5,minmax(145px,1fr))]">
      <div className="border-b border-r border-border p-4 text-sm font-bold text-muted-foreground">Criança</div>{weekDays.map((d,i)=><div key={d} className="border-b border-r border-border p-4"><b>{d}</b><span className="ml-2 text-xs text-muted-foreground">{14+i} set</span></div>)}
      {children.map((child)=><div className="contents" key={child.id}><div className="border-b border-r border-border p-4"><div className="mb-1 flex size-10 items-center justify-center rounded-full bg-leaf-soft font-bold text-primary">{child.name[0]}</div><b>{child.name}</b><p className="text-xs text-muted-foreground">{child.age} anos · {child.snacks_per_day} {child.snacks_per_day===1?'lanche':'lanches'}</p></div>{weekDays.map((_,day)=>{const cells=plan.filter((p)=>p.childId===child.id&&p.day===day);return <div key={day} className="min-h-36 border-b border-r border-border p-3">{cells.map((cell)=>{const r=recipes.find((x)=>x.id===cell.recipeId);return <div key={cell.snack} className="mb-2 rounded-md bg-muted p-3"><div className="mb-2 flex items-center justify-between"><span className="text-[11px] font-extrabold uppercase text-primary">Lanche {cell.snack}</span>{cell.training&&<Dumbbell size={15} className="text-berry"/>}</div><p className="text-sm font-bold leading-tight">{r?.name ?? "A preparar…"}</p><p className="mt-1 text-xs text-muted-foreground">+ fruta · proteína · água</p></div>})}{child.training_days.includes(day)&&<span className="text-[11px] font-bold text-berry">Dia de treino · reforçado</span>}</div>})}</div>)}
    </div></div>
    <div className="mt-6 flex items-center gap-3 border-l-4 border-primary bg-leaf-soft p-4 text-sm"><Check className="shrink-0 text-primary"/><p><b>Lanche completo:</b> cada sugestão combina hidratos, proteína, fruta ou vegetal e água. Nos treinos, a porção e a energia são reforçadas.</p></div>
  </section>;
}

function RecipesView({ recipes, search, setSearch, openAdd }: { recipes: Recipe[]; search:string; setSearch:(v:string)=>void; openAdd:()=>void }) {
  const images=[muffins.url,lunchbox.url,fruitBoxes.url]; const shown=recipes.filter((r)=>r.name.toLowerCase().includes(search.toLowerCase()));
  return <section><PageHeading eyebrow={`${recipes.length} receitas na coleção`} title="Receitas para dias reais" text="Opções práticas, completas e pensadas para preparar sem complicar." action={<Button onClick={openAdd}><Plus size={17}/>Adicionar receita</Button>}/><div className="relative mb-7 max-w-md"><Search className="absolute left-3 top-3 text-muted-foreground" size={18}/><input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Pesquisar receitas…" className="h-11 w-full rounded-md border border-input bg-card pl-10 pr-4"/></div><div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{shown.map((r,i)=><article key={r.id} className="overflow-hidden rounded-md border border-border bg-card"><img src={images[i%3]} alt={r.name} className="aspect-[4/3] w-full object-cover" loading="lazy"/><div className="p-5"><div className="mb-3 flex gap-2">{r.freezable&&<span className="rounded-full bg-leaf-soft px-2 py-1 text-xs font-bold text-primary"><Snowflake size={12} className="mr-1 inline"/>Congela</span>}{r.training_suitable&&<span className="rounded-full bg-accent px-2 py-1 text-xs font-bold text-accent-foreground"><Dumbbell size={12} className="mr-1 inline"/>Treino</span>}</div><h2 className="text-2xl">{r.name}</h2><p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{r.description}</p><div className="mt-4 flex items-center justify-between border-t border-border pt-4 text-xs text-muted-foreground"><span><Clock3 size={14} className="mr-1 inline"/>{r.prep_minutes+r.cook_minutes} min</span><span>{r.min_age}–{r.max_age} anos</span><span>{r.portions} porções</span></div></div></article>)}</div></section>;
}

function ShoppingView({ items, childName }: { items:[string,{quantity:number;unit:string}][]; childName:string }) {
  const [checked,setChecked]=useState<string[]>([]); return <section><PageHeading eyebrow="Lista consolidada" title="Compras da semana" text={`Tudo o que precisa para o plano de ${childName}, somado numa única lista.`} action={<Button variant="outline" onClick={()=>window.print()}><ShoppingBasket size={17}/>Imprimir lista</Button>}/><div className="grid gap-8 lg:grid-cols-[1fr_320px]"><div className="border-y border-border bg-card">{items.length ? items.map(([name,value])=><label key={name} className="flex cursor-pointer items-center gap-4 border-b border-border px-5 py-4"><input type="checkbox" checked={checked.includes(name)} onChange={()=>setChecked((old)=>old.includes(name)?old.filter((x)=>x!==name):[...old,name])} className="size-5 accent-primary"/><span className={`flex-1 font-semibold ${checked.includes(name)?'text-muted-foreground line-through':''}`}>{name}</span><span className="text-sm text-muted-foreground">{Math.ceil(value.quantity*10)/10} {value.unit}</span></label>) : <p className="p-8 text-muted-foreground">O plano ainda está a ser preparado.</p>}</div><aside className="self-start rounded-md bg-primary p-6 text-primary-foreground"><ShoppingBasket size={28}/><h2 className="mt-4 text-2xl">{checked.length} de {items.length}</h2><p className="mt-2 text-sm opacity-80">ingredientes já estão no carrinho.</p><div className="mt-6 h-2 overflow-hidden rounded-full bg-primary-foreground/20"><div className="h-full bg-primary-foreground" style={{width:`${items.length?checked.length/items.length*100:0}%`}}/></div></aside></div></section>;
}

function FamilyView({ children, openAdd }: { children:Child[]; openAdd:()=>void }) {
  return <section><PageHeading eyebrow="A sua família" title="Cada criança, o seu ritmo" text="As idades, rotinas e treinos ajudam a ajustar porções e combinações." action={<Button onClick={openAdd}><Plus size={17}/>Adicionar criança</Button>}/><div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{children.map((c,i)=><article key={c.id} className="rounded-md border border-border bg-card p-6"><div className={`mb-5 grid size-14 place-items-center rounded-full ${i%2?'bg-accent':'bg-leaf-soft'} text-xl font-extrabold text-primary`}>{c.name[0]}</div><h2 className="text-3xl">{c.name}</h2><p className="mt-1 text-muted-foreground">{c.age} anos · {c.snacks_per_day} {c.snacks_per_day===1?'lanche':'lanches'} por dia</p><div className="mt-5 border-t border-border pt-4"><p className="mb-2 text-xs font-extrabold uppercase text-muted-foreground">Dias de treino</p><div className="flex flex-wrap gap-2">{c.training_days.length?c.training_days.map((d)=><span key={d} className="rounded-full bg-accent px-3 py-1 text-xs font-bold text-accent-foreground"><Dumbbell size={12} className="mr-1 inline"/>{fullDays[d]}</span>):<span className="text-sm text-muted-foreground">Sem treinos definidos</span>}</div></div></article>)}</div></section>;
}

function Modal({title,close,children}:{title:string;close:()=>void;children:React.ReactNode}) { return <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4" onMouseDown={close}><div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-md bg-background p-6 shadow-2xl" onMouseDown={(e)=>e.stopPropagation()}><div className="mb-6 flex items-center justify-between"><h2 className="text-3xl">{title}</h2><Button variant="ghost" size="icon" onClick={close} aria-label="Fechar"><X/></Button></div>{children}</div></div> }
const inputClass="h-11 w-full rounded-md border border-input bg-background px-3 text-sm";
function ChildForm({submit}:{submit:(e:FormEvent<HTMLFormElement>)=>void}) { return <form onSubmit={submit} className="space-y-5"><label className="block text-sm font-bold">Nome<input name="name" required className={`${inputClass} mt-2`}/></label><div className="grid grid-cols-2 gap-4"><label className="text-sm font-bold">Idade<input name="age" type="number" min="2" max="18" required className={`${inputClass} mt-2`}/></label><label className="text-sm font-bold">Lanches por dia<select name="snacks" className={`${inputClass} mt-2`}><option value="1">1 lanche</option><option value="2">2 lanches</option><option value="3">3 lanches</option></select></label></div><fieldset><legend className="mb-2 text-sm font-bold">Dias de treino</legend><div className="flex flex-wrap gap-2">{weekDays.map((d,i)=><label key={d} className="rounded-md border border-border px-3 py-2 text-sm"><input type="checkbox" name="training" value={i} className="mr-2 accent-primary"/>{d}</label>)}</div></fieldset><label className="block text-sm font-bold">Momento<select name="timing" className={`${inputClass} mt-2`}><option value="before">Antes do treino</option><option value="after">Depois do treino</option></select></label><Button type="submit" className="w-full">Guardar criança</Button></form> }
function RecipeForm({submit}:{submit:(e:FormEvent<HTMLFormElement>)=>void}) { return <form onSubmit={submit} className="space-y-4"><label className="block text-sm font-bold">Nome<input name="name" required className={`${inputClass} mt-1`}/></label><label className="block text-sm font-bold">Descrição<textarea name="description" className="mt-1 min-h-20 w-full rounded-md border border-input bg-background p-3"/></label><div className="grid grid-cols-3 gap-3"><label className="text-xs font-bold">Idade mínima<input name="minAge" type="number" defaultValue="3" className={`${inputClass} mt-1`}/></label><label className="text-xs font-bold">Minutos<input name="time" type="number" defaultValue="15" className={`${inputClass} mt-1`}/></label><label className="text-xs font-bold">Porções<input name="portions" type="number" defaultValue="4" className={`${inputClass} mt-1`}/></label></div><label className="block text-sm font-bold">Ingredientes, um por linha<textarea name="ingredients" required placeholder={'Banana\nAveia\nOvos'} className="mt-1 min-h-28 w-full rounded-md border border-input bg-background p-3"/></label><fieldset><legend className="text-sm font-bold">Componentes do lanche</legend><div className="mt-2 flex flex-wrap gap-3">{['hidratos','proteína','fruta','vegetal'].map((x)=><label key={x} className="text-sm"><input name="components" value={x} type="checkbox" className="mr-1 accent-primary"/>{x}</label>)}</div></fieldset><div className="flex gap-5"><label className="text-sm"><input name="freezable" type="checkbox" className="mr-2 accent-primary"/>Pode congelar</label><label className="text-sm"><input name="training" type="checkbox" className="mr-2 accent-primary"/>Adequado a treino</label></div><Button type="submit" className="w-full">Guardar receita</Button></form> }
function AuthForm({submit,google,mode,setMode}:{submit:(e:FormEvent<HTMLFormElement>)=>void;google:()=>void;mode:"login"|"signup";setMode:(m:"login"|"signup")=>void}) { return <div><p className="mb-5 text-sm text-muted-foreground">Entre para guardar perfis, receitas e planos em segurança.</p><Button variant="outline" className="mb-4 w-full" onClick={google}>Continuar com Google</Button><div className="mb-4 flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border"/>ou com email<span className="h-px flex-1 bg-border"/></div><form onSubmit={submit} className="space-y-3"><input name="email" type="email" required placeholder="Email" className={inputClass}/><input name="password" type="password" required minLength={6} placeholder="Palavra-passe" className={inputClass}/><Button type="submit" className="w-full">{mode==='login'?'Entrar':'Criar conta'}</Button></form><Button variant="ghost" className="mt-2 w-full" onClick={()=>setMode(mode==='login'?'signup':'login')}>{mode==='login'?'Ainda não tenho conta':'Já tenho conta'}</Button></div> }
