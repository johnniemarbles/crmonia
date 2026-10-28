// Shows the PII screens from the server inside Gmail, in a frame. The extension only brings the frame, a short-lived token and a few
// Gmail actions (compose, country switch, sign-in, navigation); everything inside the frame is the server's page, so UI changes ship
// with each server release and need no extension update.
import type { ComposeApi, RegionChoice } from './types';

export interface EmbedOptions {
  base: string;
  extVersion: string;
  route: { page: string; id?: string };
  regions: RegionChoice[];
  region?: string;
  /** Asks the server for a token through the extension's normal checks (including the right-Gmail-account check). */
  getToken(): Promise<{ status: number; json: any }>;
  onSignIn(region?: string, keep?: boolean, opts?: { fresh?: boolean }): void;
  navigate(page: string, id?: string): void;
  switchRegion(region: string): void;
  /** Sends one email through a real Gmail compose window (mail merge, invitations). */
  compose: ComposeApi['send'];
  /** An API call for another country's server, made with that country's sign-in (head-office views). */
  relay(method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', path: string, body: unknown, region: string): Promise<{ status: number; json: any }>;
  /** The frame did not say it was ready in time (server down, blocked, or an old server without the embed page). */
  onFail(): void;
}

/** How long the server's page has to say it is ready before the built-in copy is shown instead. */
export const READY_TIMEOUT_MS = 15_000;

export function mountEmbedded(host: HTMLElement, o: EmbedOptions): () => void {
  const loader = document.createElement('div');
  loader.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#fff;z-index:10;transition:opacity 0.25s;pointer-events:none;gap:12px;font:13.5px/1.4 system-ui,sans-serif;color:#6b7280';
  loader.innerHTML = `
    <div style="width:30px;height:30px;border:3px solid #e0e7ff;border-top-color:#6355F6;border-radius:50%;animation:pii-spin 0.75s linear infinite"></div>
    <span>Loading PII…</span>
    <style>@keyframes pii-spin{to{transform:rotate(360deg)}}</style>
  `;
  host.append(loader);

  const f = document.createElement('iframe');
  f.style.cssText = 'border:0;width:100%;height:100%;display:block;background:#fff';
  f.title = 'CRMONIA Copilot';
  // Lets CRMONIA use the microphone for voice. Only the CRMONIA site in this frame can ask; Chrome
  // still asks the person once. Mail pages get nothing new.
  f.allow = 'microphone';
  const embedPath = o.route?.page ? `/embed/${o.route.page}` : '/embed/crm';
  f.src = `${o.base}${embedPath}?embed=1`;
  host.append(f);
  const post = (m: Record<string, unknown>) => f.contentWindow?.postMessage(m, o.base);
  const tok = async () => {
    const r = await o.getToken();
    return r.status === 200 && typeof r.json?.token === 'string' ? { token: r.json.token as string } : { error: { status: r.status, json: r.json } };
  };
  let waiting = false;
  let ready = false;
  const failTimer = setTimeout(() => { if (!ready) o.onFail(); }, READY_TIMEOUT_MS);
  const onMsg = async (e: MessageEvent) => {
    if (e.source !== f.contentWindow || e.origin !== o.base || !e.data) return;
    const action = e.data.crmonia || e.data.expadio || e.data.pii;
    if (typeof action !== 'string') return;
    const d = e.data as { pii?: string; crmonia?: string; expadio?: string; region?: unknown; keep?: boolean; fresh?: boolean; page?: unknown; id?: unknown; reqId?: unknown; method?: unknown; path?: unknown; body?: unknown; to?: unknown; subject?: unknown; html?: unknown; review?: unknown };
    if (action === 'ready') {
      ready = true; clearTimeout(failTimer);
      loader.style.opacity = '0';
      setTimeout(() => { try { loader.remove(); } catch { /* ignore */ } }, 260);
      const t = await tok(); waiting = !('token' in t);
      post({ pii: 'init', extVersion: o.extVersion, route: o.route, regions: o.regions, region: o.region, compose: true, ...t });
    } else if (d.pii === 'need-token') { const t = await tok(); waiting = !('token' in t); post({ pii: 'token', ...t }); }
    else if (d.pii === 'signin') o.onSignIn(typeof d.region === 'string' ? d.region : undefined, d.keep === true, { fresh: d.fresh === true });
    else if (d.pii === 'navigate' && typeof d.page === 'string') o.navigate(d.page, typeof d.id === 'string' ? d.id : undefined);
    else if (d.pii === 'region' && typeof d.region === 'string' && o.regions.some((r) => r.id === d.region)) o.switchRegion(d.region);
    else if (d.pii === 'api' && typeof d.reqId === 'string' && typeof d.path === 'string' && d.path.startsWith('/v1/') && typeof d.region === 'string' && o.regions.some((r) => r.id === d.region)
      && (d.method === 'GET' || d.method === 'POST' || d.method === 'PATCH' || d.method === 'PUT' || d.method === 'DELETE')) {
      const reqId = d.reqId;
      const r = await o.relay(d.method, d.path, d.body, d.region).catch(() => ({ status: 0, json: null }));
      post({ pii: 'api-result', reqId, status: r.status, json: r.json }); // to the frame only, never to Gmail's page
    }
    else if (d.pii === 'compose' && typeof d.reqId === 'string' && typeof d.to === 'string' && typeof d.subject === 'string' && typeof d.html === 'string') {
      const reqId = d.reqId;
      let result: Awaited<ReturnType<ComposeApi['send']>>;
      try { result = await o.compose({ to: d.to, subject: d.subject, html: d.html, review: d.review === true }); }
      catch (err) { result = { ok: false, error: (err as Error)?.message ?? 'Gmail could not send' }; }
      post({ pii: 'compose-result', reqId, result });
    }
  };
  // Back from signing in: hand over a token so the frame can continue.
  const onFocus = async () => { if (waiting) { const t = await tok(); waiting = !('token' in t); if ('token' in t) post({ pii: 'token', ...t }); } };
  window.addEventListener('message', onMsg);
  window.addEventListener('focus', onFocus);
  return () => { clearTimeout(failTimer); window.removeEventListener('message', onMsg); window.removeEventListener('focus', onFocus); try { loader.remove(); } catch { /* ignore */ } f.remove(); };
}
