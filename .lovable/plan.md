

# AI Job Hunter — Full-Stack SaaS App

## Overview
A web application where users can analyze their CV against job descriptions using AI, generate personalized application emails, send them via their own SMTP, and track all applications.

## Database Schema

### Users / Auth
- Supabase Auth for registration, login, JWT tokens
- **profiles** table: id, email, full_name, cv_text, smtp_host, smtp_port, smtp_user, smtp_password_encrypted, created_at
- **user_roles** table for future role-based access

### Applications
- id, user_id (FK), company_name, job_title, job_description, cv_text, match_score, strengths (JSONB), gaps (JSONB), generated_email_subject, generated_email_body, status (draft/sent/replied), created_at, updated_at

### Email Logs
- id, user_id (FK), application_id (FK), recipient_email, subject, body, status (sent/failed), error_message, sent_at

## Pages & UI

1. **Auth Pages** — Login, Register, Password Reset
2. **Dashboard** — Overview of applications with stats (total, by status), recent activity
3. **Profile Settings** — Edit name, paste/upload CV text, configure SMTP credentials
4. **New Application Flow**:
   - Form: company name, job title, job description, CV text (pre-filled from profile)
   - "Analyze Match" button → calls AI → displays match score, strengths, gaps
   - "Generate Email" button → calls AI → shows editable email draft
   - "Send Email" button → sends via user's SMTP → logs result
5. **Applications List** — Table with filtering by status, search, sort by date
6. **Application Detail** — View full analysis, email history, update status

## Edge Functions (API)

1. **analyze-cv** — Receives CV + job description, calls OpenAI API, returns match score, strengths, gaps
2. **generate-email** — Receives analysis results + job info, calls OpenAI API, returns email subject + body
3. **send-application-email** — Receives email content + recipient + user's SMTP config, sends email via SMTP, logs result

## Security & Data
- RLS policies: users can only access their own data
- SMTP passwords encrypted before storage
- Input validation on all forms and edge functions
- OpenAI API key stored as a Supabase secret

## Design
- Clean, professional SaaS look with a blue primary color
- Responsive layout with sidebar navigation
- Cards for application summaries, progress indicators for match scores
- Toast notifications for success/error states

