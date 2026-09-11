import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const ingredientSchema = z.object({
  name: z.string(),
  quantity: z.number().default(1),
  unit: z.string().default("un"),
});

const importSchema = z.object({
  recipes: z
    .array(
      z.object({
        name: z.string(),
        description: z.string().default(""),
        min_age: z.number().default(3),
        max_age: z.number().default(18),
        prep_minutes: z.number().default(15),
        portions: z.number().default(4),
        ingredients: z.array(ingredientSchema).default([]),
        instructions: z.array(z.string()).default([]),
        meal_components: z.array(z.string()).default([]),
        training_suitable: z.boolean().default(false),
        freezable: z.boolean().default(false),
      }),
    )
    .default([]),
  lunchboxes: z
    .array(
      z.object({
        name: z.string(),
        description: z.string().default(""),
        min_age: z.number().default(3),
        max_age: z.number().default(18),
        components: z.array(z.string()).default([]),
        items: z
          .array(z.object({ label: z.string(), kind: z.enum(["recipe", "bought"]).default("bought") }))
          .default([]),
        ingredients: z.array(ingredientSchema).default([]),
        training_suitable: z.boolean().default(false),
        needs_prep: z.boolean().default(false),
      }),
    )
    .default([]),
});

export type ImportResult = z.infer<typeof importSchema>;

const systemPrompt = `És um assistente que organiza planos de lanches escolares em português de Portugal.
Recebes texto livre (um plano semanal, uma lista de lanches ou receitas, possivelmente gerado por outra app ou IA).
Devolve APENAS JSON válido com esta forma:
{"recipes":[{"name","description","min_age","max_age","prep_minutes","portions","ingredients":[{"name","quantity","unit"}],"instructions":["passo"],"meal_components":["hidratos","proteína","fruta","vegetal"],"training_suitable","freezable"}],
"lunchboxes":[{"name","description","min_age","max_age","components":["hidratos","proteína","fruta"],"items":[{"label","kind"}],"ingredients":[{"name","quantity","unit"}],"training_suitable","needs_prep"}]}
Regras:
- "recipes" só para itens que precisam de preparação com ingredientes e passos.
- "lunchboxes" são sugestões de lanche completo (combinação de itens). kind="recipe" quando o item exige preparação, kind="bought" quando é comprado pronto (iogurte, fruta, pão, tosta).
- Cada lancheira deve ser completa: hidratos + proteína + fruta ou vegetal.
- Preenche "ingredients" da lancheira com os itens comprados, para a lista de compras.
- Não inventes muito: mantém-te fiel ao texto recebido. Sem markdown, sem comentários.`;

export const importPlanText = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ text: z.string().min(20).max(60000) }).parse(data))
  .handler(async ({ data }): Promise<ImportResult> => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("A leitura automática de documentos não está disponível.");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: data.text },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error("[import] AI gateway error", response.status, detail.slice(0, 400));
      throw new Error(
        response.status === 429
          ? "Demasiados pedidos seguidos. Tente novamente dentro de um minuto."
          : "Não foi possível ler o documento agora.",
      );
    }

    const payload = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    const content = payload.choices?.[0]?.message?.content ?? "{}";
    const cleaned = content.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    return importSchema.parse(JSON.parse(cleaned));
  });
