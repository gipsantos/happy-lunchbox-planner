CREATE TABLE public.lunchboxes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  min_age integer NOT NULL DEFAULT 3,
  max_age integer NOT NULL DEFAULT 18,
  components text[] NOT NULL DEFAULT '{}',
  items jsonb NOT NULL DEFAULT '[]',
  ingredients jsonb NOT NULL DEFAULT '[]',
  training_suitable boolean NOT NULL DEFAULT false,
  needs_prep boolean NOT NULL DEFAULT false,
  source text NOT NULL DEFAULT 'system',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.lunchboxes TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lunchboxes TO authenticated;
GRANT ALL ON public.lunchboxes TO service_role;
ALTER TABLE public.lunchboxes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone reads system lunchboxes" ON public.lunchboxes FOR SELECT TO anon, authenticated USING (user_id IS NULL OR auth.uid() = user_id);
CREATE POLICY "Families add own lunchboxes" ON public.lunchboxes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Families update own lunchboxes" ON public.lunchboxes FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Families delete own lunchboxes" ON public.lunchboxes FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER lunchboxes_updated_at BEFORE UPDATE ON public.lunchboxes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.lunchbox_selections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  lunchbox_id uuid NOT NULL REFERENCES public.lunchboxes(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, lunchbox_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lunchbox_selections TO authenticated;
GRANT ALL ON public.lunchbox_selections TO service_role;
ALTER TABLE public.lunchbox_selections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Families manage own selections" ON public.lunchbox_selections FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.plan_items ALTER COLUMN recipe_id DROP NOT NULL;
ALTER TABLE public.plan_items ADD COLUMN lunchbox_id uuid REFERENCES public.lunchboxes(id) ON DELETE SET NULL;