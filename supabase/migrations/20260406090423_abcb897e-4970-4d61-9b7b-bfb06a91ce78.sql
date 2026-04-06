
-- Create app_role enum for future role-based access
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function for role checks
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE POLICY "Users can view their own roles" ON public.user_roles
  FOR SELECT USING (auth.uid() = user_id);

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  email TEXT NOT NULL,
  full_name TEXT DEFAULT '',
  cv_text TEXT DEFAULT '',
  smtp_host TEXT DEFAULT '',
  smtp_port INTEGER DEFAULT 587,
  smtp_user TEXT DEFAULT '',
  smtp_password_encrypted TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Create application status enum
CREATE TYPE public.application_status AS ENUM ('draft', 'sent', 'replied');

-- Create applications table
CREATE TABLE public.applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  company_name TEXT NOT NULL,
  job_title TEXT NOT NULL,
  job_description TEXT NOT NULL DEFAULT '',
  cv_text TEXT NOT NULL DEFAULT '',
  match_score INTEGER,
  strengths JSONB DEFAULT '[]'::jsonb,
  gaps JSONB DEFAULT '[]'::jsonb,
  generated_email_subject TEXT DEFAULT '',
  generated_email_body TEXT DEFAULT '',
  recipient_email TEXT DEFAULT '',
  status application_status NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own applications" ON public.applications
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own applications" ON public.applications
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own applications" ON public.applications
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own applications" ON public.applications
  FOR DELETE USING (auth.uid() = user_id);

-- Create email_logs table
CREATE TABLE public.email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  application_id UUID REFERENCES public.applications(id) ON DELETE CASCADE NOT NULL,
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent',
  error_message TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own email logs" ON public.email_logs
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own email logs" ON public.email_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Timestamp update function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_applications_updated_at BEFORE UPDATE ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
