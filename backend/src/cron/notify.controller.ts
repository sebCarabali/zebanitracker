import { Controller, Get, Headers, Logger, UnauthorizedException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service.js';
import { AniListService } from '../anilist/anilist.service.js';
import { AiService } from '../ai/ai.service.js';
import { AiCacheService } from '../ai/ai-cache.service.js';
import { describeMonth, monthlyStats, previousMonth } from '../ai/monthly.js';

interface Row {
  id: string;
  user_id: string;
  title: string;
  anilist_id: number;
  watched_episodes: number;
  total_episodes: number | null;
  aired_episodes: number | null;
  last_notified_episode: number | null;
}

/**
 * Tarea diaria (Vercel Cron): refresca la emisión de lo que la gente está viendo y envía un correo
 * con los capítulos nuevos. Requiere CRON_SECRET, SUPABASE_SERVICE_ROLE_KEY y RESEND_API_KEY.
 */
@Controller('cron')
export class NotifyController {
  private readonly logger = new Logger(NotifyController.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly anilist: AniListService,
    private readonly ai: AiService,
    private readonly aiCache: AiCacheService,
  ) {}

  private async send(resendKey: string, to: string, subject: string, html: string) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.MAIL_FROM ?? 'ZebaniTracker <onboarding@resend.dev>', to, subject, html }),
    });
    if (!res.ok) this.logger.warn(`Resend respondió ${res.status}`);
    return res.ok;
  }

  @Get('notify')
  async notify(@Headers('authorization') auth?: string) {
    const secret = process.env.CRON_SECRET;
    if (!secret || auth !== `Bearer ${secret}`) throw new UnauthorizedException();

    const admin = this.supabase.admin();
    const resendKey = process.env.RESEND_API_KEY;
    if (!admin || !resendKey) {
      return { skipped: 'Faltan SUPABASE_SERVICE_ROLE_KEY o RESEND_API_KEY' };
    }

    const { data: profiles } = await admin.from('profiles').select('user_id').eq('notify_email', true);
    const userIds = (profiles ?? []).map((p) => p.user_id as string);
    if (!userIds.length) return { users: 0, emails: 0 };

    const { data } = await admin.from('animes')
      .select('id, user_id, title, anilist_id, watched_episodes, total_episodes, aired_episodes, last_notified_episode')
      .in('user_id', userIds).eq('status', 'watching').not('anilist_id', 'is', null)
      .in('airing_status', ['RELEASING', 'NOT_YET_RELEASED']);
    const rows = (data ?? []) as Row[];
    const media = await this.anilist.byIds(rows.map((r) => r.anilist_id));

    const digest = new Map<string, { title: string; aired: number; watched: number }[]>();
    const now = new Date().toISOString();
    for (const r of rows) {
      const m = media.get(r.anilist_id);
      if (!m) continue;
      const aired = m.aired_episodes ?? 0;
      const lastNotified = r.last_notified_episode ?? r.aired_episodes ?? 0;
      const update: Record<string, unknown> = {
        airing_status: m.airing_status, aired_episodes: m.aired_episodes, next_episode_at: m.next_episode_at,
        episodes_synced_at: now,
      };
      if (m.total_episodes !== null && m.total_episodes >= r.watched_episodes) update.total_episodes = m.total_episodes;
      if (aired > lastNotified && aired > r.watched_episodes) {
        update.last_notified_episode = aired;
        const list = digest.get(r.user_id) ?? [];
        list.push({ title: r.title, aired, watched: r.watched_episodes });
        digest.set(r.user_id, list);
      }
      await admin.from('animes').update(update).eq('id', r.id);
    }

    let emails = 0;
    const webUrl = process.env.WEB_URL ?? 'https://zebanitracker-web.vercel.app';
    for (const [userId, items] of digest) {
      const { data: u } = await admin.auth.admin.getUserById(userId);
      const to = u?.user?.email;
      if (!to) continue;
      const lines = items
        .map((i) => `<li><strong>${escapeHtml(i.title)}</strong>: salió el cap. ${i.aired} (vas en el ${i.watched})</li>`)
        .join('');
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: process.env.MAIL_FROM ?? 'ZebaniTracker <onboarding@resend.dev>',
          to,
          subject: items.length === 1 ? `Nuevo capítulo de ${items[0].title}` : `${items.length} animes tienen capítulo nuevo`,
          html: `<p>¡Hay capítulos nuevos de lo que estás viendo!</p><ul>${lines}</ul>
                 <p><a href="${webUrl}/calendar">Ver mi calendario</a> · <a href="${webUrl}/settings">Dejar de recibir estos correos</a></p>`,
        }),
      });
      if (res.ok) emails++;
      else this.logger.warn(`Resend respondió ${res.status} para ${userId}`);
    }
    const stale = await this.staleReminders(admin, resendKey, userIds, webUrl).catch((e) => {
      this.logger.warn(`Recordatorios: ${(e as Error).message}`);
      return 0;
    });
    const monthly = new Date().getUTCDate() === 1
      ? await this.monthlySummaries(admin, resendKey, userIds, webUrl).catch((e) => {
        this.logger.warn(`Resumen mensual: ${(e as Error).message}`);
        return 0;
      })
      : 0;
    return { users: userIds.length, checked: rows.length, emails, stale_reminders: stale, monthly_summaries: monthly };
  }

  /** "¿Lo retomas o lo dejas?": series en "viendo" sin avance hace N semanas (como mucho un aviso cada N semanas). */
  private async staleReminders(admin: NonNullable<ReturnType<SupabaseService['admin']>>, resendKey: string, userIds: string[], webUrl: string) {
    const { data: profs } = await admin.from('profiles').select('user_id, stale_weeks').in('user_id', userIds);
    let sent = 0;
    for (const p of (profs ?? []) as { user_id: string; stale_weeks: number }[]) {
      const limit = new Date(Date.now() - p.stale_weeks * 7 * 86_400_000).toISOString();
      const nowIso = new Date().toISOString();
      const { data } = await admin.from('animes')
        .select('id, title, watched_episodes, total_episodes, last_watched_at, updated_at, reminder_snoozed_until, last_reminded_at')
        .eq('user_id', p.user_id).eq('status', 'watching')
        .or(`last_watched_at.lt.${limit},and(last_watched_at.is.null,updated_at.lt.${limit})`)
        .or(`reminder_snoozed_until.is.null,reminder_snoozed_until.lt.${nowIso}`)
        .or(`last_reminded_at.is.null,last_reminded_at.lt.${limit}`)
        .limit(5);
      const items = (data ?? []) as { id: string; title: string; watched_episodes: number; total_episodes: number | null }[];
      if (!items.length) continue;
      const { data: u } = await admin.auth.admin.getUserById(p.user_id);
      const to = u?.user?.email;
      if (!to) continue;
      const rowsHtml = items.map((i) => `<li style="margin-bottom:10px"><strong>${escapeHtml(i.title)}</strong> — vas en el cap. ${i.watched_episodes}${i.total_episodes ? ` de ${i.total_episodes}` : ''}<br>
        <a href="${webUrl}/animes/${i.id}?stale=resume">▶ Lo retomo</a> &nbsp;·&nbsp; <a href="${webUrl}/animes/${i.id}?stale=drop">✕ Lo dejo</a></li>`).join('');
      const ok = await this.send(resendKey, to,
        items.length === 1 ? `¿Retomas ${items[0].title} o lo dejas?` : `${items.length} series te esperan: ¿las retomas o las dejas?`,
        `<p>Hace más de ${p.stale_weeks} semanas que no avanzas estas series:</p><ul>${rowsHtml}</ul>
         <p style="color:#666;font-size:13px">Puedes cambiar cada cuántas semanas preguntamos en <a href="${webUrl}/settings">Ajustes</a>.</p>`);
      if (ok) {
        sent++;
        await admin.from('animes').update({ last_reminded_at: nowIso }).in('id', items.map((i) => i.id));
      }
    }
    return sent;
  }

  /** El día 1: resumen del mes anterior (cifras reales + texto de IA). */
  private async monthlySummaries(admin: NonNullable<ReturnType<SupabaseService['admin']>>, resendKey: string, userIds: string[], webUrl: string) {
    const now = new Date();
    const month = previousMonth(`${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`);
    const { data: profs } = await admin.from('profiles').select('user_id, language').in('user_id', userIds);
    let sent = 0;
    for (const p of ((profs ?? []) as { user_id: string; language: string }[]).slice(0, 100)) {
      const stats = await monthlyStats(admin, month, { userId: p.user_id });
      if (!stats.episodes) continue;
      const key = `monthly:${p.user_id}:${month}:${p.language}:final`;
      const { value } = await this.aiCache.get(key, 365 * 86_400_000, () =>
        this.ai.monthly(undefined, { lang: p.language, month, stats: describeMonth(stats) }).catch(() => null));
      const { data: u } = await admin.auth.admin.getUserById(p.user_id);
      const to = u?.user?.email;
      if (!to) continue;
      const facts = (value?.fun_facts ?? []).map((f) => `<li>${escapeHtml(f)}</li>`).join('');
      const ok = await this.send(resendKey, to, value?.headline ?? `Tu resumen de ${month}`,
        `<h2>${escapeHtml(value?.headline ?? `Tu ${month} en anime`)}</h2>
         <p>${escapeHtml(value?.summary ?? `Viste ${stats.episodes} capítulos de ${stats.titles} títulos.`)}</p>
         ${facts ? `<ul>${facts}</ul>` : ''}
         <p><strong>${stats.episodes}</strong> capítulos · <strong>${Math.round(stats.minutes / 60)} h</strong> · racha de <strong>${stats.longest_streak}</strong> días</p>
         <p><a href="${webUrl}/stats?month=${month}">Ver mi resumen completo</a> · <a href="${webUrl}/settings">Dejar de recibir correos</a></p>`);
      if (ok) sent++;
    }
    return sent;
  }
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
