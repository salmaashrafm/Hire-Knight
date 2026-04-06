import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SmtpClient } from "https://deno.land/x/smtp@v0.7.0/mod.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

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
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
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

    // Get user's SMTP config + CV file path
    const { data: profile } = await supabase
      .from("profiles")
      .select("smtp_host, smtp_port, smtp_user, smtp_password_encrypted, cv_file_path, full_name")
      .eq("user_id", user.id)
      .single();

    if (!profile?.smtp_host || !profile?.smtp_user || !profile?.smtp_password_encrypted) {
      return new Response(JSON.stringify({ error: "SMTP not configured. Please update your settings." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Download CV PDF if available
    let cvAttachment: { filename: string; content: string; encoding: string } | null = null;
    if (profile.cv_file_path) {
      const { data: fileData, error: dlError } = await supabaseAdmin.storage
        .from("cv-files")
        .download(profile.cv_file_path);

      if (!dlError && fileData) {
        const arrayBuffer = await fileData.arrayBuffer();
        const base64 = base64Encode(new Uint8Array(arrayBuffer));
        const parts = profile.cv_file_path.split("/");
        const fileName = parts[parts.length - 1] || "cv.pdf";
        cvAttachment = { filename: fileName, content: base64, encoding: "base64" };
      }
    }

    let emailStatus = "sent";
    let errorMessage = null;

    try {
      const client = new SmtpClient();
      await client.connectTLS({
        hostname: profile.smtp_host,
        port: profile.smtp_port || 587,
        username: profile.smtp_user,
        password: profile.smtp_password_encrypted,
      });

      const sendOptions: any = {
        from: profile.smtp_user,
        to: recipientEmail,
        subject,
        content: body,
      };

      if (cvAttachment) {
        sendOptions.attachments = [{
          filename: cvAttachment.filename,
          content: cvAttachment.content,
          encoding: cvAttachment.encoding,
          contentType: "application/pdf",
        }];
      }

      await client.send(sendOptions);
      await client.close();
    } catch (smtpErr: any) {
      emailStatus = "failed";
      errorMessage = smtpErr.message || "SMTP error";
      console.error("SMTP error:", smtpErr);
    }

    // Log the email
    await supabase.from("email_logs").insert({
      user_id: user.id,
      application_id: applicationId,
      recipient_email: recipientEmail,
      subject,
      body,
      status: emailStatus,
      error_message: errorMessage,
    });

    // Update application status if sent
    if (emailStatus === "sent") {
      await supabase.from("applications").update({ status: "sent" }).eq("id", applicationId);
    }

    return new Response(JSON.stringify({ status: emailStatus, error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("send-email error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
