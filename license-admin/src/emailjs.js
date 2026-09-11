import emailjs from "@emailjs/browser";

// EmailJS sends the email straight from the browser via your own Gmail, no backend.
// The "public key" is meant to be shipped to the browser (that's why it's called
// public) - abuse protection is EmailJS's own domain allowlist under
// Account > Security on emailjs.com, not hiding this value. Fill these in via .env:
// Email Services for SERVICE_ID, Email Templates for TEMPLATE_ID, Account > General
// for PUBLIC_KEY.
const PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;
const SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID;
const TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID;

let initialized = false;
function ensureInit() {
  if (!initialized && PUBLIC_KEY) {
    emailjs.init({ publicKey: PUBLIC_KEY });
    initialized = true;
  }
}

/**
 * Sends a set of codes to a client by email. Template variables sent: to_email,
 * client_name, code_count, duration, codes (newline-separated), codes_html (one <li>
 * per code), message (the admin's free-text note, may be empty). Build a template in
 * EmailJS using whichever of these it wants.
 */
export async function emailCodes(clientEmail, clientName, codes, duration, message) {
  if (!PUBLIC_KEY || !SERVICE_ID || !TEMPLATE_ID) {
    throw new Error(
      "EmailJS is not configured yet — set VITE_EMAILJS_PUBLIC_KEY / SERVICE_ID / TEMPLATE_ID in .env."
    );
  }

  ensureInit();

  await emailjs.send(SERVICE_ID, TEMPLATE_ID, {
    to_email: clientEmail,
    client_name: clientName || "there",
    code_count: codes.length,
    duration: duration || "",
    codes: codes.join("\n"),
    codes_html: codes.map((c) => `<li>${c}</li>`).join(""),
    message: message || "",
  });
}
