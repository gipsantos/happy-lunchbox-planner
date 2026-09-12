import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Apple, ArrowUpDown, Pencil, CalendarDays, Camera, Check, ChevronRight, Clock3, Dumbbell, FileUp, Image as ImageIcon, LayoutGrid, List, LogIn, MessageCircle, Plus, Sandwich, Search, ShoppingBasket, Snowflake, Sparkles, UserRound, UtensilsCrossed, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { importPlanText, type ImportResult } from "@/lib/import.functions";
import muffins from "@/assets/muffins-banana.jpeg.asset.json";
import lunchbox from "@/assets/lancheira-colorida.jpeg.asset.json";
import fruitBoxes from "@/assets/caixas-fruta.jpeg.asset.json";

type Tab = "plano" | "lancheiras" | "receitas" | "compras" | "familia";
type Child = Pick<Tables<"children">, "id" | "name" | "age" | "snacks_per_day" | "training_days" | "training_timing">;
type Recipe = Tables<"recipes">;
type Lunchbox = Tables<"lunchboxes">;
type LunchItem = { label: string; kind: "recipe" | "bought" };
type Ingredient = { name: string; quantity: number; unit: string };
type PlanCell = { childId: string; day: number; snack: number; recipeId: string | null; lunchboxId: string | null; training: boolean; label?: string | undefined };

const itemsOf = (box: Lunchbox) => (Array.isArray(box.items) ? (box.items as LunchItem[]) : []);
const ingredientsOf = (value: unknown) => (Array.isArray(value) ? (value as Ingredient[]) : []);
const storedImage = (row: { image_url?: string | null }) => row.image_url ?? "";

async function fileToSmallImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const max = 640;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.72);
}

function ImagePicker({ label, onPick, className = "" }: { label: string; onPick: (dataUrl: string) => void; className?: string }) {
  const [open, setOpen] = useState(false);
  const input = (capture: boolean, text: string, Icon: typeof ImageIcon) => (
    <label className="flex cursor-pointer items-center gap-2 px-3 py-2 text-xs font-bold hover:bg-muted">
      <Icon size={13} />
      {text}
      <input
        type="file"
        accept="image/*"
        {...(capture ? { capture: "environment" as const } : {})}
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.currentTarget.value = "";
          setOpen(false);
          if (file) onPick(await fileToSmallImage(file));
        }}
      />
    </label>
  );
  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="flex w-full items-center justify-center gap-1 rounded-full bg-background/90 px-3 py-1 text-xs font-bold text-foreground shadow"
      >
        <ImageIcon size={12} />
        {label}
      </button>
      {open && (
        <div className="absolute bottom-full right-0 z-50 mb-1 w-44 overflow-hidden rounded-md border border-border bg-background py-1 text-left shadow-xl" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
          {input(false, "Escolher imagem", ImageIcon)}
          {input(true, "Tirar fotografia", Camera)}
        </div>
      )}
    </div>
  );
}

function ViewToggle({ view, setView }: { view: "cards" | "lista"; setView: (v: "cards" | "lista") => void }) {
  return <div className="flex items-center justify-center gap-1 rounded-md border border-border bg-card p-1">
    <Button size="sm" variant={view === "cards" ? "secondary" : "ghost"} onClick={() => setView("cards")} aria-pressed={view === "cards"}><LayoutGrid size={15}/>Cartões</Button>
    <Button size="sm" variant={view === "lista" ? "secondary" : "ghost"} onClick={() => setView("lista")} aria-pressed={view === "lista"}><List size={15}/>Lista</Button>
  </div>;
}

function useView(key: string) {
  const [view, setView] = useState<"cards" | "lista">("cards");
  useEffect(() => {
    const stored = localStorage.getItem(key);
    if (stored === "cards" || stored === "lista") setView(stored);
  }, [key]);
  return [view, (v: "cards" | "lista") => { setView(v); localStorage.setItem(key, v); }] as const;
}

function findRecipeForItem(recipes: Recipe[], label: string) {
  const l = label.toLowerCase();
  return recipes.find((r) => l.includes(r.name.toLowerCase()) || r.name.toLowerCase().includes(l)) ?? null;
}

function LunchboxDetail({ box, image, setImage, picked, toggle, close, recipes, openRecipe, extra }: { box: Lunchbox; image: string; setImage:(url:string)=>void; picked:boolean; toggle:()=>void; close:()=>void; recipes: Recipe[]; openRecipe?:(id:string)=>void; extra?: ReactNode }) {
  return <Modal title={box.name} close={close}>
    <div className="relative mb-5"><img src={image} alt={box.name} className="max-h-48 w-full rounded-md object-cover"/><ImagePicker label="Alterar imagem" className="absolute bottom-3 right-3 w-40" onPick={setImage}/></div>
    <p className="mb-4 text-sm text-muted-foreground">{box.description}</p>
    <div className="mb-5 flex flex-wrap gap-2 text-xs">{box.components.map((c)=><span key={c} className="rounded-full bg-muted px-2 py-1 font-bold">{c}</span>)}<span className="rounded-full bg-muted px-2 py-1 font-bold">{box.min_age}–{box.max_age} anos</span>{box.training_suitable&&<span className="rounded-full bg-accent px-2 py-1 font-bold text-accent-foreground"><Dumbbell size={12} className="mr-1 inline"/>Treino</span>}{!box.needs_prep&&<span className="rounded-full bg-leaf-soft px-2 py-1 font-bold text-primary">Sem preparação</span>}</div>
    <h3 className="mb-2 text-sm font-extrabold uppercase tracking-wide text-muted-foreground">O que vai na lancheira</h3>
    <ul className="mb-5 space-y-1 text-sm">{itemsOf(box).map((i)=>{const rec=i.kind==="recipe"?findRecipeForItem(recipes,i.label):null;const inner=<><span className={`size-1.5 shrink-0 rounded-full ${i.kind==="recipe"?"bg-primary":"bg-accent"}`}/><span className="flex-1">{i.label} <span className="text-xs text-muted-foreground">{i.kind==="recipe"?"receita":"comprado"}</span></span></>;return <li key={i.label}>{rec&&openRecipe?<button type="button" onClick={()=>openRecipe(rec.id)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left font-bold text-primary transition-colors hover:bg-leaf-soft">{inner}<ChevronRight size={15} className="shrink-0"/></button>:<div className="flex items-center gap-2 px-2 py-1.5">{inner}</div>}</li>})}</ul>
    {ingredientsOf(box.ingredients).length>0&&<><h3 className="mb-2 text-sm font-extrabold uppercase tracking-wide text-muted-foreground">Para comprar</h3><ul className="mb-5 space-y-1 text-sm">{ingredientsOf(box.ingredients).map((ing,i)=><li key={i} className="flex justify-between gap-4 border-b border-border pb-1"><span>{ing.name}</span><span className="shrink-0 text-muted-foreground">{ing.quantity} {ing.unit}</span></li>)}</ul></>}
    {extra ?? <Button className="w-full" variant={picked?"secondary":"default"} onClick={toggle}>{picked?<><Check size={17}/>No plano semanal — retirar</>:<><Plus size={17}/>Adicionar ao plano semanal</>}</Button>}
  </Modal>;
}

function RecipeDetail({ recipe, image, setImage, picked, toggle, close, extra }: { recipe: Recipe; image: string; setImage:(url:string)=>void; picked:boolean; toggle:()=>void; close:()=>void; extra?: ReactNode }) {
  return <Modal title={recipe.name} close={close}>
    <div className="relative mb-5"><img src={image} alt={recipe.name} className="max-h-48 w-full rounded-md object-cover"/><ImagePicker label="Alterar imagem" className="absolute bottom-3 right-3 w-40" onPick={setImage}/></div>
    <p className="mb-4 text-sm text-muted-foreground">{recipe.description}</p>
    <div className="mb-5 flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-muted px-2 py-1 font-bold"><Clock3 size={12} className="mr-1 inline"/>{recipe.prep_minutes+recipe.cook_minutes} min</span><span className="rounded-full bg-muted px-2 py-1 font-bold">{recipe.min_age}–{recipe.max_age} anos</span><span className="rounded-full bg-muted px-2 py-1 font-bold">{recipe.portions} porções</span>{recipe.freezable&&<span className="rounded-full bg-leaf-soft px-2 py-1 font-bold text-primary"><Snowflake size={12} className="mr-1 inline"/>Congela</span>}{recipe.training_suitable&&<span className="rounded-full bg-accent px-2 py-1 font-bold text-accent-foreground"><Dumbbell size={12} className="mr-1 inline"/>Treino</span>}</div>
    <h3 className="mb-2 text-sm font-extrabold uppercase tracking-wide text-muted-foreground">Ingredientes</h3>
    <ul className="mb-5 space-y-1 text-sm">{ingredientsOf(recipe.ingredients).map((ing,i)=><li key={i} className="flex justify-between gap-4 border-b border-border pb-1"><span>{ing.name}</span><span className="shrink-0 text-muted-foreground">{ing.quantity} {ing.unit}</span></li>)}</ul>
    {recipe.instructions.length>0&&<><h3 className="mb-2 text-sm font-extrabold uppercase tracking-wide text-muted-foreground">Preparação</h3><ol className="list-decimal space-y-2 pl-5 text-sm">{recipe.instructions.map((step,i)=><li key={i}>{step}</li>)}</ol></>}
    {extra ?? <Button className="mt-6 w-full" variant={picked?"secondary":"default"} onClick={toggle}>{picked?<><Check size={17}/>No plano semanal — retirar</>:<><Plus size={17}/>Adicionar ao plano semanal</>}</Button>}
  </Modal>;
}



const demoChildren: Child[] = [
  { id: "ines", name: "Inês", age: 5, snacks_per_day: 1, training_days: [2], training_timing: "after" },
  { id: "matilde", name: "Matilde", age: 12, snacks_per_day: 2, training_days: [1, 3], training_timing: "before" },
];
const weekDays = ["Seg", "Ter", "Qua", "Qui", "Sex"];
const fullDays = ["segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira"];
const monthsShort = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function mondayOf(base = new Date()) {
  const d = new Date(base);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}
const addDays = (base: Date, n: number) => { const d = new Date(base); d.setDate(d.getDate() + n); return d; };
const isoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parseIso = (value: string) => new Date(`${value}T12:00:00`);
const shortLabel = (d: Date) => `${d.getDate()} ${monthsShort[d.getMonth()]}`;
// dia 0..N do plano -> data real (5 dias úteis por semana)
const dateOfPlanDay = (start: Date, day: number) => addDays(start, Math.floor(day / 5) * 7 + (day % 5));
const planDayOfDate = (start: Date, value: string) => {
  const diff = Math.round((parseIso(value).getTime() - start.getTime()) / 86400000);
  const weekday = diff % 7;
  if (weekday < 0 || weekday > 4 || diff < 0) return -1;
  return Math.floor(diff / 7) * 5 + weekday;
};


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
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("plano");
  const [genCount, setGenCount] = useState(0);
  const [children, setChildren] = useState<Child[]>(demoChildren);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [lunchboxes, setLunchboxes] = useState<Lunchbox[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [pickedRecipes, setPickedRecipes] = useState<string[]>([]);
  const [plan, setPlan] = useState<PlanCell[]>([]);
  const [familyMode, setFamilyMode] = useState(true);
  const [period, setPeriod] = useState<"week" | "month">("week");
  const [weekStartIso, setWeekStartIso] = useState("");
  const [restoring, setRestoring] = useState(true);
  const [cleared, setCleared] = useState(false);
  const [selectedChild, setSelectedChild] = useState("all");

  const [modal, setModal] = useState<"child" | "recipe" | "import" | null>(null);
  const [search, setSearch] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  const [images, setImages] = useState<Record<string, string>>({});
  const [editingChild, setEditingChild] = useState<Child | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      if (!data.user) { navigate({ to: "/auth", replace: true }); return; }
      setAuthChecked(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") navigate({ to: "/auth", replace: true });
      else if (session?.user && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) setAuthChecked(true);
    });
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, [navigate]);

  const loadingScreen = (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="text-center">
        <span className="grid size-12 place-items-center rounded-xl bg-primary text-primary-foreground mx-auto mb-4"><Apple size={24} /></span>
        <p className="text-sm text-muted-foreground">A preparar a sua lancheira…</p>
      </div>
    </div>
  );


  function goLogin() { navigate({ to: "/auth" }); }

  async function signOut() {
    await supabase.auth.signOut();
    setSessionId(null);
    flash("Sessão terminada.");
  }

  function flash(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 4000);
  }

  async function setImage(table: "recipes" | "lunchboxes" | "children", id: string, dataUrl: string) {
    setImages((old) => ({ ...old, [id]: dataUrl }));
    if (!sessionId) { flash("Entre na sua conta para guardar a imagem."); return; }
    const column = table === "children" ? "photo_url" : "image_url";
    const { error } = await supabase.from(table).update({ [column]: dataUrl } as never).eq("id", id);
    flash(error ? "A imagem aparece agora, mas não ficou guardada nesta sugestão da app." : "Imagem atualizada.");
  }

  async function removeChild(id: string) {
    setChildren((old) => old.filter((c) => c.id !== id));
    setPlan([]);
    if (sessionId) await supabase.from("children").delete().eq("id", id);
  }

  useEffect(() => {
    let active = true;
    const thisMonday = mondayOf();
    setWeekStartIso(isoDate(thisMonday));
    async function load() {
      const [{ data: recipeData }, { data: boxData }, { data: auth }] = await Promise.all([
        supabase.from("recipes").select("*").order("created_at"),
        supabase.from("lunchboxes").select("*").order("created_at"),
        supabase.auth.getUser(),
      ]);
      if (!active) return;
      if (recipeData) setRecipes(recipeData);
      if (boxData) setLunchboxes(boxData);
      const stored: Record<string, string> = {};
      [...(recipeData ?? []), ...((boxData ?? []) as { id: string; image_url?: string | null }[])].forEach((row) => {
        const url = storedImage(row as { image_url?: string | null });
        if (url) stored[(row as { id: string }).id] = url;
      });
      setImages((old) => ({ ...stored, ...old }));
      if (!auth.user) { setRestoring(false); return; }
      setSessionId(auth.user.id);
      const [{ data: childData }, { data: pickData }, { data: planData }] = await Promise.all([
        supabase.from("children").select("*").order("created_at"),
        supabase.from("lunchbox_selections").select("lunchbox_id"),
        supabase.from("meal_plans").select("*").order("created_at", { ascending: false }).limit(1),
      ]);
      if (!active) return;
      if (childData?.length) {
        setChildren(childData);
        const photos: Record<string, string> = {};
        (childData as { id: string; photo_url?: string | null }[]).forEach((c) => { if (c.photo_url) photos[c.id] = c.photo_url; });
        setImages((old) => ({ ...old, ...photos }));
      }
      if (pickData?.length) setPicked(pickData.map((row) => row.lunchbox_id));
      const savedPlan = planData?.[0];
      if (savedPlan) {
        const { data: itemData } = await supabase.from("plan_items").select("*").eq("plan_id", savedPlan.id);
        if (!active) return;
        const start = parseIso(savedPlan.starts_on);
        const cells: PlanCell[] = (itemData ?? []).flatMap((item) => {
          const day = planDayOfDate(start, item.snack_date);
          if (day < 0 || !item.child_id) return [];
          return [{ childId: item.child_id, day, snack: item.snack_number, recipeId: item.recipe_id, lunchboxId: item.lunchbox_id, training: item.training_boost }];
        });
        if (cells.length) {
          setWeekStartIso(savedPlan.starts_on);
          setPeriod(savedPlan.period_type === "month" ? "month" : "week");
          if (savedPlan.child_id) { setFamilyMode(false); setSelectedChild(savedPlan.child_id); }
          setPlan(cells);
        }
      }
      setRestoring(false);
    }

    load();
    return () => { active = false; };
  }, []);

  const pool = useMemo(() => {
    const chosen = lunchboxes.filter((b) => picked.includes(b.id));
    return chosen.length ? chosen : lunchboxes;
  }, [lunchboxes, picked]);

  const recipePool = useMemo(() => recipes.filter((r) => pickedRecipes.includes(r.id)), [recipes, pickedRecipes]);

  useEffect(() => {
    if (restoring || cleared || (!pool.length && !recipes.length) || plan.length) return;
    type Cand = { id: string; box?: Lunchbox; recipe?: Recipe };
    const next: PlanCell[] = [];
    const rand = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];
    const fits = (box: Lunchbox, age: number, training: boolean) => box.min_age <= age && box.max_age >= age && (!training || box.training_suitable);
    const fitsRecipe = (r: Recipe, age: number, training: boolean) => r.min_age <= age && r.max_age >= age && (!training || r.training_suitable);
    const usedCommon = new Set<string>();
    const yesterdayByChild = new Map<string, Set<string>>();
    const totalDays = period === "month" ? 20 : 5;
    for (let day = 0; day < totalDays; day++) {
      const weekday = day % 5;
      let common: Cand | undefined;
      if (familyMode && children.length > 1) {
        const cands: Cand[] = [
          ...pool.filter((b) => children.every((c) => fits(b, c.age, c.training_days.includes(weekday)))).map((box) => ({ id: box.id, box })),
          ...recipePool.filter((r) => children.every((c) => fitsRecipe(r, c.age, c.training_days.includes(weekday)))).map((recipe) => ({ id: recipe.id, recipe })),
        ];
        let fresh = cands.filter((c) => !usedCommon.has(c.id));
        if (!fresh.length) { usedCommon.clear(); fresh = cands; }
        common = fresh.length ? rand(fresh) : undefined;
        if (common) usedCommon.add(common.id);
      }
      children.forEach((child) => {
        const usedToday = new Set<string>();
        const yesterday = yesterdayByChild.get(child.id) ?? new Set<string>();
        const todayIds: string[] = [];
        for (let snack = 1; snack <= child.snacks_per_day; snack++) {
          const training = child.training_days.includes(weekday);

          const cands: Cand[] = [
            ...pool.filter((b) => fits(b, child.age, training)).map((box) => ({ id: box.id, box })),
            ...recipePool.filter((r) => fitsRecipe(r, child.age, training)).map((recipe) => ({ id: recipe.id, recipe })),
          ];
          if (!cands.length) {
            cands.push(...recipes.filter((r) => fitsRecipe(r, child.age, training)).map((recipe) => ({ id: recipe.id, recipe })));
          }
          let pick: Cand | undefined;
          if (snack === 1 && common && cands.some((c) => c.id === common!.id)) pick = common;
          else {
            let fresh = cands.filter((c) => !usedToday.has(c.id) && !yesterday.has(c.id));
            if (!fresh.length) fresh = cands.filter((c) => !usedToday.has(c.id));
            pick = fresh.length ? rand(fresh) : (cands.length ? rand(cands) : undefined);
          }
          if (pick) {
            usedToday.add(pick.id); todayIds.push(pick.id);
            next.push({ childId: child.id, day, snack, recipeId: pick.recipe?.id ?? null, lunchboxId: pick.box?.id ?? null, training });
          }
        }
        yesterdayByChild.set(child.id, new Set(todayIds));
      });
    }
    setPlan(next);
  }, [pool, recipePool, recipes, children, familyMode, plan.length, genCount, period, restoring, cleared]);

  const visibleChildren = selectedChild === "all" ? children : children.filter((c) => c.id === selectedChild);
  const shopping = useMemo(() => {
    const totals = new Map<string, { quantity: number; unit: string }>();
    const add = (list: Ingredient[], divisor: number) => list.forEach((item) => {
      const old = totals.get(item.name) ?? { quantity: 0, unit: item.unit };
      totals.set(item.name, { quantity: old.quantity + (item.quantity || 1) / Math.max(divisor, 1), unit: item.unit });
    });
    plan.filter((p) => visibleChildren.some((c) => c.id === p.childId)).forEach((p) => {
      const box = lunchboxes.find((b) => b.id === p.lunchboxId);
      if (box) {
        add(ingredientsOf(box.ingredients), 1);
        itemsOf(box).filter((i) => i.kind === "recipe").forEach((item) => {
          const recipe = recipes.find((r) => r.name.toLowerCase() === item.label.toLowerCase());
          if (recipe) add(ingredientsOf(recipe.ingredients), recipe.portions);
        });
        return;
      }
      const recipe = recipes.find((r) => r.id === p.recipeId);
      if (recipe) add(ingredientsOf(recipe.ingredients), recipe.portions);
    });
    return [...totals].sort(([a], [b]) => a.localeCompare(b));
  }, [plan, recipes, lunchboxes, visibleChildren]);

  function replaceCell(target: { childId: string; day: number; snack: number }, pick: { kind: "box" | "recipe"; id: string }) {
    setPlan((old) => old.map((c) => (c.childId === target.childId && c.day === target.day && c.snack === target.snack
      ? { ...c, lunchboxId: pick.kind === "box" ? pick.id : null, recipeId: pick.kind === "recipe" ? pick.id : null }
      : c)));
    flash("Lanche alterado.");
  }

  function renameCell(target: { childId: string; day: number; snack: number }, label: string) {
    setPlan((old) => old.map((c) => (c.childId === target.childId && c.day === target.day && c.snack === target.snack
      ? { ...c, label: label.trim() || undefined }
      : c)));
    flash("Texto do lanche atualizado.");
  }

  function removeCell(target: { childId: string; day: number; snack: number }) {
    setPlan((old) => old.filter((c) => !(c.childId === target.childId && c.day === target.day && c.snack === target.snack)));
    flash("Lanche retirado do plano.");
  }

  async function clearPlan() {
    setCleared(true);
    setPlan([]);
    if (sessionId) {
      const { data: old } = await supabase.from("meal_plans").select("id").eq("user_id", sessionId);
      if (old?.length) {
        const ids = old.map((row) => row.id);
        await supabase.from("plan_items").delete().in("plan_id", ids);
        await supabase.from("meal_plans").delete().in("id", ids);
      }
    }
    flash("Plano limpo. Use \u201cGerar novo plano\u201d quando quiser começar de novo.");
  }

  function regenerate() {
    setGenCount((c) => c + 1);
    setCleared(false);
    setPlan([]);
    flash(picked.length || pickedRecipes.length ? "Novo plano gerado apenas com as sugestões que escolheu." : "Novo plano ajustado às idades e aos dias de treino.");
  }

  function toggleRecipe(id: string) {
    setPickedRecipes((old) => (old.includes(id) ? old.filter((x) => x !== id) : [...old, id]));
    setPlan([]);
  }

  async function togglePick(id: string) {
    const isPicked = picked.includes(id);
    setPicked((old) => (isPicked ? old.filter((x) => x !== id) : [...old, id]));
    setPlan([]);
    if (!sessionId) return;
    if (isPicked) await supabase.from("lunchbox_selections").delete().eq("lunchbox_id", id).eq("user_id", sessionId);
    else await supabase.from("lunchbox_selections").insert({ user_id: sessionId, lunchbox_id: id });
  }

  async function savePlan() {
    if (!sessionId) { goLogin(); return; }
    const chosenChild = selectedChild === "all" ? null : selectedChild;
    const start = weekStartIso ? parseIso(weekStartIso) : mondayOf();
    const { data: old } = await supabase.from("meal_plans").select("id").eq("user_id", sessionId);
    if (old?.length) {
      const ids = old.map((row) => row.id);
      await supabase.from("plan_items").delete().in("plan_id", ids);
      await supabase.from("meal_plans").delete().in("id", ids);
    }
    const { data: saved, error } = await supabase.from("meal_plans").insert({
      user_id: sessionId,
      title: period === "week" ? "Plano semanal" : "Plano mensal",
      period_type: period,
      plan_mode: chosenChild ? "child" : "family",
      child_id: chosenChild,
      starts_on: isoDate(start),
    }).select().single();
    if (error || !saved) { flash("Não foi possível guardar o plano."); return; }
    const rows = plan.map((item) => ({
      plan_id: saved.id,
      child_id: item.childId,
      recipe_id: item.recipeId,
      lunchbox_id: item.lunchboxId,
      snack_date: isoDate(dateOfPlanDay(start, item.day)),
      snack_number: item.snack,
      training_boost: item.training,
    }));
    const { error: itemError } = await supabase.from("plan_items").insert(rows);
    flash(itemError ? "O plano foi criado, mas faltaram alguns lanches." : "Plano guardado — volta a aparecer quando abrir a app.");
  }


  async function saveImport(result: ImportResult) {
    if (!sessionId) { goLogin(); return; }
    const newRecipes = result.recipes.map((r) => ({ ...r, user_id: sessionId }));
    const newBoxes = result.lunchboxes.map((b) => ({ ...b, user_id: sessionId, source: "import" }));
    const [recipeResult, boxResult] = await Promise.all([
      newRecipes.length ? supabase.from("recipes").insert(newRecipes).select() : Promise.resolve({ data: [], error: null }),
      newBoxes.length ? supabase.from("lunchboxes").insert(newBoxes).select() : Promise.resolve({ data: [], error: null }),
    ]);
    if (recipeResult.data?.length) setRecipes((old) => [...old, ...recipeResult.data as Recipe[]]);
    if (boxResult.data?.length) setLunchboxes((old) => [...old, ...boxResult.data as Lunchbox[]]);
    setModal(null);
    setPlan([]);
    if (recipeResult.error || boxResult.error) flash("Importámos parte do documento; algumas linhas ficaram de fora.");
    else flash(`Importado: ${recipeResult.data?.length ?? 0} receitas e ${boxResult.data?.length ?? 0} lancheiras.`);
  }

  async function addChild(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const fields = { name: String(form.get("name")), age: Number(form.get("age")), snacks_per_day: Number(form.get("snacks")), training_days: form.getAll("training").map(Number), training_timing: String(form.get("timing")) };
    if (editingChild) {
      setChildren((old) => old.map((c) => (c.id === editingChild.id ? { ...c, ...fields } : c)));
      if (sessionId) await supabase.from("children").update(fields).eq("id", editingChild.id);
    } else {
      const child: Child = { id: crypto.randomUUID(), ...fields };
      if (sessionId) {
        const { data, error } = await supabase.from("children").insert({ ...child, user_id: sessionId }).select().single();
        if (!error && data) setChildren((old) => [...old, data]); else setChildren((old) => [...old, child]);
      } else setChildren((old) => [...old, child]);
    }
    setEditingChild(null); setPlan([]); setModal(null);
  }

  async function addRecipe(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const ingredients = String(form.get("ingredients")).split("\n").filter(Boolean).map((line) => ({ name: line.trim(), quantity: 1, unit: "un" }));
    const payload = { user_id: sessionId, name: String(form.get("name")), description: String(form.get("description")), min_age: Number(form.get("minAge")), max_age: 18, prep_minutes: Number(form.get("time")), portions: Number(form.get("portions")), ingredients, nutrition_tags: form.getAll("nutrition").map(String), meal_components: form.getAll("components").map(String), training_suitable: form.get("training") === "on", freezable: form.get("freezable") === "on" };
    if (!sessionId) { goLogin(); return; }
    const { data, error } = await supabase.from("recipes").insert(payload).select().single();
    if (!error && data) setRecipes((old) => [...old, data]);
    setModal(null);
  }

  const tabs = ([['plano','Plano',CalendarDays],['lancheiras','Lancheiras',Sandwich],['receitas','Receitas',UtensilsCrossed],['compras','Compras',ShoppingBasket],['familia','Família',UserRound]] as const);

  if (!authChecked) return loadingScreen;

  return (

    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6">
          <div className="flex items-center gap-2"><span className="grid size-9 place-items-center rounded-md bg-primary text-primary-foreground"><Apple size={20} /></span><span className="font-display text-2xl">Lancheira</span></div>
          <nav className="ml-auto hidden items-center gap-1 md:flex" aria-label="Navegação principal">
            {tabs.map(([id,label,Icon]) => <Button key={id} variant={tab === id ? "secondary" : "ghost"} onClick={() => setTab(id)}><Icon size={17}/>{label}</Button>)}
          </nav>
          {sessionId ? <Button size="sm" variant="ghost" onClick={signOut}>Sair</Button> : <Button size="sm" variant="outline" onClick={goLogin}><LogIn size={16}/>Entrar</Button>}
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 pb-24 pt-8 sm:px-6">
        {notice && <div className="fixed right-5 top-20 z-50 max-w-xs rounded-md bg-foreground px-4 py-3 text-sm text-background shadow-xl">{notice}</div>}
        {!sessionId && <div className="mb-6 flex flex-col gap-3 rounded-md border-l-4 border-berry bg-card p-4 text-sm sm:flex-row sm:items-center print:hidden">
          <p className="flex-1"><b>Está a experimentar sem conta.</b> Os perfis, as escolhas e o plano são apenas de demonstração e desaparecem ao fechar o separador. Entre para guardar tudo.</p>
          <Button size="sm" onClick={goLogin} className="shrink-0"><LogIn size={16}/>Entrar e guardar</Button>
        </div>}
        {tab === "plano" && <PlanView children={visibleChildren} allChildren={children} recipes={recipes} lunchboxes={lunchboxes} picked={picked} pickedRecipes={pickedRecipes} toggleBox={togglePick} toggleRecipe={toggleRecipe} images={images} setImage={setImage} plan={plan} familyMode={familyMode} selectedChild={selectedChild} setSelectedChild={setSelectedChild} setFamilyMode={setFamilyMode} period={period} setPeriod={(v)=>{ setPeriod(v); setPlan([]); }} weekStartIso={weekStartIso} regenerate={regenerate} savePlan={savePlan} replaceCell={replaceCell} renameCell={renameCell} removeCell={removeCell} clearPlan={clearPlan} openLunchboxes={() => setTab("lancheiras")} />}

        {tab === "lancheiras" && <LunchboxesView lunchboxes={lunchboxes} recipes={recipes} picked={picked} pickedRecipes={pickedRecipes} toggle={togglePick} toggleRecipe={toggleRecipe} images={images} setImage={(id,url)=>setImage("lunchboxes",id,url)} setRecipeImage={(id,url)=>setImage("recipes",id,url)} openImport={() => setModal("import")} clear={() => { setPicked([]); setPlan([]); if (sessionId) supabase.from("lunchbox_selections").delete().eq("user_id", sessionId); }} />}
        {tab === "receitas" && <RecipesView recipes={recipes} search={search} setSearch={setSearch} images={images} setImage={(id,url)=>setImage("recipes",id,url)} openAdd={() => setModal("recipe")} openImport={() => setModal("import")} picked={pickedRecipes} toggle={toggleRecipe} />}
        {tab === "compras" && <ShoppingView items={shopping} childName={selectedChild === "all" ? "toda a família" : visibleChildren[0]?.name ?? "plano"} />}
        {tab === "familia" && <FamilyView children={children} images={images} setPhoto={(id,url)=>setImage("children",id,url)} openAdd={() => { setEditingChild(null); setModal("child"); }} openEdit={(child)=>{ setEditingChild(child); setModal("child"); }} remove={removeChild} />}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-background p-2 md:hidden">
        {tabs.map(([id,label,Icon]) => <Button key={id} variant="ghost" className={tab === id ? "text-primary" : ""} onClick={() => setTab(id)}><span className="flex flex-col items-center text-xs"><Icon size={18}/>{label}</span></Button>)}
      </nav>
      {modal && <Modal title={modal === "child" ? (editingChild ? `Editar ${editingChild.name}` : "Adicionar criança") : modal === "recipe" ? "Nova receita" : "Importar plano ou receitas"} close={() => { setModal(null); setEditingChild(null); }}>{modal === "child" ? <ChildForm submit={addChild} child={editingChild}/> : modal === "recipe" ? <RecipeForm submit={addRecipe}/> : <ImportForm save={saveImport} signedIn={Boolean(sessionId)} askLogin={goLogin}/>}</Modal>}
    </div>
  );
}


function PageHeading({ eyebrow, title, text, action }: { eyebrow: string; title: string; text: string; action?: React.ReactNode }) {
  return <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="mb-2 text-xs font-extrabold uppercase text-primary">{eyebrow}</p><h1 className="text-4xl sm:text-5xl">{title}</h1><p className="mt-2 max-w-2xl text-muted-foreground">{text}</p></div>{action}</div>;
}

function PlanView({ children, allChildren, recipes, lunchboxes, picked, pickedRecipes, toggleBox, toggleRecipe, images, setImage, plan, familyMode, selectedChild, setSelectedChild, setFamilyMode, period, setPeriod, weekStartIso, regenerate, savePlan, replaceCell, renameCell, removeCell, clearPlan, openLunchboxes }: { children: Child[]; allChildren: Child[]; recipes: Recipe[]; lunchboxes: Lunchbox[]; picked: string[]; pickedRecipes: string[]; toggleBox:(id:string)=>void; toggleRecipe:(id:string)=>void; images: Record<string,string>; setImage:(table:"recipes"|"lunchboxes"|"children",id:string,url:string)=>void; plan: PlanCell[]; familyMode: boolean; selectedChild: string; setSelectedChild:(v:string)=>void; setFamilyMode:(v:boolean)=>void; period:"week"|"month"; setPeriod:(v:"week"|"month")=>void; weekStartIso: string; regenerate:()=>void; savePlan:()=>void; replaceCell:(t:{childId:string;day:number;snack:number},p:{kind:"box"|"recipe";id:string})=>void; renameCell:(t:{childId:string;day:number;snack:number},label:string)=>void; removeCell:(t:{childId:string;day:number;snack:number})=>void; clearPlan:()=>void; openLunchboxes:()=>void }) {
  const [open, setOpen] = useState<{ kind: "box" | "recipe"; id: string } | null>(null);
  const [day, setDay] = useState(0);
  const [weekIndex, setWeekIndex] = useState(0);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [edit, setEdit] = useState<PlanCell | null>(null);
  const [planTarget, setPlanTarget] = useState<PlanCell | null>(null);
  const [swapping, setSwapping] = useState(false);
  const [swapQuery, setSwapQuery] = useState("");
  const actionsRef = useRef<HTMLDivElement>(null);
  useEffect(() => { setWeekIndex(0); setDay(0); }, [period]);
  useEffect(() => {
    if (!actionsOpen) return;
    const handler = (e: MouseEvent) => {
      if (actionsRef.current && !actionsRef.current.contains(e.target as Node)) setActionsOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [actionsOpen]);
  const openBox = open?.kind === "box" ? lunchboxes.find((b) => b.id === open.id) ?? null : null;
  const openRecipe = open?.kind === "recipe" ? recipes.find((r) => r.id === open.id) ?? null : null;
  const fallbacks = [lunchbox.url, fruitBoxes.url, muffins.url];
  const imageFor = (id: string, stored: string | null | undefined, i: number) => images[id] || stored || fallbacks[i % 3] || lunchbox.url;
  const nameOf = (cell: PlanCell) => cell.label ?? lunchboxes.find((x) => x.id === cell.lunchboxId)?.name ?? recipes.find((x) => x.id === cell.recipeId)?.name ?? "";
  const weeks = period === "month" ? 4 : 1;
  const start = weekStartIso ? parseIso(weekStartIso) : mondayOf();
  const dateAt = (weekday: number, w = weekIndex) => addDays(start, w * 7 + weekday);
  const dayIndex = (weekday: number, w = weekIndex) => w * 5 + weekday;
  const rangeLabel = (w: number) => `${shortLabel(dateAt(0, w))} – ${shortLabel(dateAt(4, w))}`;
  const cellsFor = (childId: string, weekday: number, w = weekIndex) => plan.filter((p) => p.childId === childId && p.day === dayIndex(weekday, w));
  function tableHtml() {
    const esc = (t: string) => t.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] ?? c));
    let html = `<h1>Plano de lancheiras</h1>`;
    for (let w = 0; w < weeks; w++) {
      html += `<h2>Semana ${w + 1} · ${esc(rangeLabel(w))}</h2><table><thead><tr><th>Criança</th>${weekDays.map((d, i) => `<th>${d}<br><small>${esc(shortLabel(dateAt(i, w)))}</small></th>`).join("")}</tr></thead><tbody>`;
      for (const child of children) {
        html += `<tr><th class="child">${esc(child.name)}<br><small>${child.age} anos</small></th>`;
        html += weekDays.map((_, i) => {
          const cells = cellsFor(child.id, i, w);
          const body = cells.length
            ? cells.map((c) => `<div class="pill"><span>Lanche ${c.snack}${c.training ? " · treino" : ""}</span>${esc(nameOf(c) || "A preparar")}</div>`).join("")
            : `<div class="empty">—</div>`;
          return `<td>${body}</td>`;
        }).join("");
        html += `</tr>`;
      }
      html += `</tbody></table>`;
    }
    return html;
  }
  const printCss = `*{box-sizing:border-box}body{margin:0;padding:24px;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#1f2b20;background:#fff}h1{font-size:22px;margin:0 0 4px}h2{font-size:14px;margin:18px 0 6px;color:#2f6b45}table{width:100%;border-collapse:collapse;table-layout:fixed;page-break-inside:avoid}th,td{border:1px solid #d8d5c8;padding:6px;vertical-align:top;font-size:11px;text-align:left}thead th{background:#f3f1e6}th.child{width:110px;background:#fbfaf4}small{color:#6b7268;font-weight:400}.pill{border:1px solid #e2dfd2;border-radius:6px;padding:4px 6px;margin-bottom:4px;line-height:1.25}.pill span{display:block;font-size:8.5px;text-transform:uppercase;letter-spacing:.04em;color:#2f6b45;font-weight:700}.empty{color:#a2a79e}@page{size:A4 landscape;margin:12mm}`;
  function printPlan() {
    const win = window.open("", "_blank", "width=1150,height=850");
    if (!win) return;
    win.document.write(`<!doctype html><html lang="pt"><head><meta charset="utf-8"><title>Plano de lancheiras</title><style>${printCss}</style></head><body>${tableHtml()}</body></html>`);
    win.document.close();
    win.focus();
    win.setTimeout(() => win.print(), 400);
  }
  function exportImage() {
    const scale = 2;
    const colChild = 150, colDay = 210, pad = 10;
    const width = colChild + colDay * 5 + 40;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const font = (size: number, weight = "400") => `${weight} ${size}px system-ui, -apple-system, 'Segoe UI', sans-serif`;
    const wrap = (text: string, max: number, size: number, weight = "400") => {
      ctx.font = font(size, weight);
      const out: string[] = [];
      let line = "";
      for (const word of text.split(/\s+/)) {
        const test = line ? `${line} ${word}` : word;
        if (ctx.measureText(test).width > max && line) { out.push(line); line = word; } else line = test;
      }
      if (line) out.push(line);
      return out;
    };
    type Cell = { lines: { text: string; size: number; weight: string; color: string }[] };
    const blocks: { title: string; header: string[]; rows: { head: Cell; cells: Cell[] }[] }[] = [];
    for (let w = 0; w < weeks; w++) {
      const rows = children.map((child) => ({
        head: { lines: [
          ...wrap(child.name, colChild - pad * 2, 13, "700").map((text) => ({ text, size: 13, weight: "700", color: "#1f2b20" })),
          { text: `${child.age} anos`, size: 11, weight: "400", color: "#6b7268" },
        ] },
        cells: weekDays.map((_, i) => {
          const cells = cellsFor(child.id, i, w);
          if (!cells.length) return { lines: [{ text: "—", size: 12, weight: "400", color: "#a2a79e" }] };
          const lines: Cell["lines"] = [];
          cells.forEach((c) => {
            lines.push({ text: `LANCHE ${c.snack}${c.training ? " · TREINO" : ""}`, size: 9, weight: "700", color: "#2f6b45" });
            wrap(nameOf(c) || "A preparar", colDay - pad * 2, 12).forEach((text) => lines.push({ text, size: 12, weight: "400", color: "#1f2b20" }));
          });
          return { lines };
        }),
      }));
      blocks.push({ title: `Semana ${w + 1} · ${rangeLabel(w)}`, header: weekDays.map((d, i) => `${d} ${shortLabel(dateAt(i, w))}`), rows });
    }
    const lineH = 17, headerH = 34;
    const rowHeight = (row: { head: Cell; cells: Cell[] }) => Math.max(56, ...[row.head, ...row.cells].map((c) => c.lines.length * lineH + pad * 2));
    let height = 60;
    blocks.forEach((b) => { height += 34 + headerH + b.rows.reduce((sum, r) => sum + rowHeight(r), 0) + 16; });
    canvas.width = width * scale; canvas.height = height * scale;
    ctx.scale(scale, scale);
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, width, height);
    ctx.textBaseline = "top";
    ctx.fillStyle = "#1f2b20"; ctx.font = font(22, "700");
    ctx.fillText("Plano de lancheiras", 20, 18);
    let y = 58;
    const stroke = (x: number, yy: number, w2: number, h2: number, fill?: string) => {
      if (fill) { ctx.fillStyle = fill; ctx.fillRect(x, yy, w2, h2); }
      ctx.strokeStyle = "#d8d5c8"; ctx.lineWidth = 1; ctx.strokeRect(x, yy, w2, h2);
    };
    for (const block of blocks) {
      ctx.fillStyle = "#2f6b45"; ctx.font = font(13, "700");
      ctx.fillText(block.title, 20, y + 8);
      y += 34;
      stroke(20, y, colChild, headerH, "#f3f1e6");
      ctx.fillStyle = "#1f2b20"; ctx.font = font(12, "700");
      ctx.fillText("Criança", 20 + pad, y + 10);
      block.header.forEach((label, i) => {
        stroke(20 + colChild + colDay * i, y, colDay, headerH, "#f3f1e6");
        ctx.fillStyle = "#1f2b20"; ctx.font = font(12, "700");
        ctx.fillText(label, 20 + colChild + colDay * i + pad, y + 10);
      });
      y += headerH;
      for (const row of block.rows) {
        const h = rowHeight(row);
        const drawCell = (cell: Cell, x: number, w2: number, bg?: string) => {
          stroke(x, y, w2, h, bg);
          let ty = y + pad;
          cell.lines.forEach((line) => {
            ctx.fillStyle = line.color; ctx.font = font(line.size, line.weight);
            ctx.fillText(line.text, x + pad, ty);
            ty += lineH;
          });
        };
        drawCell(row.head, 20, colChild, "#fbfaf4");
        row.cells.forEach((cell, i) => drawCell(cell, 20 + colChild + colDay * i, colDay));
        y += h;
      }
      y += 16;
    }
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = "plano-lancheiras.png";
    a.click();
  }
  function exportCsv() {
    const rows: string[] = [];
    for (let w = 0; w < weeks; w++) {
      rows.push(`Semana ${w + 1} (${rangeLabel(w)})`);
      rows.push(["Criança", ...weekDays.map((d, i) => `${d} ${shortLabel(dateAt(i, w))}`)].join(";"));
      for (const child of children) {
        const cols = weekDays.map((_, i) => cellsFor(child.id, i, w).map((c) => `Lanche ${c.snack}: ${nameOf(c)}`).join(" | "));
        rows.push([child.name, ...cols].join(";"));
      }
      rows.push("");
    }
    const url = URL.createObjectURL(new Blob(["\uFEFF" + rows.join("\n")], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = "plano-lancheiras.csv"; a.click();
    URL.revokeObjectURL(url);
  }
  function shareWhatsApp() {
    const lines = [`*Plano de lancheiras — ${rangeLabel(weekIndex)}*`];
    for (const child of children) {
      lines.push("", `*${child.name}*`);
      weekDays.forEach((d, i) => {
        const cells = cellsFor(child.id, i);
        if (cells.length) lines.push(`${d} ${shortLabel(dateAt(i))}: ${cells.map((c) => `Lanche ${c.snack} — ${nameOf(c)}`).join(" · ")}`);
      });
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(lines.join("\n"))}`, "_blank");
  }
  function planActions(cell: PlanCell) {
    const target = { childId: cell.childId, day: cell.day, snack: cell.snack };
    return <div className="space-y-2 border-t border-border pt-4">
      <p className="text-sm font-bold">Este lanche no plano</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <Button type="button" variant="outline" onClick={()=>{ setOpen(null); setPlanTarget(null); setSwapping(false); setEdit(cell); }}><Pencil size={16}/>Editar texto</Button>
        <Button type="button" variant="outline" onClick={()=>{ setOpen(null); setPlanTarget(null); setSwapQuery(""); setSwapping(true); setEdit(cell); }}><ArrowUpDown size={16}/>Escolher outra opção</Button>
      </div>
      <Button type="button" variant="ghost" className="w-full text-berry" onClick={()=>{ removeCell(target); setOpen(null); setPlanTarget(null); }}><X size={16}/>Retirar do plano</Button>
    </div>;
  }
  return <section><PageHeading eyebrow={period === "week" ? `Semana de ${rangeLabel(0)}` : `4 semanas · ${shortLabel(dateAt(0, 0))} a ${shortLabel(dateAt(4, 3))}`} title="O que vai na lancheira?" text={`${period === "week" ? "Uma semana equilibrada" : "Um mês equilibrado"}, adaptado a cada idade e aos dias com mais energia. Toque num lanche para ver os detalhes.`}/>
    <div className="mb-6 flex flex-wrap items-center gap-3 print:hidden">
      <Button onClick={regenerate}><Sparkles size={17}/>Gerar novo plano</Button>
      <div ref={actionsRef} className="relative inline-block">
        <Button variant="outline" onClick={() => setActionsOpen((v) => !v)} aria-expanded={actionsOpen} aria-haspopup="menu"><FileUp size={17}/>Guardar e partilhar</Button>
        {actionsOpen && (
          <div className="absolute left-0 top-full z-50 mt-1 w-52 rounded-md border border-border bg-background py-1 shadow-xl" onMouseDown={(e) => e.stopPropagation()}>
            <button onClick={() => { savePlan(); setActionsOpen(false); }} className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm font-bold hover:bg-muted"><Check size={15}/>Guardar plano</button>
            <button onClick={() => { exportCsv(); setActionsOpen(false); }} className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm font-bold hover:bg-muted"><FileUp size={15}/>Exportar CSV</button>
            <button onClick={() => { printPlan(); setActionsOpen(false); }} className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm font-bold hover:bg-muted"><CalendarDays size={15}/>Imprimir ou PDF</button>
            <button onClick={() => { exportImage(); setActionsOpen(false); }} className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm font-bold hover:bg-muted"><ImageIcon size={15}/>Guardar imagem</button>
            <button onClick={() => { shareWhatsApp(); setActionsOpen(false); }} className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm font-bold hover:bg-muted"><MessageCircle size={15}/>WhatsApp</button>
            <button onClick={() => { if (window.confirm("Limpar todo o plano?")) clearPlan(); setActionsOpen(false); }} className="flex w-full items-center gap-2 border-t border-border px-4 py-2 text-left text-sm font-bold text-berry hover:bg-muted"><X size={15}/>Limpar plano</button>
          </div>
        )}
      </div>
    </div>
    <div className="mb-6 flex flex-wrap items-center gap-3">
      <div className="inline-flex rounded-md border border-border bg-card p-1"><Button size="sm" variant={period === "week" ? "secondary":"ghost"} onClick={()=>setPeriod("week")}>Semana</Button><Button size="sm" variant={period === "month" ? "secondary":"ghost"} onClick={()=>setPeriod("month")}>Mês</Button></div>
      <div className="inline-flex rounded-md border border-border bg-card p-1"><Button size="sm" variant={familyMode ? "secondary":"ghost"} onClick={()=>{setFamilyMode(true);setSelectedChild("all")}}>Agregado</Button><Button size="sm" variant={!familyMode ? "secondary":"ghost"} onClick={()=>{setFamilyMode(false);setSelectedChild(allChildren[0]?.id ?? "all")}}>Por filho</Button></div>
      {!familyMode && <select value={selectedChild} onChange={(e)=>setSelectedChild(e.target.value)} className="h-11 rounded-md border border-input bg-background px-3 text-sm">{allChildren.map((c)=><option key={c.id} value={c.id}>{c.name}</option>)}</select>}
      {picked.length ? <button onClick={openLunchboxes} className="rounded-full bg-leaf-soft px-3 py-2 text-xs font-bold text-primary">{picked.length} lancheiras escolhidas · alterar</button> : <button onClick={openLunchboxes} className="rounded-full border border-border px-3 py-2 text-xs font-bold text-muted-foreground">Escolher lancheiras para o plano</button>}
      <p className="text-sm text-muted-foreground">No plano agregado, repetimos lanches adequados para poupar preparação.</p>
    </div>
    {period === "month" && <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">{[0,1,2,3].map((w)=><button key={w} className={`rounded-md border p-3 text-left text-sm ${w===weekIndex?'border-primary bg-leaf-soft':'border-border bg-card'}`} onClick={()=>{setWeekIndex(w);setDay(0);}}><b>Semana {w+1}</b><span className="block text-xs text-muted-foreground">{rangeLabel(w)}</span></button>)}</div>}

    {(() => {
      const snackPill = (cell: PlanCell) => {
        const box = lunchboxes.find((x) => x.id === cell.lunchboxId);
        const r = recipes.find((x) => x.id === cell.recipeId);
        const name = cell.label ?? box?.name ?? r?.name ?? "A preparar…";
        const id = box?.id ?? r?.id;
        return (
          <button
            key={cell.snack}
            type="button"
            onClick={() => { setSwapping(false); if (id) { setPlanTarget(cell); setOpen({ kind: box ? "box" : "recipe", id }); } else setEdit(cell); }}
            className="mb-2 flex h-[4.5rem] w-full flex-col justify-center rounded-md border border-border bg-background px-3 py-2 text-left text-sm transition-colors hover:border-primary hover:bg-muted/60"
          >
            <span className="mb-1 flex items-center gap-2">
              <span className="text-[10px] font-extrabold uppercase tracking-wide text-primary">Lanche {cell.snack}</span>
              {cell.training && <Dumbbell size={13} className="shrink-0 text-berry" />}
            </span>
            <span className="block text-sm leading-tight line-clamp-3">{name}</span>
          </button>
        );
      };

      return <>
        <div className="md:hidden print:hidden">
          <div className="mb-4 flex gap-2 overflow-x-auto">{weekDays.map((d, i) => <Button key={d} size="sm" variant={day === i ? "secondary" : "ghost"} onClick={() => setDay(i)} className="shrink-0">{d}<span className="ml-1 text-xs text-muted-foreground">{dateAt(i).getDate()}</span></Button>)}</div>
          <p className="mb-3 text-sm font-bold">{fullDays[day]}, {shortLabel(dateAt(day))}</p>
          <div className="space-y-4">{children.map((child) => {
            const cells = cellsFor(child.id, day);
            return <article key={child.id} className="rounded-md border border-border bg-card p-4">
              <div className="mb-3 flex items-center gap-3"><span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-full bg-leaf-soft font-bold text-primary">{images[child.id] ? <img src={images[child.id]} alt="" className="size-full object-cover"/> : child.name[0]}</span><span className="min-w-0"><b className="block truncate">{child.name}</b><span className="text-xs text-muted-foreground">{child.age} anos · {child.snacks_per_day} {child.snacks_per_day === 1 ? "lanche" : "lanches"}</span></span>{child.training_days.includes(day) && <span className="ml-auto shrink-0 rounded-full bg-accent px-2 py-1 text-[11px] font-bold text-accent-foreground"><Dumbbell size={11} className="mr-1 inline"/>treino</span>}</div>
              {cells.length ? cells.map((cell) => snackPill(cell)) : <p className="text-sm text-muted-foreground">Sem lanche definido para este dia.</p>}
            </article>;
          })}</div>
        </div>

        {Array.from({ length: weeks }, (_, w) => (
          <div key={w} className={`${w === weekIndex ? "hidden md:block" : "hidden"} overflow-x-auto border-y border-border bg-card print:block`}>
            {weeks > 1 && <p className="px-4 py-2 text-sm font-bold">Semana {w + 1} · {rangeLabel(w)}</p>}
            <div className="grid min-w-[880px] grid-cols-[150px_repeat(5,minmax(145px,1fr))]">
              <div className="border-b border-r border-border p-4 text-sm font-bold text-muted-foreground">Criança</div>{weekDays.map((d,i)=><div key={d} className="border-b border-r border-border p-4"><b>{d}</b><span className="ml-2 text-xs text-muted-foreground">{shortLabel(dateAt(i, w))}</span></div>)}
              {children.map((child)=><div className="contents" key={child.id}><div className="border-b border-r border-border p-4"><div className="mb-1 grid size-10 place-items-center overflow-hidden rounded-full bg-leaf-soft font-bold text-primary">{images[child.id]?<img src={images[child.id]} alt="" className="size-full object-cover"/>:child.name[0]}</div><b>{child.name}</b><p className="text-xs text-muted-foreground">{child.age} anos · {child.snacks_per_day} {child.snacks_per_day===1?'lanche':'lanches'}</p></div>{weekDays.map((_,d)=>{const cells=cellsFor(child.id,d,w);return <div key={d} className="min-h-44 border-b border-r border-border p-3 align-top">{cells.map((cell)=>snackPill(cell))}{child.training_days.includes(d)&&<span className="text-[11px] font-bold text-berry">Dia de treino · reforçado</span>}</div>})}</div>)}
            </div>
          </div>
        ))}
      </>;

    })()}
    {edit && (() => {
      const target = { childId: edit.childId, day: edit.day, snack: edit.snack };
      const box = lunchboxes.find((x) => x.id === edit.lunchboxId) ?? null;
      const r = recipes.find((x) => x.id === edit.recipeId) ?? null;
      const current = edit.label ?? box?.name ?? r?.name ?? "";
      const q = swapQuery.trim().toLowerCase();
      const boxOptions = lunchboxes.filter((b) => !q || b.name.toLowerCase().includes(q) || b.description.toLowerCase().includes(q));
      const recipeOptions = recipes.filter((x) => !q || x.name.toLowerCase().includes(q) || x.description.toLowerCase().includes(q));
      const choose = (kind: "box" | "recipe", id: string) => { replaceCell(target, { kind, id }); setEdit(null); setSwapping(false); };
      return <Modal title={`Lanche ${edit.snack}`} close={() => { setEdit(null); setSwapping(false); }}>
        {swapping ? <div>
          <input value={swapQuery} onChange={(e)=>setSwapQuery(e.target.value)} placeholder="Procurar lancheira ou receita" className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"/>
          <div className="mt-4 max-h-[50vh] space-y-4 overflow-y-auto">
            <div>
              <p className="mb-2 text-xs font-extrabold uppercase text-primary">Lancheiras</p>
              <div className="space-y-1">{boxOptions.map((b)=><button key={b.id} type="button" onClick={()=>choose("box",b.id)} className="w-full rounded-md border border-border px-3 py-2 text-left text-sm hover:border-primary hover:bg-muted/60">{b.name}</button>)}{!boxOptions.length && <p className="text-sm text-muted-foreground">Nada encontrado.</p>}</div>
            </div>
            <div>
              <p className="mb-2 text-xs font-extrabold uppercase text-primary">Receitas</p>
              <div className="space-y-1">{recipeOptions.map((x)=><button key={x.id} type="button" onClick={()=>choose("recipe",x.id)} className="w-full rounded-md border border-border px-3 py-2 text-left text-sm hover:border-primary hover:bg-muted/60">{x.name}</button>)}{!recipeOptions.length && <p className="text-sm text-muted-foreground">Nada encontrado.</p>}</div>
            </div>
          </div>
          <Button variant="ghost" className="mt-4 w-full" onClick={()=>setSwapping(false)}>Voltar</Button>
        </div> : <form onSubmit={(e)=>{ e.preventDefault(); const value = String(new FormData(e.currentTarget).get("label")); renameCell(target, value); setEdit(null); }} className="space-y-4">
          <label className="block text-sm font-bold">O que vai neste lanche
            <textarea name="label" defaultValue={current} className="mt-2 min-h-24 w-full rounded-md border border-input bg-background p-3 text-sm"/>
          </label>
          <p className="text-sm text-muted-foreground">Pode reescrever o texto à mão, escolher outra sugestão da sua lista ou retirar este lanche do plano.</p>
          <Button type="submit" className="w-full"><Check size={16}/>Guardar texto</Button>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button type="button" variant="outline" onClick={()=>{ setSwapQuery(""); setSwapping(true); }}><ArrowUpDown size={16}/>Escolher outra opção</Button>
            {(box || r) && <Button type="button" variant="outline" onClick={()=>{ setOpen({ kind: box ? "box" : "recipe", id: (box?.id ?? r?.id)! }); setEdit(null); }}><ChevronRight size={16}/>Ver receita/detalhe</Button>}
          </div>
          <Button type="button" variant="ghost" className="w-full text-berry" onClick={()=>{ removeCell(target); setEdit(null); }}><X size={16}/>Retirar do plano</Button>
        </form>}
      </Modal>;
    })()}
    {openBox && <LunchboxDetail box={openBox} image={imageFor(openBox.id, openBox.image_url, 0)} setImage={(url)=>setImage("lunchboxes",openBox.id,url)} picked={picked.includes(openBox.id)} toggle={()=>toggleBox(openBox.id)} close={()=>{setOpen(null);setPlanTarget(null);}} recipes={recipes} openRecipe={(id)=>setOpen({kind:"recipe",id})} extra={planTarget ? planActions(planTarget) : undefined}/>}
    {openRecipe && <RecipeDetail recipe={openRecipe} image={imageFor(openRecipe.id, openRecipe.image_url, 1)} setImage={(url)=>setImage("recipes",openRecipe.id,url)} picked={pickedRecipes.includes(openRecipe.id)} toggle={()=>toggleRecipe(openRecipe.id)} close={()=>{setOpen(null);setPlanTarget(null);}} extra={planTarget && openRecipe.id === planTarget.recipeId ? planActions(planTarget) : undefined}/>}
    <div className="mt-6 flex items-center gap-3 border-l-4 border-primary bg-leaf-soft p-4 text-sm"><Check className="shrink-0 text-primary"/><p><b>Lanche completo:</b> cada sugestão combina hidratos, proteína, fruta ou vegetal e água. Nos treinos, a porção e a energia são reforçadas.</p></div>
  </section>;
}

function LunchboxesView({ lunchboxes, recipes, picked, pickedRecipes, toggle, toggleRecipe, images, setImage, setRecipeImage, openImport, clear }: { lunchboxes: Lunchbox[]; recipes: Recipe[]; picked: string[]; pickedRecipes: string[]; toggle:(id:string)=>void; toggleRecipe:(id:string)=>void; images: Record<string,string>; setImage:(id:string,url:string)=>void; setRecipeImage:(id:string,url:string)=>void; openImport:()=>void; clear:()=>void }) {
  const [filter, setFilter] = useState<"todas" | "sem-receita" | "treino" | "escolhidas">("todas");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [openRecipeId, setOpenRecipeId] = useState<string | null>(null);
  const [view, setView] = useView("lancheira-vista-lancheiras");
  const fallbacks = [lunchbox.url, fruitBoxes.url, muffins.url];
  const shown = lunchboxes.filter((b) => {
    if (filter !== "todas" && !(filter === "sem-receita" ? itemsOf(b).every((i) => i.kind === "bought") : filter === "treino" ? b.training_suitable : picked.includes(b.id))) return false;
    if (!q.trim()) return true;
    const hay = [b.name, b.description, ...itemsOf(b).map((i) => i.label), ...ingredientsOf(b.ingredients).map((i) => i.name)].join(" ").toLowerCase();
    return q.trim().toLowerCase().split(/\s+/).every((word) => hay.includes(word));
  });
  const open = shown.find((b) => b.id === openId) ?? null;
  const openRecipe = recipes.find((r) => r.id === openRecipeId) ?? null;
  const thumbOf = (b: Lunchbox, i: number) => images[b.id] || b.image_url || fallbacks[i % 3] || lunchbox.url;
  return <section>
    <PageHeading eyebrow={`${lunchboxes.length} sugestões · ${picked.length} escolhidas`} title="Lancheiras completas" text="Sugestões prontas de lanche completo, com ou sem receita. Toque para ver detalhes e escolha as que quer no plano." action={<div className="flex gap-2">{picked.length>0&&<Button variant="ghost" onClick={clear}>Limpar escolhas</Button>}<Button variant="outline" onClick={openImport}><FileUp size={17}/>Importar documento</Button></div>}/>
    <div className="mb-6 flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:max-w-md sm:flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18}/><input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Pesquisar por nome ou ingrediente…" className="h-11 w-full rounded-md border border-input bg-card pl-10 pr-4"/></div>
      <div className="flex flex-wrap items-center justify-center gap-1 rounded-md border border-border bg-card p-1">
        {([["todas","Todas"],["sem-receita","Sem preparação"],["treino","Dias de treino"],["escolhidas","Escolhidas"]] as const).map(([id,label])=><Button key={id} size="sm" variant={filter===id?"secondary":"ghost"} onClick={()=>setFilter(id)}>{label}</Button>)}
      </div>
      <ViewToggle view={view} setView={setView}/>
    </div>
    {view === "cards" ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{shown.map((b,i)=>{const active=picked.includes(b.id);const items=itemsOf(b);return <article key={b.id} className={`rounded-md border bg-card p-5 ${active?"border-primary ring-2 ring-primary/30":"border-border"}`}>
      <div className="mb-3 flex items-start gap-3">
        <div className="group relative size-16 shrink-0 overflow-hidden rounded-md bg-muted"><img src={thumbOf(b,i)} alt={b.name} className="size-full object-cover" loading="lazy"/><ImagePicker label="" className="absolute inset-x-1 bottom-1 opacity-0 transition group-hover:opacity-100" onPick={(url)=>setImage(b.id,url)}/></div>
        <button type="button" onClick={()=>setOpenId(b.id)} className="flex-1 text-left text-2xl leading-tight hover:underline">{b.name}</button>
        <button onClick={()=>toggle(b.id)} aria-pressed={active} aria-label={active?`Retirar ${b.name} do plano`:`Usar ${b.name} no plano`} className={`grid size-8 shrink-0 place-items-center rounded-full border ${active?"border-primary bg-primary text-primary-foreground":"border-border text-muted-foreground"}`}>{active?<Check size={16}/>:<Plus size={16}/>}</button>
      </div>
      <p className="text-sm text-muted-foreground">{b.description}</p>
      <ul className="mt-4 space-y-1 text-sm">{items.map((i)=><li key={i.label} className="flex items-center gap-2"><span className={`size-1.5 rounded-full ${i.kind==="recipe"?"bg-primary":"bg-accent"}`}/>{i.label}<span className="text-xs text-muted-foreground">{i.kind==="recipe"?"receita":"comprado"}</span></li>)}</ul>
      <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4 text-xs">{b.components.map((c)=><span key={c} className="rounded-full bg-muted px-2 py-1 font-bold text-muted-foreground">{c}</span>)}{b.training_suitable&&<span className="rounded-full bg-accent px-2 py-1 font-bold text-accent-foreground"><Dumbbell size={12} className="mr-1 inline"/>treino</span>}{!b.needs_prep&&<span className="rounded-full bg-leaf-soft px-2 py-1 font-bold text-primary">sem preparação</span>}<span className="ml-auto text-muted-foreground">{b.min_age}–{b.max_age} anos</span></div>
    </article>})}</div>
    : <ol className="divide-y divide-border overflow-hidden rounded-md border border-border bg-card">{shown.map((b,i)=>{const active=picked.includes(b.id);return <li key={b.id} className="flex items-center"><button type="button" onClick={()=>setOpenId(b.id)} className="flex min-w-0 flex-1 items-center gap-4 p-3 text-left transition-colors hover:bg-muted/60">
      <img src={thumbOf(b,i)} alt="" className="size-14 shrink-0 rounded-md object-cover" loading="lazy"/>
      <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h2 className="truncate text-base font-bold">{b.name}</h2>{b.training_suitable&&<Dumbbell size={13} className="shrink-0 text-accent-foreground"/>}{!b.needs_prep&&<span className="shrink-0 rounded-full bg-leaf-soft px-2 text-[11px] font-bold text-primary">sem preparação</span>}</div><p className="truncate text-sm text-muted-foreground">{itemsOf(b).map((it)=>it.label).join(" · ")||b.description}</p></div>
      <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">{b.min_age}–{b.max_age} anos</span>
      <ChevronRight size={17} className="shrink-0 text-muted-foreground"/></button>
      <button type="button" onClick={()=>toggle(b.id)} aria-pressed={active} aria-label={active?`Retirar ${b.name} do plano`:`Usar ${b.name} no plano`} className={`mr-3 grid size-8 shrink-0 place-items-center rounded-full border ${active?"border-primary bg-primary text-primary-foreground":"border-border text-muted-foreground"}`}>{active?<Check size={16}/>:<Plus size={16}/>}</button></li>})}</ol>}
    {!shown.length&&<p className="text-muted-foreground">Ainda não há lancheiras neste filtro.</p>}
    {open&&<LunchboxDetail box={open} image={thumbOf(open, shown.indexOf(open))} setImage={(url)=>setImage(open.id,url)} picked={picked.includes(open.id)} toggle={()=>toggle(open.id)} close={()=>setOpenId(null)} recipes={recipes} openRecipe={setOpenRecipeId}/>}
    {openRecipe&&<RecipeDetail recipe={openRecipe} image={images[openRecipe.id]||openRecipe.image_url||muffins.url} setImage={(url)=>setRecipeImage(openRecipe.id,url)} picked={pickedRecipes.includes(openRecipe.id)} toggle={()=>toggleRecipe(openRecipe.id)} close={()=>setOpenRecipeId(null)}/>}
  </section>;
}

function ImportForm({ save, signedIn, askLogin }: { save:(result:ImportResult)=>void; signedIn:boolean; askLogin:()=>void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);

  async function readFile(file: File) {
    setError("");
    if (file.size > 1_000_000) { setError("Ficheiro demasiado grande."); return; }
    if (!/\.(txt|md|csv|json)$/i.test(file.name)) { setError("Aceitamos ficheiros de texto (.txt, .md, .csv). Para Word ou PDF, copie e cole o conteúdo abaixo."); return; }
    setText(await file.text());
  }

  async function analyse() {
    setBusy(true); setError("");
    try {
      const data = await importPlanText({ data: { text } });
      setResult(data);
      if (!data.recipes.length && !data.lunchboxes.length) setError("Não encontrámos lanches nem receitas neste texto.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível ler o documento.");
    } finally { setBusy(false); }
  }

  if (result && (result.recipes.length || result.lunchboxes.length)) return <div className="space-y-4">
    <p className="text-sm text-muted-foreground">Encontrámos <b>{result.lunchboxes.length}</b> lancheiras e <b>{result.recipes.length}</b> receitas.</p>
    <ul className="max-h-60 space-y-1 overflow-auto rounded-md border border-border p-4 text-sm">{result.lunchboxes.map((b)=><li key={b.name}>🥪 {b.name}</li>)}{result.recipes.map((r)=><li key={r.name}>🍳 {r.name}</li>)}</ul>
    {signedIn ? <Button className="w-full" onClick={()=>save(result)}>Adicionar à minha biblioteca</Button> : <Button className="w-full" onClick={askLogin}>Entrar para guardar</Button>}
    <Button variant="ghost" className="w-full" onClick={()=>setResult(null)}>Voltar</Button>
  </div>;

  return <div className="space-y-4">
    <p className="text-sm text-muted-foreground">Tem um plano de lanches feito noutra app, num email ou num documento? Carregue o ficheiro de texto ou cole o conteúdo — organizamos em lancheiras completas e receitas.</p>
    <label className="flex cursor-pointer items-center gap-3 rounded-md border border-dashed border-border p-4 text-sm"><FileUp size={18} className="text-primary"/><span>Escolher ficheiro de texto (.txt, .md, .csv)</span><input type="file" accept=".txt,.md,.csv,.json,text/plain" className="hidden" onChange={(e)=>{const f=e.target.files?.[0]; if (f) readFile(f);}}/></label>
    <textarea value={text} onChange={(e)=>setText(e.target.value)} placeholder={"Segunda: pão com queijo, uvas e água\nTerça: muffins de banana + iogurte…"} className="min-h-40 w-full rounded-md border border-input bg-background p-3 text-sm"/>
    {error&&<p className="text-sm font-bold text-destructive">{error}</p>}
    <Button className="w-full" disabled={busy||text.trim().length<20} onClick={analyse}>{busy?"A ler o documento…":<><Sparkles size={17}/>Analisar conteúdo</>}</Button>
  </div>;
}

function RecipesView({ recipes, search, setSearch, images, setImage, openAdd, openImport, picked, toggle }: { recipes: Recipe[]; search:string; setSearch:(v:string)=>void; images: Record<string,string>; setImage:(id:string,url:string)=>void; openAdd:()=>void; openImport:()=>void; picked:string[]; toggle:(id:string)=>void }) {
  const fallbacks=[muffins.url,lunchbox.url,fruitBoxes.url];
  const [sort,setSort]=useState<"nome"|"tempo"|"idade">("nome");
  const [openId,setOpenId]=useState<string|null>(null);
  const [view,setView]=useView("lancheira-vista-receitas");
  const shown=recipes.filter((r)=>{
    if (!search.trim()) return true;
    const hay=[r.name,r.description,...ingredientsOf(r.ingredients).map((i)=>i.name)].join(" ").toLowerCase();
    return search.trim().toLowerCase().split(/\s+/).every((word)=>hay.includes(word));
  }).sort((a,b)=>sort==="tempo"?(a.prep_minutes+a.cook_minutes)-(b.prep_minutes+b.cook_minutes):sort==="idade"?a.min_age-b.min_age:a.name.localeCompare(b.name,"pt"));
  const open=shown.find((r)=>r.id===openId)||null;
  const thumbOf=(r:Recipe,i:number)=>images[r.id]||r.image_url||fallbacks[i%3]||muffins.url;
  return <section><PageHeading eyebrow={`${recipes.length} receitas na coleção`} title="Receitas para dias reais" text="Toque numa receita para ver ingredientes, quantidades e preparação." action={<div className="flex gap-2"><Button variant="outline" onClick={openImport}><FileUp size={17}/>Importar</Button><Button onClick={openAdd}><Plus size={17}/>Adicionar receita</Button></div>}/>
    <div className="mb-6 flex flex-wrap items-center gap-2"><div className="relative w-full sm:max-w-md sm:flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18}/><input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Pesquisar por nome ou ingrediente…" className="h-11 w-full rounded-md border border-input bg-card pl-10 pr-4"/></div><label className="flex h-11 items-center gap-2 rounded-md border border-input bg-card px-3 text-sm text-muted-foreground"><ArrowUpDown size={15} className="shrink-0"/><select value={sort} onChange={(e)=>setSort(e.target.value as typeof sort)} className="h-full bg-transparent text-sm text-foreground outline-none"><option value="nome">Nome A–Z</option><option value="tempo">Mais rápidas</option><option value="idade">Idade</option></select></label><ViewToggle view={view} setView={setView}/></div>
    {view==="lista" ? <ol className="divide-y divide-border overflow-hidden rounded-md border border-border bg-card">{shown.map((r,i)=>{const active=picked.includes(r.id);return <li key={r.id} className="flex items-center"><button type="button" onClick={()=>setOpenId(r.id)} className="flex min-w-0 flex-1 items-center gap-4 p-3 text-left transition-colors hover:bg-muted/60">
      <img src={thumbOf(r,i)} alt="" className="size-14 shrink-0 rounded-md object-cover" loading="lazy"/>
      <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h2 className="truncate text-base font-bold">{r.name}</h2>{r.freezable&&<Snowflake size={13} className="shrink-0 text-primary"/>}{r.training_suitable&&<Dumbbell size={13} className="shrink-0 text-accent-foreground"/>}</div><p className="truncate text-sm text-muted-foreground">{r.description}</p></div>
      <div className="hidden shrink-0 items-center gap-4 text-xs text-muted-foreground sm:flex"><span><Clock3 size={13} className="mr-1 inline"/>{r.prep_minutes+r.cook_minutes} min</span><span>{r.min_age}–{r.max_age} anos</span><span>{r.portions} porções</span></div>
      <ChevronRight size={17} className="shrink-0 text-muted-foreground"/></button>
      <button type="button" onClick={()=>toggle(r.id)} aria-pressed={active} aria-label={active?`Retirar ${r.name} do plano`:`Usar ${r.name} no plano`} title={active?"Retirar do plano":"Adicionar ao plano"} className={`mr-3 grid size-8 shrink-0 place-items-center rounded-full border ${active?"border-primary bg-primary text-primary-foreground":"border-border text-muted-foreground"}`}>{active?<Check size={16}/>:<Plus size={16}/>}</button></li>})}</ol>
    : <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{shown.map((r,i)=>{const active=picked.includes(r.id);return <article key={r.id} className={`overflow-hidden rounded-md border bg-card ${active?"border-primary ring-2 ring-primary/30":"border-border"}`}>
      <div className="group relative"><img src={thumbOf(r,i)} alt={r.name} className="h-36 w-full object-cover" loading="lazy"/><ImagePicker label="Alterar" className="absolute bottom-2 right-2 w-28 opacity-0 transition group-hover:opacity-100" onPick={(url)=>setImage(r.id,url)}/></div>
      <div className="p-5"><div className="mb-2 flex items-start gap-3"><button type="button" onClick={()=>setOpenId(r.id)} className="flex-1 text-left text-2xl leading-tight hover:underline">{r.name}</button><button type="button" onClick={()=>toggle(r.id)} aria-pressed={active} aria-label={active?`Retirar ${r.name} do plano`:`Usar ${r.name} no plano`} className={`grid size-8 shrink-0 place-items-center rounded-full border ${active?"border-primary bg-primary text-primary-foreground":"border-border text-muted-foreground"}`}>{active?<Check size={16}/>:<Plus size={16}/>}</button></div>
        <p className="text-sm text-muted-foreground">{r.description}</p>
        <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4 text-xs text-muted-foreground"><span><Clock3 size={12} className="mr-1 inline"/>{r.prep_minutes+r.cook_minutes} min</span><span>{r.min_age}–{r.max_age} anos</span><span>{r.portions} porções</span>{r.freezable&&<span className="text-primary"><Snowflake size={12} className="mr-1 inline"/>congela</span>}</div>
      </div></article>})}</div>}
    {picked.length>0&&<p className="mt-3 text-xs text-muted-foreground">{picked.length} {picked.length===1?"receita escolhida":"receitas escolhidas"} para entrar no plano semanal.</p>}
    {open&&<RecipeDetail recipe={open} image={thumbOf(open,shown.indexOf(open))} setImage={(url)=>setImage(open.id,url)} picked={picked.includes(open.id)} toggle={()=>toggle(open.id)} close={()=>setOpenId(null)}/>}
  </section>;
}


function ShoppingView({ items, childName }: { items:[string,{quantity:number;unit:string}][]; childName:string }) {
  const [checked,setChecked]=useState<string[]>([]); return <section><PageHeading eyebrow="Lista consolidada" title="Compras da semana" text={`Tudo o que precisa para o plano de ${childName}, somado numa única lista.`} action={<Button variant="outline" onClick={()=>window.print()}><ShoppingBasket size={17}/>Imprimir lista</Button>}/><div className="grid gap-8 lg:grid-cols-[1fr_320px]"><div className="border-y border-border bg-card">{items.length ? items.map(([name,value])=><label key={name} className="flex cursor-pointer items-center gap-4 border-b border-border px-5 py-4"><input type="checkbox" checked={checked.includes(name)} onChange={()=>setChecked((old)=>old.includes(name)?old.filter((x)=>x!==name):[...old,name])} className="size-5 accent-primary"/><span className={`flex-1 font-semibold ${checked.includes(name)?'text-muted-foreground line-through':''}`}>{name}</span><span className="text-sm text-muted-foreground">{Math.ceil(value.quantity*10)/10} {value.unit}</span></label>) : <p className="p-8 text-muted-foreground">O plano ainda está a ser preparado.</p>}</div><aside className="self-start rounded-md bg-primary p-6 text-primary-foreground"><ShoppingBasket size={28}/><h2 className="mt-4 text-2xl">{checked.length} de {items.length}</h2><p className="mt-2 text-sm opacity-80">ingredientes já estão no carrinho.</p><div className="mt-6 h-2 overflow-hidden rounded-full bg-primary-foreground/20"><div className="h-full bg-primary-foreground" style={{width:`${items.length?checked.length/items.length*100:0}%`}}/></div></aside></div></section>;
}

function FamilyView({ children, images, setPhoto, openAdd, openEdit, remove }: { children:Child[]; images:Record<string,string>; setPhoto:(id:string,url:string)=>void; openAdd:()=>void; openEdit:(child:Child)=>void; remove:(id:string)=>void }) {
  return <section>
    <PageHeading eyebrow="A sua família" title="Cada criança, o seu ritmo" text="As idades, rotinas e treinos ajudam a ajustar porções e combinações." action={<Button onClick={openAdd}><Plus size={17}/>Adicionar criança</Button>}/>
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{children.map((c,i)=><article key={c.id} className="rounded-md border border-border bg-card p-6">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="group relative">
          <div className={`grid size-16 place-items-center overflow-hidden rounded-full ${i%2?'bg-accent':'bg-leaf-soft'} text-xl font-extrabold text-primary`}>{images[c.id]?<img src={images[c.id]} alt={`Fotografia de ${c.name}`} className="size-full object-cover"/>:c.name[0]}</div>
          <ImagePicker label="" className="absolute inset-x-1 bottom-0 grid place-items-center px-0 py-0.5 opacity-0 transition group-hover:opacity-100" onPick={(url)=>setPhoto(c.id,url)}/>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={()=>openEdit(c)}>Editar</Button>
          <Button size="sm" variant="ghost" aria-label={`Remover ${c.name}`} onClick={()=>{ if (window.confirm(`Remover ${c.name} da família?`)) remove(c.id); }}><X size={16}/></Button>
        </div>
      </div>
      <h2 className="text-3xl">{c.name}</h2>
      <p className="mt-1 text-muted-foreground">{c.age} anos · {c.snacks_per_day} {c.snacks_per_day===1?'lanche':'lanches'} por dia</p>
      <div className="mt-5 border-t border-border pt-4"><p className="mb-2 text-xs font-extrabold uppercase text-muted-foreground">Dias de treino</p><div className="flex flex-wrap gap-2">{c.training_days.length?c.training_days.map((d)=><span key={d} className="rounded-full bg-accent px-3 py-1 text-xs font-bold text-accent-foreground"><Dumbbell size={12} className="mr-1 inline"/>{fullDays[d]}</span>):<span className="text-sm text-muted-foreground">Sem treinos definidos</span>}</div></div>
    </article>)}</div>
  </section>;
}

function Modal({title,close,children}:{title:string;close:()=>void;children:React.ReactNode}) { return <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4" onMouseDown={close}><div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-md bg-background p-6 shadow-2xl" onMouseDown={(e)=>e.stopPropagation()}><div className="mb-6 flex items-center justify-between"><h2 className="text-3xl">{title}</h2><Button variant="ghost" size="icon" onClick={close} aria-label="Fechar"><X/></Button></div>{children}</div></div> }
const inputClass="h-11 w-full rounded-md border border-input bg-background px-3 text-sm";
function ChildForm({submit,child}:{submit:(e:FormEvent<HTMLFormElement>)=>void;child?:Child|null}) { return <form onSubmit={submit} className="space-y-5"><label className="block text-sm font-bold">Nome<input name="name" required defaultValue={child?.name ?? ""} className={`${inputClass} mt-2`}/></label><div className="grid grid-cols-2 gap-4"><label className="text-sm font-bold">Idade<input name="age" type="number" min="2" max="18" required defaultValue={child?.age ?? ""} className={`${inputClass} mt-2`}/></label><label className="text-sm font-bold">Lanches por dia<select name="snacks" defaultValue={String(child?.snacks_per_day ?? 1)} className={`${inputClass} mt-2`}><option value="1">1 lanche</option><option value="2">2 lanches</option><option value="3">3 lanches</option></select></label></div><fieldset><legend className="mb-2 text-sm font-bold">Dias de treino</legend><div className="flex flex-wrap gap-2">{weekDays.map((d,i)=><label key={d} className="rounded-md border border-border px-3 py-2 text-sm"><input type="checkbox" name="training" value={i} defaultChecked={child?.training_days.includes(i)} className="mr-2 accent-primary"/>{d}</label>)}</div></fieldset><label className="block text-sm font-bold">Momento<select name="timing" defaultValue={child?.training_timing ?? "after"} className={`${inputClass} mt-2`}><option value="before">Antes do treino</option><option value="after">Depois do treino</option></select></label><Button type="submit" className="w-full">{child?"Guardar alterações":"Guardar criança"}</Button></form> }
function RecipeForm({submit}:{submit:(e:FormEvent<HTMLFormElement>)=>void}) { return <form onSubmit={submit} className="space-y-4"><label className="block text-sm font-bold">Nome<input name="name" required className={`${inputClass} mt-1`}/></label><label className="block text-sm font-bold">Descrição<textarea name="description" className="mt-1 min-h-20 w-full rounded-md border border-input bg-background p-3"/></label><div className="grid grid-cols-3 gap-3"><label className="text-xs font-bold">Idade mínima<input name="minAge" type="number" defaultValue="3" className={`${inputClass} mt-1`}/></label><label className="text-xs font-bold">Minutos<input name="time" type="number" defaultValue="15" className={`${inputClass} mt-1`}/></label><label className="text-xs font-bold">Porções<input name="portions" type="number" defaultValue="4" className={`${inputClass} mt-1`}/></label></div><label className="block text-sm font-bold">Ingredientes, um por linha<textarea name="ingredients" required placeholder={'Banana\nAveia\nOvos'} className="mt-1 min-h-28 w-full rounded-md border border-input bg-background p-3"/></label><fieldset><legend className="text-sm font-bold">Componentes do lanche</legend><div className="mt-2 flex flex-wrap gap-3">{['hidratos','proteína','fruta','vegetal'].map((x)=><label key={x} className="text-sm"><input name="components" value={x} type="checkbox" className="mr-1 accent-primary"/>{x}</label>)}</div></fieldset><div className="flex gap-5"><label className="text-sm"><input name="freezable" type="checkbox" className="mr-2 accent-primary"/>Pode congelar</label><label className="text-sm"><input name="training" type="checkbox" className="mr-2 accent-primary"/>Adequado a treino</label></div><Button type="submit" className="w-full">Guardar receita</Button></form> }
