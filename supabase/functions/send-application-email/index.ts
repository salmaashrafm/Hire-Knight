import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Buffer } from "node:buffer";
import nodemailer from "npm:nodemailer@6.9.12";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { applicationId, recipientEmail, subject, body } = await req.json();
    if (!applicationId || !recipientEmail || !subject || !body) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("smtp_host, smtp_port, smtp_user, smtp_password_encrypted, cv_file_path")
      .eq("user_id", user.id)
      .single();

    if (!profile?.smtp_host || !profile?.smtp_user || !profile?.smtp_password_encrypted) {
      return new Response(JSON.stringify({ error: "SMTP not configured. Please update your settings." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Download CV PDF if available
    let attachments: { filename: string; content: Buffer; contentType: string }[] = [];
    if (profile.cv_file_path) {
      const { data: fileData, error: dlError } = await supabaseAdmin.storage
        .from("cv-files")
        .download(profile.cv_file_path);

      if (!dlError && fileData) {
        const arrayBuffer = await fileData.arrayBuffer();
        const fileName = profile.cv_file_path.split("/").pop() || "cv.pdf";
        attachments = [{
          filename: fileName,
          content: Buffer.from(arrayBuffer),
          contentType: "application/pdf",
        }];
      }
    }

    console.log(`Sending email. to=${recipientEmail} attachments=${attachments.length} filename=${attachments[0]?.filename ?? "none"}`);

    let emailStatus = "sent";
    let errorMessage: string | null = null;

    try {
      const port = profile.smtp_port || 587;
      const transporter = nodemailer.createTransport({
        host: profile.smtp_host,
        port,
        secure: port === 465,
        auth: {
          user: profile.smtp_user,
          pass: profile.smtp_password_encrypted,
        },
        connectionTimeout: 15000,
        greetingTimeout: 10000,
        socketTimeout: 20000,
      });

      await transporter.sendMail({
        from: profile.smtp_user,
        to: recipientEmail,
        subject,
        text: body,
        attachments,
      });
    } catch (smtpErr: any) {
      emailStatus = "failed";
      errorMessage = smtpErr.message || "SMTP error";
      console.error("SMTP error:", smtpErr);
    }

    await supabase.from("email_logs").insert({
      user_id: user.id,
      application_id: applicationId,
      recipient_email: recipientEmail,
      subject,
      body,
      status: emailStatus,
      error_message: errorMessage,
    });

    if (emailStatus === "sent") {
      await supabase.from("applications").update({ status: "sent" }).eq("id", applicationId);
    }

    return new Response(JSON.stringify({
      status: emailStatus,
      error: errorMessage,
      attachmentIncluded: attachments.length > 0,
      attachmentFilename: attachments[0]?.filename ?? null,
    }), {
      status: emailStatus === "sent" ? 200 : 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("send-email error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});