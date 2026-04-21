/**
 * Email Service — transactional email via Resend
 *
 * Usage:
 *   import { sendEmail, EmailTemplates } from './email.js';
 *   await sendEmail(EmailTemplates.workspaceInvite({ ... }));
 *
 * Set RESEND_API_KEY in your environment to enable.
 * If not set, emails are logged to console in dev mode and silently skipped in production.
 *
 * Set RESEND_FROM_ADDRESS to override the default sender (default: noreply@aimlead.io).
 */

import { Resend } from 'resend';
import { logger } from './observability.js';

const getResendClient = () => {
  const apiKey = String(process.env.RESEND_API_KEY || '').trim();
  if (!apiKey) return null;
  return new Resend(apiKey);
};

const getFromAddress = () =>
  String(process.env.RESEND_FROM_ADDRESS || 'AimLeads <noreply@aimlead.io>').trim();

const getAppUrl = () =>
  String(process.env.APP_ORIGIN || process.env.CORS_ORIGIN || 'https://app.aimlead.io').replace(/\/$/, '');

/**
 * Send a transactional email.
 * Silently skips if RESEND_API_KEY is not configured.
 *
 * @param {{ to: string, subject: string, html: string, text?: string }} params
 * @returns {Promise<boolean>} true if sent, false if skipped/failed
 */
export const sendEmail = async ({ to, subject, html, text }) => {
  const client = getResendClient();

  if (!client) {
    if (process.env.NODE_ENV !== 'production') {
      logger.info('email_skipped_no_key', { to, subject });
    }
    return false;
  }

  try {
    await client.emails.send({
      from: getFromAddress(),
      to: [to],
      subject,
      html,
      text: text || stripHtml(html),
    });
    logger.info('email_sent', { to, subject });
    return true;
  } catch (error) {
    logger.warn('email_send_failed', { to, subject, error: error.message });
    return false;
  }
};

// Simple HTML stripper for plain text fallback
function stripHtml(html) {
  return String(html || '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// ─────────────────────────────────────────────────────────────────
// Shared layout helpers
// ─────────────────────────────────────────────────────────────────

const emailLayout = (content, previewText = '') => `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>AimLeads</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  ${previewText ? `<div style="display:none;max-height:0;overflow:hidden;">${previewText}</div>` : ''}
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background:#0f172a;padding:24px 32px;">
              <span style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.5px;">AimLeads</span>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;">
              <p style="margin:0;font-size:12px;color:#94a3b8;text-align:center;">
                AimLeads · Lead intelligence for B2B teams<br />
                <a href="${getAppUrl()}" style="color:#6366f1;text-decoration:none;">app.aimlead.io</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

const btnPrimary = (url, label) =>
  `<a href="${url}" style="display:inline-block;background:#6366f1;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:600;font-size:15px;margin:16px 0;">${label}</a>`;

const p = (text, style = '') =>
  `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#1e293b;${style}">${text}</p>`;

const h1 = (text) =>
  `<h1 style="margin:0 0 24px;font-size:24px;font-weight:700;color:#0f172a;">${text}</h1>`;

const divider = () =>
  `<hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />`;

// ─────────────────────────────────────────────────────────────────
// Email templates
// ─────────────────────────────────────────────────────────────────

export const EmailTemplates = {
  /**
   * Sent to a new user invited to join a workspace.
   */
  workspaceInvite: ({ toEmail, inviterName, workspaceName, inviteUrl, role = 'member' }) => ({
    to: toEmail,
    subject: `${inviterName} t'invite à rejoindre ${workspaceName} sur AimLeads`,
    html: emailLayout(
      `
      ${h1(`Tu as été invité à rejoindre ${workspaceName}`)}
      ${p(`<strong>${inviterName}</strong> t'invite à collaborer sur <strong>${workspaceName}</strong> avec le rôle <strong>${role}</strong>.`)}
      ${p('AimLeads est une plateforme de lead intelligence B2B qui t\'aide à scorer, qualifier et contacter tes prospects.')}
      <div style="text-align:center;margin:32px 0;">
        ${btnPrimary(inviteUrl, 'Accepter l\'invitation')}
      </div>
      ${p('Ce lien est valable 7 jours. Si tu n\'attendais pas cette invitation, tu peux ignorer cet email.', 'color:#64748b;font-size:13px;')}
      `,
      `${inviterName} t'invite à rejoindre ${workspaceName}`
    ),
  }),

  /**
   * Welcome email sent after successful registration.
   */
  welcome: ({ toEmail, fullName, workspaceName }) => ({
    to: toEmail,
    subject: `Bienvenue sur AimLeads${workspaceName ? ` — ${workspaceName}` : ''}`,
    html: emailLayout(
      `
      ${h1(`Bienvenue, ${fullName || 'sur AimLeads'} 👋`)}
      ${p('Ton espace de travail est prêt. Voici les premières étapes pour démarrer :')}
      <ol style="margin:0 0 24px;padding-left:20px;font-size:15px;line-height:1.8;color:#1e293b;">
        <li><strong>Configure ton ICP</strong> (profil client idéal) pour paramétrer le scoring</li>
        <li><strong>Importe tes leads</strong> depuis un fichier CSV ou XLSX</li>
        <li><strong>Lance une analyse</strong> pour scorer tes leads avec l'IA</li>
      </ol>
      <div style="text-align:center;margin:32px 0;">
        ${btnPrimary(`${getAppUrl()}/dashboard`, 'Accéder à mon espace')}
      </div>
      ${divider()}
      ${p('Des questions ? Réponds directement à cet email ou consulte notre <a href="${getAppUrl()}/help" style="color:#6366f1;">centre d\'aide</a>.', 'font-size:13px;color:#64748b;')}
      `,
      'Ton espace AimLeads est prêt'
    ),
  }),

  /**
   * Sent 3 days before trial expiry.
   */
  trialExpiringSoon: ({ toEmail, fullName, trialEndsAt, upgradeUrl }) => {
    const daysLeft = Math.max(
      0,
      Math.ceil((new Date(trialEndsAt) - Date.now()) / (1000 * 60 * 60 * 24))
    );
    return {
      to: toEmail,
      subject: `Ton essai AimLeads expire dans ${daysLeft} jour${daysLeft !== 1 ? 's' : ''}`,
      html: emailLayout(
        `
        ${h1(`Ton essai expire bientôt`)}
        ${p(`Bonjour ${fullName || ''},`)}
        ${p(`Ton essai AimLeads expire dans <strong>${daysLeft} jour${daysLeft !== 1 ? 's' : ''}</strong> (le ${new Date(trialEndsAt).toLocaleDateString('fr-FR')}).`)}
        ${p('Pour continuer à scorer tes leads et générer des séquences d\'outreach, passe à un abonnement payant.')}
        <div style="text-align:center;margin:32px 0;">
          ${btnPrimary(upgradeUrl || `${getAppUrl()}/billing`, 'Voir les offres')}
        </div>
        ${p('Si tu as des questions sur les tarifs, réponds à cet email.', 'font-size:13px;color:#64748b;')}
        `,
        `Ton essai expire dans ${daysLeft} jour(s)`
      ),
    };
  },

  /**
   * Sent when a payment fails.
   */
  paymentFailed: ({ toEmail, fullName, updateBillingUrl }) => ({
    to: toEmail,
    subject: 'Problème de paiement sur ton abonnement AimLeads',
    html: emailLayout(
      `
      ${h1('Problème de paiement')}
      ${p(`Bonjour ${fullName || ''},`)}
      ${p('Nous n\'avons pas pu débiter ta carte bancaire pour ton abonnement AimLeads.')}
      ${p('Pour éviter toute interruption de service, merci de mettre à jour tes informations de paiement.')}
      <div style="text-align:center;margin:32px 0;">
        ${btnPrimary(updateBillingUrl || `${getAppUrl()}/billing`, 'Mettre à jour mon paiement')}
      </div>
      ${p('Si tu penses qu\'il s\'agit d\'une erreur, contacte-nous en répondant à cet email.', 'font-size:13px;color:#64748b;')}
      `,
      'Action requise : problème de paiement'
    ),
  }),

  /**
   * Custom password reset email (complements Supabase's built-in reset).
   */
  passwordReset: ({ toEmail, resetUrl }) => ({
    to: toEmail,
    subject: 'Réinitialisation de ton mot de passe AimLeads',
    html: emailLayout(
      `
      ${h1('Réinitialise ton mot de passe')}
      ${p('Tu as demandé à réinitialiser ton mot de passe AimLeads. Clique sur le bouton ci-dessous pour en choisir un nouveau.')}
      <div style="text-align:center;margin:32px 0;">
        ${btnPrimary(resetUrl, 'Réinitialiser mon mot de passe')}
      </div>
      ${p('Ce lien expire dans 1 heure. Si tu n\'as pas demandé cette réinitialisation, ignore cet email — ton mot de passe actuel reste inchangé.', 'font-size:13px;color:#64748b;')}
      `,
      'Réinitialise ton mot de passe'
    ),
  }),
};
