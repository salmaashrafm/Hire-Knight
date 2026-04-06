
CREATE TABLE public.email_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

-- Everyone can read default templates
CREATE POLICY "Anyone can view default templates"
  ON public.email_templates FOR SELECT
  TO authenticated
  USING (is_default = true);

-- Users can view their own templates
CREATE POLICY "Users can view their own templates"
  ON public.email_templates FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can insert their own templates
CREATE POLICY "Users can insert their own templates"
  ON public.email_templates FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id AND is_default = false);

-- Users can update their own non-default templates
CREATE POLICY "Users can update their own templates"
  ON public.email_templates FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id AND is_default = false);

-- Users can delete their own non-default templates
CREATE POLICY "Users can delete their own templates"
  ON public.email_templates FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id AND is_default = false);
