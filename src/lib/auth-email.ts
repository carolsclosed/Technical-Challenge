import { z } from "zod";
import { safeNext } from "./display";

export const authEmailSchema = z.object({
  user: z.object({
    email: z.email(),
    new_email: z.string().optional(),
    user_metadata: z.record(z.string(), z.unknown()).optional(),
  }),
  email_data: z.object({
    email_action_type: z.string(),
    token: z.string().optional(),
    token_hash: z.string().optional(),
    token_new: z.string().optional(),
    token_hash_new: z.string().optional(),
    redirect_to: z.string().optional(),
  }),
});
export type AuthEmail = z.infer<typeof authEmailSchema>;
export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};
export type TeamInvitation = {
  id: string;
  token: string;
  merchant_name: string;
  store_names: string[];
  role: "admin" | "staff" | "operator";
};

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!,
  );
}

function verificationLink(
  site: URL,
  hash: string | undefined,
  type: string,
  next: string,
) {
  if (!["https:", "http:"].includes(site.protocol))
    throw Error("EMAIL_NOT_CONFIGURED");
  if (!hash || !/^[a-zA-Z0-9_-]{20,512}$/.test(hash))
    throw Error("EMAIL_PAYLOAD_INVALID");
  const link = new URL("/auth/verify", site);
  // Fragments do not enter server access logs or get consumed by mail scanners.
  link.hash = new URLSearchParams({ token_hash: hash, type, next }).toString();
  return link.href;
}

type BrandedEmail = {
  to: string;
  locale: "en" | "pt-PT";
  subject: string;
  title: string;
  paragraphs?: string[];
  details?: string[];
  cta?: { label: string; href: string };
  code?: { label: string; value: string };
  note: string;
};

function cleanSubject(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim();
}

/** Keep every transactional message aligned with the invitation email while
 * retaining a complete plain-text alternative for accessibility and clients
 * that disable HTML. All caller-provided content is escaped at this boundary. */
function brandedEmail({
  to,
  locale,
  subject,
  title,
  paragraphs = [],
  details = [],
  cta,
  code,
  note,
}: BrandedEmail): EmailMessage {
  const text = [
    title,
    ...paragraphs,
    details.length ? details.join("\n") : "",
    code ? `${code.label}: ${code.value}` : "",
    cta ? `${cta.label}\n${cta.href}` : "",
    note,
  ]
    .filter(Boolean)
    .join("\n\n");
  const detailHtml = details.length
    ? `<div style="margin:22px 0;padding:18px 20px;border-left:4px solid #f5b841;background:#fff9e8;border-radius:0 14px 14px 0">${details.map((line) => `<p style="margin:${line === details[0] ? "0" : "8px 0 0"};line-height:1.55">${escapeHtml(line)}</p>`).join("")}</div>`
    : "";
  const codeHtml = code
    ? `<div style="margin:24px 0;padding:20px;text-align:center;background:#eaf6f1;border-radius:18px"><p style="margin:0 0 8px;font-size:13px;color:#52675b">${escapeHtml(code.label)}</p><p style="margin:0;font-size:30px;line-height:1;letter-spacing:7px;font-weight:800;color:#087d57">${escapeHtml(code.value)}</p></div>`
    : "";
  const ctaHtml = cta
    ? `<p style="margin:28px 0"><a href="${escapeHtml(cta.href)}" style="display:inline-block;padding:14px 24px;border-radius:28px;background:#087d57;color:#ffffff;text-decoration:none;font-weight:700">${escapeHtml(cta.label)}</a></p>`
    : "";
  return {
    to,
    subject: cleanSubject(subject),
    text,
    html: `<!doctype html><html lang="${locale}"><body style="margin:0;padding:32px 20px;background:#f6f5ef;color:#17362c;font-family:Arial,Helvetica,sans-serif"><main style="max-width:560px;margin:auto"><p style="margin:0 0 26px;font-size:28px;font-weight:800;color:#087d57">mesa.</p><h1 style="margin:0 0 18px;font-size:26px;line-height:1.3;color:#17362c">${escapeHtml(title)}</h1>${paragraphs.map((paragraph) => `<p style="margin:0 0 14px;line-height:1.7">${escapeHtml(paragraph)}</p>`).join("")}${detailHtml}${codeHtml}${ctaHtml}<p style="margin:30px 0 0;padding-top:20px;border-top:1px solid #dce4de;font-size:13px;line-height:1.6;color:#52675b">${escapeHtml(note)}</p></main></body></html>`,
  };
}

export function teamInvitationEmail(
  {
    email,
    hash,
    invitation,
    locale,
  }: {
    email: string;
    hash: string;
    invitation: TeamInvitation;
    locale: "en" | "pt-PT";
  },
  siteUrl: string,
): EmailMessage {
  const next = "/account#invitation=" + invitation.token;
  const link = verificationLink(new URL(siteUrl), hash, "magiclink", next);
  const pt = locale === "pt-PT";
  const roles = {
    admin: pt ? "administrador" : "admin",
    staff: pt ? "colaborador" : "staff",
    operator: pt ? "operador" : "operator",
  };
  const stores = invitation.store_names.join(", ");
  const place = stores || invitation.merchant_name;
  const subject = pt
    ? `Convite para ${place} — mesa.`
    : `You’re invited to ${place} — mesa.`;
  const greeting = pt
    ? `Recebeu um convite para se juntar a ${place} como ${roles[invitation.role]}.`
    : `You have been invited to join ${place} as ${roles[invitation.role]}.`;
  const business = pt
    ? `Comerciante: ${invitation.merchant_name}`
    : `Merchant: ${invitation.merchant_name}`;
  const scope = stores
    ? pt
      ? `Lojas: ${stores}`
      : `Stores: ${stores}`
    : invitation.role === "admin"
      ? pt
        ? "Pode gerir todas as lojas deste comerciante."
        : "You can manage all stores belonging to this merchant."
      : pt
        ? "O administrador irá atribuir as suas lojas na página Equipa."
        : "Your admin will assign your stores on the Team page.";
  const instruction = pt
    ? `Siga o link abaixo e escolha «Aceitar convite». Se já iniciou sessão com ${email}, pode aceitar diretamente. Caso contrário, entre com esse email e conclua a autenticação de dois fatores, se estiver ativa na sua conta.`
    : `Follow the link below and choose “Accept invitation”. If you are already signed in as ${email}, you can accept directly. Otherwise, sign in with that email and complete two-factor authentication if it is enabled on your account.`;
  const cta = pt ? "Ver e aceitar convite" : "View and accept invitation";
  const note = pt
    ? "O convite é válido durante sete dias e só pode ser aceite uma vez. O link de início de sessão pode expirar antes; nesse caso, peça ao responsável para reenviar o convite. Se não reconhece este convite, ignore esta mensagem. Nunca partilhe o link."
    : "The invitation is valid for seven days and can be accepted once. The sign-in link may expire sooner; if it does, ask the owner to resend the invitation. If you do not recognize this invitation, ignore this message. Never share the link.";
  return brandedEmail({
    to: email,
    locale,
    subject,
    title: greeting,
    paragraphs: [instruction],
    details: [business, scope],
    cta: { label: cta, href: link },
    note,
  });
}

function destination(redirect: string | undefined, site: URL) {
  if (!redirect) return "/";
  try {
    const url = new URL(redirect, site);
    if (url.origin !== site.origin) return "/";
    if (url.pathname === "/auth/callback")
      return safeNext(url.searchParams.get("next"));
    return safeNext(url.pathname + url.search + url.hash);
  } catch {
    return "/";
  }
}

export function authEmailMessages(
  payload: AuthEmail,
  siteUrl: string,
): EmailMessage[] {
  const site = new URL(siteUrl);
  if (!["https:", "http:"].includes(site.protocol))
    throw Error("EMAIL_NOT_CONFIGURED");
  const { user, email_data: data } = payload;
  const portuguese = user.user_metadata?.locale === "pt-PT";
  const type = data.email_action_type;
  const next =
    type === "recovery"
      ? "/auth/reset-password"
      : destination(data.redirect_to, site);

  function message(
    to: string,
    hash: string | undefined,
    action: string,
  ): EmailMessage {
    const link = verificationLink(site, hash, action, next);
    const recovery = action === "recovery";
    const emailChange = action === "email_change";
    const magic = action === "magiclink";
    const authInvite = action === "invite";
    const locale = portuguese ? "pt-PT" : "en";
    const subject = portuguese
      ? recovery
        ? "Repor a palavra-passe — mesa."
        : emailChange
          ? "Confirmar alteração de email — mesa."
          : magic
            ? "Iniciar sessão — mesa."
            : authInvite
              ? "Aceitar convite — mesa."
              : "Verifique o seu email — mesa."
      : recovery
        ? "Reset your password — mesa."
        : emailChange
          ? "Confirm your email change — mesa."
          : magic
            ? "Sign in — mesa."
            : authInvite
              ? "Accept your invitation — mesa."
              : "Verify your email — mesa.";
    const title = portuguese
      ? recovery
        ? "Escolha uma nova palavra-passe"
        : emailChange
          ? "Confirme o seu novo email"
          : magic
            ? "Inicie sessão na mesa."
            : authInvite
              ? "Foi convidado para a mesa."
              : "Confirme o seu email"
      : recovery
        ? "Choose a new password"
        : emailChange
          ? "Confirm your new email"
          : magic
            ? "Sign in to mesa."
            : authInvite
              ? "You’re invited to mesa."
              : "Confirm your email";
    const instruction = portuguese
      ? recovery
        ? "Use o botão abaixo para abrir o formulário seguro e escolher uma nova palavra-passe."
        : emailChange
          ? "Use o botão abaixo para confirmar que este endereço de email lhe pertence."
          : magic
            ? "Use este link seguro e de utilização única para iniciar sessão."
            : authInvite
              ? "Use o botão abaixo para confirmar o convite e continuar."
              : "Confirme este endereço para concluir a criação da sua conta."
      : recovery
        ? "Use the button below to open the secure form and choose a new password."
        : emailChange
          ? "Use the button below to confirm that this email address belongs to you."
          : magic
            ? "Use this secure, one-use link to sign in."
            : authInvite
              ? "Use the button below to confirm the invitation and continue."
              : "Confirm this address to finish creating your account.";
    const cta = portuguese
      ? recovery
        ? "Repor palavra-passe"
        : emailChange
          ? "Confirmar novo email"
          : magic
            ? "Iniciar sessão"
            : authInvite
              ? "Aceitar convite"
              : "Verificar email"
      : recovery
        ? "Reset password"
        : emailChange
          ? "Confirm new email"
          : magic
            ? "Sign in"
            : authInvite
              ? "Accept invitation"
              : "Verify email";
    const ignore = portuguese
      ? "Se não pediu esta mensagem, pode ignorá-la. O link expira e só deve ser utilizado por si. Nunca o partilhe."
      : "If you did not request this message, you can ignore it. The link expires and should be used only by you. Never share it.";
    return brandedEmail({
      to,
      locale,
      subject,
      title,
      paragraphs: [instruction],
      cta: { label: cta, href: link },
      note: ignore,
    });
  }

  if (["signup", "recovery", "invite", "magiclink"].includes(type))
    return [message(user.email, data.token_hash, type)];
  if (type === "email_change") {
    const email = z.email().parse(user.new_email);
    const result = [message(email, data.token_hash, "email_change")];
    if (data.token_hash_new)
      result.push(message(user.email, data.token_hash_new, "email_change"));
    return result;
  }
  if (type === "reauthentication") {
    if (!data.token || !/^\d{6,10}$/.test(data.token))
      throw Error("EMAIL_PAYLOAD_INVALID");
    return [
      brandedEmail({
        to: user.email,
        locale: portuguese ? "pt-PT" : "en",
        subject: portuguese
          ? "Confirme a sua identidade — mesa."
          : "Confirm your identity — mesa.",
        title: portuguese
          ? "Confirme a sua identidade"
          : "Confirm your identity",
        paragraphs: [
          portuguese
            ? "Introduza este código na mesa. para continuar com segurança."
            : "Enter this code in mesa. to continue securely.",
        ],
        code: {
          label: portuguese ? "Código de confirmação" : "Confirmation code",
          value: data.token,
        },
        note: portuguese
          ? "Se não pediu este código, altere a palavra-passe. Nunca partilhe o código."
          : "If you did not request this code, change your password. Never share the code.",
      }),
    ];
  }
  const notifications: Record<string, [string, string]> = {
    password_changed_notification: [
      "Your password changed.",
      "A sua palavra-passe foi alterada.",
    ],
    mfa_factor_enrolled_notification: [
      "An authenticator was added to your account.",
      "Foi adicionado um autenticador à sua conta.",
    ],
    mfa_factor_unenrolled_notification: [
      "An authenticator was removed from your account.",
      "Foi removido um autenticador da sua conta.",
    ],
    email_changed_notification: [
      "Your account email changed.",
      "O email da sua conta foi alterado.",
    ],
  };
  if (notifications[type]) {
    const notice = notifications[type][portuguese ? 1 : 0];
    return [
      brandedEmail({
        to: user.email,
        locale: portuguese ? "pt-PT" : "en",
        subject: portuguese
          ? "Segurança da conta — mesa."
          : "Account security — mesa.",
        title: portuguese
          ? "Atualização de segurança da conta"
          : "Account security update",
        paragraphs: [notice],
        note: portuguese
          ? "Se não fez esta alteração, reponha imediatamente a palavra-passe da sua conta."
          : "If you did not make this change, reset your account password immediately.",
      }),
    ];
  }
  throw Error("EMAIL_ACTION_UNSUPPORTED");
}
