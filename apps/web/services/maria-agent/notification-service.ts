/**
 * Notification Service for Maria Agent (Palmas Lake Towers)
 * Handles sending notifications for hot leads via WhatsApp and Email
 * Requirements: 12.5
 */

import type { PalmasLakeLead } from '@/types/maria-agent';

// ============================================
// Constants
// ============================================

export const NOTIFICATION_CONFIG = {
  whatsapp: '27998724593',
  email: 'arthur_keller11@hotmail.com',
  uazapiUrl: process.env.UAZAPI_URL || 'https://blackai.uazapi.com',
  uazapiToken: process.env.UAZAPI_TOKEN || '',
};

// ============================================
// Types
// ============================================

export interface NotificationResult {
  success: boolean;
  channel: 'whatsapp' | 'email';
  error?: string;
  timestamp: string;
}

export interface HotLeadNotificationData {
  leadId: string;
  leadName: string;
  leadPhone: string;
  source?: string;
  classification?: string;
  interestType?: string;
  objective?: string;
  timeline?: string;
}

// ============================================
// Message Templates
// ============================================

/**
 * Generates the hot lead notification message
 */
export function generateHotLeadMessage(data: HotLeadNotificationData): string {
  const lines = [
    '🔥 *LEAD QUENTE DETECTADO!* 🔥',
    '',
    `👤 *Nome:* ${data.leadName}`,
    `📱 *Telefone:* ${data.leadPhone}`,
  ];

  if (data.source) {
    lines.push(`📍 *Origem:* ${data.source}`);
  }

  if (data.classification) {
    lines.push(`🏷️ *Tipo:* ${data.classification}`);
  }

  if (data.interestType) {
    lines.push(`🏠 *Interesse:* ${data.interestType}`);
  }

  if (data.objective) {
    lines.push(`🎯 *Objetivo:* ${data.objective}`);
  }

  if (data.timeline) {
    lines.push(`⏰ *Prazo:* ${data.timeline}`);
  }

  lines.push('');
  lines.push('⚡ *Ação recomendada:* Entrar em contato imediatamente!');
  lines.push('');
  lines.push(`🕐 ${new Date().toLocaleString('pt-BR')}`);

  return lines.join('\n');
}

// ============================================
// WhatsApp Notification (via UAZAPI)
// ============================================

/**
 * Sends a WhatsApp notification for a hot lead
 * Requirements: 12.5 - Notificar via WhatsApp 27998724593
 */
export async function sendWhatsAppNotification(
  data: HotLeadNotificationData
): Promise<NotificationResult> {
  const message = generateHotLeadMessage(data);
  const cleanNumber = NOTIFICATION_CONFIG.whatsapp.replace(/\D/g, '');

  try {
    const response = await fetch(`${NOTIFICATION_CONFIG.uazapiUrl}/send/text`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'token': NOTIFICATION_CONFIG.uazapiToken,
      },
      body: JSON.stringify({
        number: cleanNumber,
        text: message,
        linkPreview: false,
        delay: 1000,
      }),
    });

    if (!response.ok) {
      throw new Error(`UAZAPI error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    console.log('WhatsApp notification sent:', result);

    return {
      success: true,
      channel: 'whatsapp',
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Error sending WhatsApp notification:', error);
    return {
      success: false,
      channel: 'whatsapp',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    };
  }
}

// ============================================
// Email Notification
// ============================================

/**
 * Generates HTML email content for hot lead notification
 */
export function generateHotLeadEmailHtml(data: HotLeadNotificationData): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #ff6b6b, #ee5a24); color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center; }
    .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px; }
    .field { margin: 10px 0; padding: 10px; background: white; border-radius: 4px; }
    .label { font-weight: bold; color: #666; }
    .value { color: #333; }
    .cta { background: #27ae60; color: white; padding: 15px 30px; text-decoration: none; border-radius: 4px; display: inline-block; margin-top: 20px; }
    .footer { text-align: center; margin-top: 20px; color: #999; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🔥 Lead Quente Detectado!</h1>
      <p>Palmas Lake Towers - Agente Maria</p>
    </div>
    <div class="content">
      <div class="field">
        <span class="label">👤 Nome:</span>
        <span class="value">${data.leadName}</span>
      </div>
      <div class="field">
        <span class="label">📱 Telefone:</span>
        <span class="value">${data.leadPhone}</span>
      </div>
      ${data.source ? `
      <div class="field">
        <span class="label">📍 Origem:</span>
        <span class="value">${data.source}</span>
      </div>
      ` : ''}
      ${data.classification ? `
      <div class="field">
        <span class="label">🏷️ Tipo:</span>
        <span class="value">${data.classification}</span>
      </div>
      ` : ''}
      ${data.interestType ? `
      <div class="field">
        <span class="label">🏠 Interesse:</span>
        <span class="value">${data.interestType}</span>
      </div>
      ` : ''}
      ${data.objective ? `
      <div class="field">
        <span class="label">🎯 Objetivo:</span>
        <span class="value">${data.objective}</span>
      </div>
      ` : ''}
      ${data.timeline ? `
      <div class="field">
        <span class="label">⏰ Prazo:</span>
        <span class="value">${data.timeline}</span>
      </div>
      ` : ''}
      <p style="text-align: center; margin-top: 20px;">
        <strong>⚡ Ação recomendada: Entrar em contato imediatamente!</strong>
      </p>
    </div>
    <div class="footer">
      <p>Notificação automática do Agente Maria</p>
      <p>${new Date().toLocaleString('pt-BR')}</p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Sends an email notification for a hot lead
 * Requirements: 12.5 - Notificar via email arthur_keller11@hotmail.com
 * 
 * Note: This function prepares the email data. Actual sending requires
 * an email service (e.g., SendGrid, Resend, or SMTP).
 */
export async function sendEmailNotification(
  data: HotLeadNotificationData
): Promise<NotificationResult> {
  const emailData = {
    to: NOTIFICATION_CONFIG.email,
    subject: `🔥 Lead Quente: ${data.leadName} - Palmas Lake Towers`,
    html: generateHotLeadEmailHtml(data),
    text: generateHotLeadMessage(data).replace(/\*/g, ''), // Plain text version
  };

  try {
    // For now, log the email data. In production, integrate with email service.
    console.log('Email notification prepared:', {
      to: emailData.to,
      subject: emailData.subject,
    });

    // TODO: Integrate with email service (SendGrid, Resend, etc.)
    // Example with Resend:
    // const resend = new Resend(process.env.RESEND_API_KEY);
    // await resend.emails.send({
    //   from: 'Maria Agent <maria@palmaslake.com>',
    //   to: emailData.to,
    //   subject: emailData.subject,
    //   html: emailData.html,
    // });

    return {
      success: true,
      channel: 'email',
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Error sending email notification:', error);
    return {
      success: false,
      channel: 'email',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    };
  }
}

// ============================================
// Combined Notification
// ============================================

/**
 * Sends both WhatsApp and Email notifications for a hot lead
 * Requirements: 12.5 - WHEN Maria identifica lead quente THEN Maria SHALL notificar equipe
 */
export async function notifyHotLeadComplete(
  lead: PalmasLakeLead
): Promise<{ whatsapp: NotificationResult; email: NotificationResult }> {
  const notificationData: HotLeadNotificationData = {
    leadId: lead.id,
    leadName: lead.full_name || 'Lead sem nome',
    leadPhone: lead.phone,
    source: lead.source,
    classification: lead.classification_type,
    interestType: lead.qualification_state?.interestType,
    objective: lead.qualification_state?.objective,
    timeline: lead.qualification_state?.timeline,
  };

  // Send both notifications in parallel
  const [whatsappResult, emailResult] = await Promise.all([
    sendWhatsAppNotification(notificationData),
    sendEmailNotification(notificationData),
  ]);

  return {
    whatsapp: whatsappResult,
    email: emailResult,
  };
}

/**
 * Checks if a lead should trigger hot lead notification
 */
export function shouldNotifyHotLead(lead: PalmasLakeLead): boolean {
  return lead.is_hot === true;
}
