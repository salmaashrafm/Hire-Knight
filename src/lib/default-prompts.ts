export const DEFAULT_PROMPTS: Record<string, { label: string; defaultText: string }> = {
  analyze_cv: {
    label: "CV Analysis Prompt",
    defaultText: `You are a CV/job matching expert. Analyze the CV against the job description and return a JSON object with:
- candidateName: string (extract the candidate's full name from the CV)
- companyName: string (extract the company name from the job description)
- jobTitle: string (extract the job title from the job description)
- matchScore: integer 0-100
- strengths: array of strings (key matching qualifications)
- gaps: array of strings (missing or weak areas)
Be concise. Each strength/gap should be 3-8 words. If you can't find a name/company/title, use an empty string.`,
  },
  generate_email: {
    label: "Email Generation Prompt",
    defaultText: `You are a professional job application email writer. Write a compelling, personalized application email. Use the candidate's CV details to personalize the email — mention specific experiences, skills, and achievements from their CV. Return JSON with:
- subject: email subject line
- body: full email body (plain text, professional tone)
Sign the email with the candidate's name. Highlight strengths and address gaps constructively. Keep it concise (200-300 words).`,
  },
};
