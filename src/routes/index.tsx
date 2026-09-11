import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Apple, ArrowUpDown, CalendarDays, Camera, Check, ChevronRight, Clock3, Dumbbell, FileUp, Image as ImageIcon, LayoutGrid, List, LogIn, MessageCircle, Plus, Sandwich, Search, ShoppingBasket, Snowflake, Sparkles, UserRound, UtensilsCrossed, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
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
type PlanCell = { childId: string; day: number; snack: number; recipeId: string | null; lunchboxId: string | null; training: boolean };

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
  return <div className="inline-flex h-10 items-center rounded-md border border-border bg-card p-1">
    <Button size="default" variant={view === "cards" ? "secondary" : "ghost"} onClick={() => setView("cards")} aria-pressed={view === "cards"}><LayoutGrid size={15}/>Cartões</Button>
    <Button size="default" variant={view === "lista" ? "secondary" : "ghost"} onClick={() => setView("lista")} aria-pressed={view === "lista"}><List size={15}/>Lista</Button>
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

function LunchboxDetail({ box, image, setImage, picked, toggle, close, recipes, openRecipe }: { box: Lunchbox; image: string; setImage:(url:string)=>void; picked:boolean; toggle:()=>void; close:()=>void; recipes: Recipe[]; openRecipe?:(id:string)=>void }) {
  return <Modal title={box.name} close={close}>
    <div className="relative mb-5"><img src={image} alt={box.name} className="max-h-48 w-full rounded-md object-cover"/><ImagePicker label="Alterar imagem" className="absolute bottom-3 right-3 w-40" onPick={setImage}/></div>
    <p className="mb-4 text-sm text-muted-foreground">{box.description}</p>
    <div className="mb-5 flex flex-wrap gap-2 text-xs">{box.components.map((c)=><span key={c} className="rounded-full bg-muted px-2 py-1 font-bold">{c}</span>)}<span className="rounded-full bg-muted px-2 py-1 font-bold">{box.min_age}–{box.max_age} anos</span>{box.training_suitable&&<span className="rounded-full bg-accent px-2 py-1 font-bold text-accent-foreground"><Dumbbell size={12} className="mr-1 inline"/>Treino</span>}{!box.needs_prep&&<span className="rounded-full bg-leaf-soft px-2 py-1 font-bold text-primary">Sem preparação</span>}</div>
    <h3 className="mb-2 text-sm font-extrabold uppercase tracking-wide text-muted-foreground">O que vai na lancheira</h3>
    <ul className="mb-5 space-y-1 text-sm">{itemsOf(box).map((i)=>{const rec=i.kind==="recipe"?findRecipeForItem(recipes,i.label):null;const inner=<><span className={`size-1.5 shrink-0 rounded-full ${i.kind==="recipe"?"bg-primary":"bg-accent"}`}/><span className="flex-1">{i.label} <span className="text-xs text-muted-foreground">{i.kind==="recipe"?"receita":"comprado"}</span></span></>;return <li key={i.label}>{rec&&openRecipe?<button type="button" onClick={()=>openRecipe(rec.id)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left font-bold text-primary transition-colors hover:bg-leaf-soft">{inner}<ChevronRight size={15} className="shrink-0"/></button>:<div className="flex items-center gap-2 px-2 py-1.5">{inner}</div>}</li>})}</ul>
    {ingredientsOf(box.ingredients).length>0&&<><h3 className="mb-2 text-sm font-extrabold uppercase tracking-wide text-muted-foreground">Para comprar</h3><ul className="mb-5 space-y-1 text-sm">{ingredientsOf(box.ingredients).map((ing,i)=><li key={i} className="flex justify-between gap-4 border-b border-border pb-1"><span>{ing.name}</span><span className="shrink-0 text-muted-foreground">{ing.quantity} {ing.unit}</span></li>)}</ul></>}
    <Button className="w-full" variant={picked?"secondary":"default"} onClick={toggle}>{picked?<><Check size={17}/>No plano semanal — retirar</>:<><Plus size={17}/>Adicionar ao plano semanal</>}</Button>
  </Modal>;
}

function RecipeDetail({ recipe, image, setImage, picked, toggle, close }: { recipe: Recipe; image: string; setImage:(url:string)=>void; picked:boolean; toggle:()=>void; close:()=>void }) {
  return <Modal title={recipe.name} close={close}>
    <div className="relative mb-5"><img src={image} alt={recipe.name} className="max-h-48 w-full rounded-md object-cover"/><ImagePicker label="Alterar imagem" className="absolute bottom-3 right-3 w-40" onPick={setImage}/></div>
    <p className="mb-4 text-sm text-muted-foreground">{recipe.description}</p>
    <div className="mb-5 flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-muted px-2 py-1 font-bold"><Clock3 size={12} className="mr-1 inline"/>{recipe.prep_minutes+recipe.cook_minutes} min</span><span className="rounded-full bg-muted px-2 py-1 font-bold">{recipe.min_age}–{recipe.max_age} anos</span><span className="rounded-full bg-muted px-2 py-1 font-bold">{recipe.portions} porções</span>{recipe.freezable&&<span className="rounded-full bg-leaf-soft px-2 py-1 font-bold text-primary"><Snowflake size={12} className="mr-1 inline"/>Congela</span>}{recipe.training_suitable&&<span className="rounded-full bg-accent px-2 py-1 font-bold text-accent-foreground"><Dumbbell size={12} className="mr-1 inline"/>Treino</span>}</div>
    <h3 className="mb-2 text-sm font-extrabold uppercase tracking-wide text-muted-foreground">Ingredientes</h3>
    <ul className="mb-5 space-y-1 text-sm">{ingredientsOf(recipe.ingredients).map((ing,i)=><li key={i} className="flex justify-between gap-4 border-b border-border pb-1"><span>{ing.name}</span><span className="shrink-0 text-muted-foreground">{ing.quantity} {ing.unit}</span></li>)}</ul>
    {recipe.instructions.length>0&&<><h3 className="mb-2 text-sm font-extrabold uppercase tracking-wide text-muted-foreground">Preparação</h3><ol className="list-decimal space-y-2 pl-5 text-sm">{recipe.instructions.map((step,i)=><li key={i}>{step}</li>)}</ol></>}
    <Button className="mt-6 w-full" variant={picked?"secondary":"default"} onClick={toggle}>{picked?<><Check size={17}/>No plano semanal — retirar</>:<><Plus size={17}/>Adicionar ao plano semanal</>}</Button>
  </Modal>;
}



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
  const [genCount, setGenCount] = useState(0);
  const [children, setChildren] = useState<Child[]>(demoChildren);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [lunchboxes, setLunchboxes] = useState<Lunchbox[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [pickedRecipes, setPickedRecipes] = useState<string[]>([]);
  const [plan, setPlan] = useState<PlanCell[]>([]);
  const [familyMode, setFamilyMode] = useState(true);
  const [period, setPeriod] = useState<"week" | "month">("week");
  const [selectedChild, setSelectedChild] = useState("all");
  const [modal, setModal] = useState<"child" | "recipe" | "auth" | "import" | null>(null);
  const [search, setSearch] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [notice, setNotice] = useState("");

  const [images, setImages] = useState<Record<string, string>>({});
  const [editingChild, setEditingChild] = useState<Child | null>(null);

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
      if (auth.user) {
        setSessionId(auth.user.id);
        const [{ data: childData }, { data: pickData }] = await Promise.all([
          supabase.from("children").select("*").order("created_at"),
          supabase.from("lunchbox_selections").select("lunchbox_id"),
        ]);
        if (!active) return;
        if (childData?.length) {
          setChildren(childData);
          const photos: Record<string, string> = {};
          (childData as { id: string; photo_url?: string | null }[]).forEach((c) => { if (c.photo_url) photos[c.id] = c.photo_url; });
          setImages((old) => ({ ...old, ...photos }));
        }
        if (pickData?.length) setPicked(pickData.map((row) => row.lunchbox_id));
      }
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
    if ((!pool.length && !recipes.length) || plan.length) return;
    type Cand = { id: string; box?: Lunchbox; recipe?: Recipe };
    const next: PlanCell[] = [];
    const rand = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];
    const fits = (box: Lunchbox, age: number, training: boolean) => box.min_age <= age && box.max_age >= age && (!training || box.training_suitable);
    const fitsRecipe = (r: Recipe, age: number, training: boolean) => r.min_age <= age && r.max_age >= age && (!training || r.training_suitable);
    const usedCommon = new Set<string>();
    const yesterdayByChild = new Map<string, Set<string>>();
    for (let day = 0; day < 5; day++) {
      let common: Cand | undefined;
      if (familyMode && children.length > 1) {
        const cands: Cand[] = [
          ...pool.filter((b) => children.every((c) => fits(b, c.age, c.training_days.includes(day)))).map((box) => ({ id: box.id, box })),
          ...recipePool.filter((r) => children.every((c) => fitsRecipe(r, c.age, c.training_days.includes(day)))).map((recipe) => ({ id: recipe.id, recipe })),
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
          const training = child.training_days.includes(day);
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
  }, [pool, recipePool, recipes, children, familyMode, plan.length, genCount]);

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

  function regenerate() {
    setGenCount((c) => c + 1);
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
    if (error || !saved) { flash("Não foi possível guardar o plano."); return; }
    const baseDate = new Date("2026-09-14T12:00:00");
    const rows = plan.map((item) => {
      const date = new Date(baseDate); date.setDate(date.getDate() + item.day);
      return { plan_id: saved.id, child_id: item.childId, recipe_id: item.recipeId, lunchbox_id: item.lunchboxId, snack_date: date.toISOString().slice(0,10), snack_number: item.snack, training_boost: item.training };
    });
    const { error: itemError } = await supabase.from("plan_items").insert(rows);
    flash(itemError ? "O plano foi criado, mas faltaram alguns lanches." : "Plano guardado com sucesso.");
  }

  async function saveImport(result: ImportResult) {
    if (!sessionId) { setModal("auth"); return; }
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

  const tabs = ([['plano','Plano',CalendarDays],['lancheiras','Lancheiras',Sandwich],['receitas','Receitas',UtensilsCrossed],['compras','Compras',ShoppingBasket],['familia','Família',UserRound]] as const);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6">
          <div className="flex items-center gap-2"><span className="grid size-9 place-items-center rounded-md bg-primary text-primary-foreground"><Apple size={20} /></span><span className="font-display text-2xl">Lancheira</span></div>
          <nav className="ml-auto hidden items-center gap-1 md:flex" aria-label="Navegação principal">
            {tabs.map(([id,label,Icon]) => <Button key={id} variant={tab === id ? "secondary" : "ghost"} onClick={() => setTab(id)}><Icon size={17}/>{label}</Button>)}
          </nav>
          {sessionId ? <span className="hidden rounded-full bg-leaf-soft px-3 py-1 text-xs font-bold text-primary sm:block">Plano guardado</span> : <Button size="sm" variant="outline" onClick={() => setModal("auth")}><LogIn size={16}/>Entrar</Button>}
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 pb-24 pt-8 sm:px-6">
        {notice && <div className="fixed right-5 top-20 z-50 max-w-xs rounded-md bg-foreground px-4 py-3 text-sm text-background shadow-xl">{notice}</div>}
        {tab === "plano" && <PlanView children={visibleChildren} allChildren={children} recipes={recipes} lunchboxes={lunchboxes} picked={picked} pickedRecipes={pickedRecipes} toggleBox={togglePick} toggleRecipe={toggleRecipe} images={images} setImage={setImage} plan={plan} familyMode={familyMode} selectedChild={selectedChild} setSelectedChild={setSelectedChild} setFamilyMode={setFamilyMode} period={period} setPeriod={setPeriod} regenerate={regenerate} savePlan={savePlan} openLunchboxes={() => setTab("lancheiras")} />}
        {tab === "lancheiras" && <LunchboxesView lunchboxes={lunchboxes} recipes={recipes} picked={picked} pickedRecipes={pickedRecipes} toggle={togglePick} toggleRecipe={toggleRecipe} images={images} setImage={(id,url)=>setImage("lunchboxes",id,url)} setRecipeImage={(id,url)=>setImage("recipes",id,url)} openImport={() => setModal("import")} clear={() => { setPicked([]); setPlan([]); if (sessionId) supabase.from("lunchbox_selections").delete().eq("user_id", sessionId); }} />}
        {tab === "receitas" && <RecipesView recipes={recipes} search={search} setSearch={setSearch} images={images} setImage={(id,url)=>setImage("recipes",id,url)} openAdd={() => setModal("recipe")} openImport={() => setModal("import")} picked={pickedRecipes} toggle={toggleRecipe} />}
        {tab === "compras" && <ShoppingView items={shopping} childName={selectedChild === "all" ? "toda a família" : visibleChildren[0]?.name ?? "plano"} />}
        {tab === "familia" && <FamilyView children={children} images={images} setPhoto={(id,url)=>setImage("children",id,url)} openAdd={() => { setEditingChild(null); setModal("child"); }} openEdit={(child)=>{ setEditingChild(child); setModal("child"); }} remove={removeChild} />}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-background p-2 md:hidden">
        {tabs.map(([id,label,Icon]) => <Button key={id} variant="ghost" className={tab === id ? "text-primary" : ""} onClick={() => setTab(id)}><span className="flex flex-col items-center text-xs"><Icon size={18}/>{label}</span></Button>)}
      </nav>
      {modal && <Modal title={modal === "child" ? (editingChild ? `Editar ${editingChild.name}` : "Adicionar criança") : modal === "recipe" ? "Nova receita" : modal === "import" ? "Importar plano ou receitas" : "Guardar os meus planos"} close={() => { setModal(null); setEditingChild(null); }}>{modal === "child" ? <ChildForm submit={addChild} child={editingChild}/> : modal === "recipe" ? <RecipeForm submit={addRecipe}/> : modal === "import" ? <ImportForm save={saveImport} signedIn={Boolean(sessionId)} askLogin={() => setModal("auth")}/> : <AuthForm submit={authenticate} google={googleLogin} mode={authMode} setMode={setAuthMode}/>}</Modal>}
    </div>
  );
}


function PageHeading({ eyebrow, title, text, action }: { eyebrow: string; title: string; text: string; action?: React.ReactNode }) {
  return <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="mb-2 text-xs font-extrabold uppercase text-primary">{eyebrow}</p><h1 className="text-4xl sm:text-5xl">{title}</h1><p className="mt-2 max-w-2xl text-muted-foreground">{text}</p></div>{action}</div>;
}

function PlanView({ children, allChildren, recipes, lunchboxes, picked, pickedRecipes, toggleBox, toggleRecipe, images, setImage, plan, familyMode, selectedChild, setSelectedChild, setFamilyMode, period, setPeriod, regenerate, savePlan, openLunchboxes }: { children: Child[]; allChildren: Child[]; recipes: Recipe[]; lunchboxes: Lunchbox[]; picked: string[]; pickedRecipes: string[]; toggleBox:(id:string)=>void; toggleRecipe:(id:string)=>void; images: Record<string,string>; setImage:(table:"recipes"|"lunchboxes"|"children",id:string,url:string)=>void; plan: PlanCell[]; familyMode: boolean; selectedChild: string; setSelectedChild:(v:string)=>void; setFamilyMode:(v:boolean)=>void; period:"week"|"month"; setPeriod:(v:"week"|"month")=>void; regenerate:()=>void; savePlan:()=>void; openLunchboxes:()=>void }) {
  const [open, setOpen] = useState<{ kind: "box" | "recipe"; id: string } | null>(null);
  const [day, setDay] = useState(0);
  const [actionsOpen, setActionsOpen] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);
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
  const nameOf = (cell: PlanCell) => lunchboxes.find((x) => x.id === cell.lunchboxId)?.name ?? recipes.find((x) => x.id === cell.recipeId)?.name ?? "";
  function exportCsv() {
    const rows = [["Criança", ...weekDays].join(";")];
    for (const child of children) {
      const cols = weekDays.map((_, d) => plan.filter((p) => p.childId === child.id && p.day === d).map((c) => `Lanche ${c.snack}: ${nameOf(c)}`).join(" | "));
      rows.push([child.name, ...cols].join(";"));
    }
    const url = URL.createObjectURL(new Blob(["\uFEFF" + rows.join("\n")], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = "plano-lancheiras.csv"; a.click();
    URL.revokeObjectURL(url);
  }
  function shareWhatsApp() {
    const lines = ["*Plano de lancheiras — semana de 14 a 18 de setembro*"];
    for (const child of children) {
      lines.push("", `*${child.name}*`);
      weekDays.forEach((d, i) => {
        const cells = plan.filter((p) => p.childId === child.id && p.day === i);
        if (cells.length) lines.push(`${d}: ${cells.map((c) => `Lanche ${c.snack} — ${nameOf(c)}`).join(" · ")}`);
      });
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(lines.join("\n"))}`, "_blank");
  }
  return <section><PageHeading eyebrow={period === "week" ? "Semana de 14 a 18 de setembro" : "Setembro de 2026 · 4 semanas"} title="O que vai na lancheira?" text={`${period === "week" ? "Uma semana equilibrada" : "Um mês equilibrado"}, adaptado a cada idade e aos dias com mais energia. Toque num lanche para ver os detalhes.`}/>
    <div className="mb-6 print:hidden">
      <div ref={actionsRef} className="relative inline-block">
        <Button variant="outline" onClick={() => setActionsOpen((v) => !v)} aria-expanded={actionsOpen} aria-haspopup="menu"><CalendarDays size={17}/>Ações do plano</Button>
        {actionsOpen && (
          <div className="absolute left-1/2 top-full z-50 mt-1 w-52 -translate-x-1/2 rounded-md border border-border bg-background py-1 shadow-xl" onMouseDown={(e) => e.stopPropagation()}>
            <button onClick={() => { exportCsv(); setActionsOpen(false); }} className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm font-bold hover:bg-muted"><FileUp size={15}/>Exportar CSV</button>
            <button onClick={() => { window.print(); setActionsOpen(false); }} className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm font-bold hover:bg-muted"><CalendarDays size={15}/>Imprimir</button>
            <button onClick={() => { shareWhatsApp(); setActionsOpen(false); }} className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm font-bold hover:bg-muted"><MessageCircle size={15}/>WhatsApp</button>
            <button onClick={() => { savePlan(); setActionsOpen(false); }} className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm font-bold hover:bg-muted"><Check size={15}/>Guardar</button>
            <div className="my-1 border-t border-border" />
            <button onClick={() => { regenerate(); setActionsOpen(false); }} className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm font-bold text-primary hover:bg-muted"><Sparkles size={15}/>Gerar novo plano</button>
          </div>
        )}
      </div>
    </div>
    <div className="mb-6 flex flex-wrap items-center gap-3">
      <div className="inline-flex rounded-md border border-border bg-card p-1"><Button size="sm" variant={period === "week" ? "secondary":"ghost"} onClick={()=>setPeriod("week")}>Semana</Button><Button size="sm" variant={period === "month" ? "secondary":"ghost"} onClick={()=>setPeriod("month")}>Mês</Button></div>
      <div className="inline-flex rounded-md border border-border bg-card p-1"><Button size="sm" variant={familyMode ? "secondary":"ghost"} onClick={()=>{setFamilyMode(true);setSelectedChild("all")}}>Agregado</Button><Button size="sm" variant={!familyMode ? "secondary":"ghost"} onClick={()=>{setFamilyMode(false);setSelectedChild(allChildren[0]?.id ?? "all")}}>Por filho</Button></div>
      {!familyMode && <select value={selectedChild} onChange={(e)=>setSelectedChild(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">{allChildren.map((c)=><option key={c.id} value={c.id}>{c.name}</option>)}</select>}
      {picked.length ? <button onClick={openLunchboxes} className="rounded-full bg-leaf-soft px-3 py-2 text-xs font-bold text-primary">{picked.length} lancheiras escolhidas · alterar</button> : <button onClick={openLunchboxes} className="rounded-full border border-border px-3 py-2 text-xs font-bold text-muted-foreground">Escolher lancheiras para o plano</button>}
      <p className="text-sm text-muted-foreground">No plano agregado, repetimos lanches adequados para poupar preparação.</p>
    </div>
    {period === "month" && <div className="mb-5 grid grid-cols-4 gap-2">{[1,2,3,4].map((week)=><button key={week} className={`rounded-md border p-3 text-left text-sm ${week===1?'border-primary bg-leaf-soft':'border-border bg-card'}`} onClick={()=>setPeriod("week")}><b>Semana {week}</b><span className="block text-xs text-muted-foreground">{week===1?'14–18 set':week===2?'21–25 set':week===3?'28 set–2 out':'5–9 out'}</span></button>)}</div>}
    {(() => {
      const snackPill = (cell: PlanCell) => {
        const box = lunchboxes.find((x) => x.id === cell.lunchboxId);
        const r = recipes.find((x) => x.id === cell.recipeId);
        const name = box?.name ?? r?.name ?? "A preparar…";
        const id = box?.id ?? r?.id;
        return (
          <button
            key={cell.snack}
            type="button"
            disabled={!id}
            onClick={() => id && setOpen({ kind: box ? "box" : "recipe", id })}
            className="mb-2 flex h-[4.5rem] w-full flex-col justify-center rounded-md border border-border bg-background px-3 py-2 text-left text-sm transition-colors hover:border-primary hover:bg-muted/60 disabled:cursor-default"
          >
            <span className="mb-1 flex items-center justify-between gap-2">
              <span className="text-[10px] font-extrabold uppercase tracking-wide text-primary">Lanche {cell.snack}</span>
              {cell.training && <Dumbbell size={13} className="shrink-0 text-berry" />}
            </span>
            <span className="block text-sm font-bold leading-tight line-clamp-3">{name}</span>
          </button>
        );
      };

      return <>
        <div className="md:hidden print:hidden">
          <div className="mb-4 flex gap-2 overflow-x-auto">{weekDays.map((d, i) => <Button key={d} size="sm" variant={day === i ? "secondary" : "ghost"} onClick={() => setDay(i)} className="shrink-0">{d}<span className="ml-1 text-xs text-muted-foreground">{14 + i}</span></Button>)}</div>
          <p className="mb-3 text-sm font-bold">{fullDays[day]}, {14 + day} de setembro</p>
          <div className="space-y-4">{children.map((child) => {
            const cells = plan.filter((p) => p.childId === child.id && p.day === day);
            return <article key={child.id} className="rounded-md border border-border bg-card p-4">
              <div className="mb-3 flex items-center gap-3"><span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-full bg-leaf-soft font-bold text-primary">{images[child.id] ? <img src={images[child.id]} alt="" className="size-full object-cover"/> : child.name[0]}</span><span className="min-w-0"><b className="block truncate">{child.name}</b><span className="text-xs text-muted-foreground">{child.age} anos · {child.snacks_per_day} {child.snacks_per_day === 1 ? "lanche" : "lanches"}</span></span>{child.training_days.includes(day) && <span className="ml-auto shrink-0 rounded-full bg-accent px-2 py-1 text-[11px] font-bold text-accent-foreground"><Dumbbell size={11} className="mr-1 inline"/>treino</span>}</div>
              {cells.length ? cells.map((cell) => snackPill(cell)) : <p className="text-sm text-muted-foreground">Sem lanche definido para este dia.</p>}
            </article>;
          })}</div>
        </div>

        <div className="hidden overflow-x-auto border-y border-border bg-card md:block print:block"><div className="grid min-w-[880px] grid-cols-[150px_repeat(5,minmax(145px,1fr))]">
          <div className="border-b border-r border-border p-4 text-sm font-bold text-muted-foreground">Criança</div>{weekDays.map((d,i)=><div key={d} className="border-b border-r border-border p-4"><b>{d}</b><span className="ml-2 text-xs text-muted-foreground">{14+i} set</span></div>)}
          {children.map((child)=><div className="contents" key={child.id}><div className="border-b border-r border-border p-4"><div className="mb-1 grid size-10 place-items-center overflow-hidden rounded-full bg-leaf-soft font-bold text-primary">{images[child.id]?<img src={images[child.id]} alt="" className="size-full object-cover"/>:child.name[0]}</div><b>{child.name}</b><p className="text-xs text-muted-foreground">{child.age} anos · {child.snacks_per_day} {child.snacks_per_day===1?'lanche':'lanches'}</p></div>{weekDays.map((_,d)=>{const cells=plan.filter((p)=>p.childId===child.id&&p.day===d);return <div key={d} className="min-h-44 border-b border-r border-border p-3 align-top">{cells.map((cell)=>snackPill(cell))}{child.training_days.includes(d)&&<span className="text-[11px] font-bold text-berry">Dia de treino · reforçado</span>}</div>})}</div>)}
        </div></div>
      </>;
    })()}
    {openBox && <LunchboxDetail box={openBox} image={imageFor(openBox.id, openBox.image_url, 0)} setImage={(url)=>setImage("lunchboxes",openBox.id,url)} picked={picked.includes(openBox.id)} toggle={()=>toggleBox(openBox.id)} close={()=>setOpen(null)} recipes={recipes} openRecipe={(id)=>setOpen({kind:"recipe",id})}/>}
    {openRecipe && <RecipeDetail recipe={openRecipe} image={imageFor(openRecipe.id, openRecipe.image_url, 1)} setImage={(url)=>setImage("recipes",openRecipe.id,url)} picked={pickedRecipes.includes(openRecipe.id)} toggle={()=>toggleRecipe(openRecipe.id)} close={()=>setOpen(null)}/>}
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
      <div className="relative w-full sm:max-w-md sm:flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18}/><input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Pesquisar por nome ou ingrediente…" className="h-10 w-full rounded-md border border-input bg-card pl-10 pr-4"/></div>
      <div className="inline-flex h-10 flex-wrap items-center gap-1 rounded-md border border-border bg-card p-1">
        {([["todas","Todas"],["sem-receita","Sem preparação"],["treino","Dias de treino"],["escolhidas","Escolhidas"]] as const).map(([id,label])=><Button key={id} size="default" variant={filter===id?"secondary":"ghost"} onClick={()=>setFilter(id)}>{label}</Button>)}
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
    <div className="mb-6 flex flex-wrap items-center gap-2"><div className="relative w-full sm:max-w-md sm:flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18}/><input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Pesquisar por nome ou ingrediente…" className="h-10 w-full rounded-md border border-input bg-card pl-10 pr-4"/></div><label className="flex h-10 items-center gap-2 rounded-md border border-input bg-card px-3 text-sm text-muted-foreground"><ArrowUpDown size={15} className="shrink-0"/><select value={sort} onChange={(e)=>setSort(e.target.value as typeof sort)} className="h-full bg-transparent text-sm text-foreground outline-none"><option value="nome">Nome A–Z</option><option value="tempo">Mais rápidas</option><option value="idade">Idade</option></select></label><ViewToggle view={view} setView={setView}/></div>
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
function AuthForm({submit,google,mode,setMode}:{submit:(e:FormEvent<HTMLFormElement>)=>void;google:()=>void;mode:"login"|"signup";setMode:(m:"login"|"signup")=>void}) { return <div><p className="mb-5 text-sm text-muted-foreground">Entre para guardar perfis, receitas e planos em segurança.</p><Button variant="outline" className="mb-4 w-full" onClick={google}>Continuar com Google</Button><div className="mb-4 flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border"/>ou com email<span className="h-px flex-1 bg-border"/></div><form onSubmit={submit} className="space-y-3"><input name="email" type="email" required placeholder="Email" className={inputClass}/><input name="password" type="password" required minLength={6} placeholder="Palavra-passe" className={inputClass}/><Button type="submit" className="w-full">{mode==='login'?'Entrar':'Criar conta'}</Button></form><Button variant="ghost" className="mt-2 w-full" onClick={()=>setMode(mode==='login'?'signup':'login')}>{mode==='login'?'Ainda não tenho conta':'Já tenho conta'}</Button></div> }
