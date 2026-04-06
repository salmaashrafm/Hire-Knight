
-- Add cv_file_path to profiles
ALTER TABLE public.profiles ADD COLUMN cv_file_path text DEFAULT '';

-- Create storage bucket for CV files
INSERT INTO storage.buckets (id, name, public) VALUES ('cv-files', 'cv-files', false);

-- Storage policies: users can manage their own CV files (folder = user_id)
CREATE POLICY "Users can view their own CV" ON storage.objects
  FOR SELECT USING (bucket_id = 'cv-files' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can upload their own CV" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'cv-files' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their own CV" ON storage.objects
  FOR UPDATE USING (bucket_id = 'cv-files' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own CV" ON storage.objects
  FOR DELETE USING (bucket_id = 'cv-files' AND auth.uid()::text = (storage.foldername(name))[1]);
