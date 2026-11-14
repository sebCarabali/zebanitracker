import { Controller, Get, Headers, Logger, UnauthorizedException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service.js';
import { AniListService } from '../anilist/anilist.service.js';

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

  constructor(private readonly supabase: SupabaseService, private readonly anilist: AniListService) {}

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
    return { users: userIds.length, checked: rows.length, emails };
  }
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
