-- RLS policies and Storage policies.
-- Apply AFTER `pnpm db:push` has created tables.
-- food_cache is intentionally NOT under RLS (shared cache, read-only via app).

-- =================== USER-OWNED TABLES ===================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users access own profile" ON profiles;
CREATE POLICY "users access own profile"
  ON profiles FOR ALL
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users access own goals" ON goals;
CREATE POLICY "users access own goals"
  ON goals FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

ALTER TABLE meals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users access own meals" ON meals;
CREATE POLICY "users access own meals"
  ON meals FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

ALTER TABLE meal_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users access own meal_items" ON meal_items;
CREATE POLICY "users access own meal_items"
  ON meal_items FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

ALTER TABLE weights ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users access own weights" ON weights;
CREATE POLICY "users access own weights"
  ON weights FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

ALTER TABLE streaks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users access own streak" ON streaks;
CREATE POLICY "users access own streak"
  ON streaks FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

ALTER TABLE user_food_overrides ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users access own food overrides" ON user_food_overrides;
CREATE POLICY "users access own food overrides"
  ON user_food_overrides FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

ALTER TABLE meal_drafts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users access own drafts" ON meal_drafts;
CREATE POLICY "users access own drafts"
  ON meal_drafts FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

ALTER TABLE ai_calls ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users access own ai_calls" ON ai_calls;
CREATE POLICY "users access own ai_calls"
  ON ai_calls FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- =================== SHARED READ-ONLY ===================

-- food_cache: anonymous read allowed; writes only via service role (Server Actions).
ALTER TABLE food_cache ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anyone reads food cache" ON food_cache;
CREATE POLICY "anyone reads food cache"
  ON food_cache FOR SELECT
  USING (true);
-- No INSERT/UPDATE/DELETE policy → only service role (which bypasses RLS) can write.

-- =================== STORAGE: meals bucket ===================
-- Run these once after creating the 'meals' bucket in Supabase Storage.

DROP POLICY IF EXISTS "users read own meal photos" ON storage.objects;
CREATE POLICY "users read own meal photos"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'meals'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "users upload own meal photos" ON storage.objects;
CREATE POLICY "users upload own meal photos"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'meals'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "users update own meal photos" ON storage.objects;
CREATE POLICY "users update own meal photos"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'meals'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "users delete own meal photos" ON storage.objects;
CREATE POLICY "users delete own meal photos"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'meals'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
