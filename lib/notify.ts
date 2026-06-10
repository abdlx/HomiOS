/**
 * Team notification dispatcher — Coolify's 6 channels, translated.
 *
 * Channel configs live in notification_settings (per team, JSON config):
 *   email    { smtpHost, smtpPort, smtpUser, smtpPass, from, to }
 *   discord  { webhookUrl }
 *   slack    { webhookUrl }
 *   telegram { botToken, chatId }
 *   pushover { token, userKey }
 *   webhook  { url, secret? }
 *
 * notifyTeam() never throws — a failing channel must not break deployments.
 */
import { getDb } from './db.ts';
import { logAudit } from './audit.ts';

export type NotifyEvent =
  | 'deploy.success' | 'deploy.failed'
  | 'backup.success' | 'backup.failed'
  | 'server.unreachable' | 'server.recovered'
  | 'task.failed' | 'health.unhealthy' | 'test';

const EVENT_TITLES: Record<NotifyEvent, string> = {
  'deploy.success': '✅ Deployment successful',
  'deploy.failed': '❌ Deployment failed',
  'backup.success': '✅ Backup completed',
  'backup.failed': '❌ Backup failed',
  'server.unreachable': '🔴 Server unreachable',
  'server.recovered': '🟢 Server recovered',
  'task.failed': '⚠️ Scheduled task failed',
  'health.unhealthy': '🟠 Health check failing',
  'test': '🔔 Test notification',
};

export async function notifyTeam(teamId: string, event: NotifyEvent, message: string): Promise<void> {
  let channels: any[] = [];
  try {
    channels = getDb().prepare(
      'SELECT channel, config FROM notification_settings WHERE team_id = ? AND enabled = 1'
    ).all(teamId);
  } catch { return; }

  const title = EVENT_TITLES[event] || event;
  await Promise.allSettled(channels.map(async (ch) => {
    const config = JSON.parse(ch.config || '{}');
    try {
      switch (ch.channel) {
        case 'discord': return sendDiscord(config, title, message);
        case 'slack': return sendSlack(config, title, message);
        case 'telegram': return sendTelegram(config, title, message);
        case 'pushover': return sendPushover(config, title, message);
        case 'webhook': return sendWebhook(config, event, title, message);
        case 'email': return sendEmail(config, title, message);
      }
    } catch (e: any) {
      logAudit({ teamId, action: 'notify.channel_failed', meta: { channel: ch.channel, error: e.message } });
    }
  }));
}

async function sendDiscord(cfg: any, title: string, message: string) {
  if (!cfg.webhookUrl) return;
  await fetch(cfg.webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ embeds: [{ title, description: message.slice(0, 4000), color: title.startsWith('✅') ? 0x22c55e : 0xef4444 }] }),
  });
}

async function sendSlack(cfg: any, title: string, message: string) {
  if (!cfg.webhookUrl) return;
  await fetch(cfg.webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: `*${title}*\n${message}` }),
  });
}

async function sendTelegram(cfg: any, title: string, message: string) {
  if (!cfg.botToken || !cfg.chatId) return;
  await fetch(`https://api.telegram.org/bot${cfg.botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: cfg.chatId, text: `${title}\n${message}` }),
  });
}

async function sendPushover(cfg: any, title: string, message: string) {
  if (!cfg.token || !cfg.userKey) return;
  await fetch('https://api.pushover.net/1/messages.json', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: cfg.token, user: cfg.userKey, title, message }),
  });
}

async function sendWebhook(cfg: any, event: string, title: string, message: string) {
  if (!cfg.url) return;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (cfg.secret) headers['X-OpenFinder-Secret'] = cfg.secret;
  await fetch(cfg.url, {
    method: 'POST', headers,
    body: JSON.stringify({ event, title, message, timestamp: new Date().toISOString() }),
  });
}

async function sendEmail(cfg: any, title: string, message: string) {
  if (!cfg.smtpHost || !cfg.to) return;
  const nodemailer = await import('nodemailer');
  const transport = nodemailer.createTransport({
    host: cfg.smtpHost,
    port: Number(cfg.smtpPort) || 587,
    secure: Number(cfg.smtpPort) === 465,
    auth: cfg.smtpUser ? { user: cfg.smtpUser, pass: cfg.smtpPass } : undefined,
  });
  await transport.sendMail({
    from: cfg.from || cfg.smtpUser,
    to: cfg.to,
    subject: `[OpenFinder] ${title}`,
    text: message,
  });
}
