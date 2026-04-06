
CREATE TABLE public.user_prompts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  prompt_key text NOT NULL,
  prompt_text text NOT NULL DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, prompt_key)
);

ALTER TABLE public.user_prompts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own prompts" ON public.user_prompts
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own prompts" ON public.user_prompts
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own prompts" ON public.user_prompts
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own prompts" ON public.user_prompts
  FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_user_prompts_updated_at
  BEFORE UPDATE ON public.user_prompts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
