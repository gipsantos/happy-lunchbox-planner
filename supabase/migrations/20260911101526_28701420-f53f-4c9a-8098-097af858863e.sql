CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TABLE public.children (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  age integer NOT NULL CHECK (age BETWEEN 2 AND 18),
  snacks_per_day integer NOT NULL DEFAULT 1 CHECK (snacks_per_day BETWEEN 1 AND 4),
  training_days integer[] NOT NULL DEFAULT '{}',
  training_timing text NOT NULL DEFAULT 'before' CHECK (training_timing IN ('before','after')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.children TO authenticated;
GRANT ALL ON public.children TO service_role;
ALTER TABLE public.children ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Families manage own children" ON public.children FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER children_updated_at BEFORE UPDATE ON public.children FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  description text NOT NULL DEFAULT '',
  min_age integer NOT NULL DEFAULT 3,
  max_age integer NOT NULL DEFAULT 18,
  prep_minutes integer NOT NULL DEFAULT 10 CHECK (prep_minutes >= 0),
  cook_minutes integer NOT NULL DEFAULT 0 CHECK (cook_minutes >= 0),
  portions integer NOT NULL DEFAULT 1 CHECK (portions > 0),
  freezable boolean NOT NULL DEFAULT false,
  ingredients jsonb NOT NULL DEFAULT '[]'::jsonb,
  instructions text[] NOT NULL DEFAULT '{}',
  nutrition_tags text[] NOT NULL DEFAULT '{}',
  meal_components text[] NOT NULL DEFAULT '{}',
  training_suitable boolean NOT NULL DEFAULT false,
  image_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (max_age >= min_age)
);
GRANT SELECT ON public.recipes TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recipes TO authenticated;
GRANT ALL ON public.recipes TO service_role;
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone reads starter recipes" ON public.recipes FOR SELECT TO anon, authenticated USING (user_id IS NULL OR auth.uid() = user_id);
CREATE POLICY "Families add own recipes" ON public.recipes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Families update own recipes" ON public.recipes FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Families delete own recipes" ON public.recipes FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER recipes_updated_at BEFORE UPDATE ON public.recipes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.meal_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  period_type text NOT NULL CHECK (period_type IN ('week','month')),
  plan_mode text NOT NULL CHECK (plan_mode IN ('child','family')),
  child_id uuid REFERENCES public.children(id) ON DELETE CASCADE,
  starts_on date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((plan_mode = 'child' AND child_id IS NOT NULL) OR (plan_mode = 'family' AND child_id IS NULL))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meal_plans TO authenticated;
GRANT ALL ON public.meal_plans TO service_role;
ALTER TABLE public.meal_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Families manage own plans" ON public.meal_plans FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER meal_plans_updated_at BEFORE UPDATE ON public.meal_plans FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.plan_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.meal_plans(id) ON DELETE CASCADE,
  child_id uuid REFERENCES public.children(id) ON DELETE CASCADE,
  recipe_id uuid NOT NULL REFERENCES public.recipes(id) ON DELETE RESTRICT,
  snack_date date NOT NULL,
  snack_number integer NOT NULL DEFAULT 1 CHECK (snack_number BETWEEN 1 AND 4),
  training_boost boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(plan_id, child_id, snack_date, snack_number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plan_items TO authenticated;
GRANT ALL ON public.plan_items TO service_role;
ALTER TABLE public.plan_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Families read own plan items" ON public.plan_items FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.meal_plans p WHERE p.id = plan_id AND p.user_id = auth.uid()));
CREATE POLICY "Families add own plan items" ON public.plan_items FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.meal_plans p WHERE p.id = plan_id AND p.user_id = auth.uid()));
CREATE POLICY "Families update own plan items" ON public.plan_items FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.meal_plans p WHERE p.id = plan_id AND p.user_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.meal_plans p WHERE p.id = plan_id AND p.user_id = auth.uid()));
CREATE POLICY "Families delete own plan items" ON public.plan_items FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.meal_plans p WHERE p.id = plan_id AND p.user_id = auth.uid()));

INSERT INTO public.recipes (name, description, min_age, max_age, prep_minutes, cook_minutes, portions, freezable, ingredients, instructions, nutrition_tags, meal_components, training_suitable) VALUES
('Muffins de banana e aveia', 'Macios, naturalmente doces e práticos para preparar ao domingo.', 3, 18, 10, 20, 12, true, '[{"name":"Banana","quantity":3,"unit":"un"},{"name":"Ovos","quantity":2,"unit":"un"},{"name":"Aveia","quantity":120,"unit":"g"},{"name":"Canela","quantity":1,"unit":"q.b."}]', ARRAY['Esmagar a banana e envolver os ovos.','Juntar a aveia e a canela.','Levar ao forno a 180 °C durante 20 minutos.'], ARRAY['Energia','Fibra','Potássio'], ARRAY['hidratos'], true),
('Panquecas de aveia', 'Panquecas pequenas para combinar com queijo e fruta fresca.', 3, 18, 10, 10, 10, true, '[{"name":"Aveia","quantity":150,"unit":"g"},{"name":"Ovos","quantity":2,"unit":"un"},{"name":"Leite","quantity":200,"unit":"ml"},{"name":"Banana","quantity":1,"unit":"un"}]', ARRAY['Triturar todos os ingredientes.','Cozinhar pequenas porções numa frigideira antiaderente.'], ARRAY['Energia','Proteína'], ARRAY['hidratos','proteína'], true),
('Wrap de húmus e frango', 'Um lanche salgado completo, fácil de transportar.', 6, 18, 10, 0, 4, false, '[{"name":"Wrap integral","quantity":4,"unit":"un"},{"name":"Húmus","quantity":120,"unit":"g"},{"name":"Frango cozinhado","quantity":200,"unit":"g"},{"name":"Cenoura","quantity":1,"unit":"un"}]', ARRAY['Barrar os wraps com húmus.','Juntar frango desfiado e cenoura ralada.','Enrolar e cortar ao meio.'], ARRAY['Proteína','Ferro','Fibra'], ARRAY['hidratos','proteína','vegetal'], true),
('Queques de maçã', 'Queques húmidos com maçã e canela, sem açúcar refinado.', 3, 18, 15, 22, 12, true, '[{"name":"Maçã","quantity":2,"unit":"un"},{"name":"Farinha integral","quantity":180,"unit":"g"},{"name":"Ovos","quantity":2,"unit":"un"},{"name":"Iogurte natural","quantity":125,"unit":"g"}]', ARRAY['Misturar os ingredientes húmidos.','Adicionar farinha e maçã em cubos.','Cozer a 180 °C durante 22 minutos.'], ARRAY['Fibra','Cálcio'], ARRAY['hidratos','proteína'], false),
('Iogurte, granola e frutos vermelhos', 'Uma combinação fresca e equilibrada para dias sem treino.', 3, 18, 5, 0, 1, false, '[{"name":"Iogurte natural","quantity":1,"unit":"un"},{"name":"Granola sem açúcar","quantity":30,"unit":"g"},{"name":"Frutos vermelhos","quantity":80,"unit":"g"}]', ARRAY['Colocar o iogurte num recipiente.','Levar a granola separada para manter crocante.','Juntar a fruta no momento de comer.'], ARRAY['Proteína','Cálcio','Fibra'], ARRAY['hidratos','proteína','fruta'], false);