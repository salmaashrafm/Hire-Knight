
INSERT INTO public.email_templates (user_id, name, subject, body, is_default) VALUES
('00000000-0000-0000-0000-000000000000', 'Job Application', 'Application for {{jobTitle}} at {{companyName}}', 'Dear Hiring Manager,

I am writing to express my interest in the {{jobTitle}} position at {{companyName}}.

With my background and skills, I believe I would be a valuable addition to your team. I am particularly drawn to {{companyName}} because of its reputation and work in the industry.

I have attached my CV for your review and would welcome the opportunity to discuss how my experience aligns with your needs.

Thank you for considering my application. I look forward to hearing from you.

Best regards,
{{candidateName}}', true),

('00000000-0000-0000-0000-000000000000', 'Follow-up', 'Following up on my application - {{jobTitle}}', 'Dear Hiring Manager,

I hope this message finds you well. I am writing to follow up on my application for the {{jobTitle}} position at {{companyName}}, which I submitted recently.

I remain very interested in this opportunity and would love to discuss how I can contribute to your team.

Please let me know if you need any additional information from my end.

Thank you for your time and consideration.

Best regards,
{{candidateName}}', true),

('00000000-0000-0000-0000-000000000000', 'Thank You', 'Thank you - {{jobTitle}} Interview', 'Dear Hiring Manager,

Thank you for taking the time to speak with me about the {{jobTitle}} position at {{companyName}}.

I enjoyed learning more about the role and your team. Our conversation reinforced my enthusiasm for the opportunity.

I look forward to the next steps in the process. Please do not hesitate to reach out if you need any further information.

Best regards,
{{candidateName}}', true);
