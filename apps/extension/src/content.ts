import * as InboxSDK from '@inboxsdk/core';
import { mountSidebar, type CapturedMessage } from './sidebar';
import { mountHeader } from './header';
import { mountEmbedded } from './embed';
import type { ComposeApi, Transport } from './types';

const REGION_LABELS: Record<string, string> = { ca: 'Canada', us: 'United States' };
const REGION_CHOICES = Object.keys(__REGIONS__).map((id) => ({ id, label: REGION_LABELS[id] ?? id }));
let chosenRegion: string | undefined;
// The country is remembered per Gmail account on this computer (chrome.storage.local, regionByAccount): two people, or a head
// office and a partner account, in one Chrome no longer share it. The background worker saves it once a sign-in has worked.
let gmailAccount = '';
// The country changed (here or in another Gmail tab): every PII screen on this page starts over in place, no Gmail reload.
const announceRegion = () => { try { window.dispatchEvent(new CustomEvent('pii-region-changed')); window.dispatchEvent(new CustomEvent('pii-settings-changed')); } catch { /* ignore */ } };
const DEFAULT_REGION = Object.keys(__REGIONS__)[0];
const regionFor = async (account: string): Promise<string | undefined> => {
  const [local, sync] = await Promise.all([chrome.storage.local.get('regionByAccount'), chrome.storage.sync.get('region')]);
  const map = (local.regionByAccount ?? {}) as Record<string, string>;
  const mine = map[account];
  if (mine && __REGIONS__[mine]) return mine;
  // Before 1.7.0 one country was kept for the whole browser; it still counts until this account has its own.
  return typeof sync.region === 'string' && __REGIONS__[sync.region] ? sync.region : DEFAULT_REGION;
};
chrome.storage.onChanged.addListener((ch: Record<string, { newValue?: unknown; oldValue?: unknown }>, area: string) => {
  if (area !== 'local') return;
  if (ch.regionByAccount && gmailAccount) {
    const next = (ch.regionByAccount.newValue as Record<string, string> | undefined)?.[gmailAccount];
    if (next && __REGIONS__[next] && next !== chosenRegion) { chosenRegion = next; whoCache.clear(); announceRegion(); return; }
  }
  // A sign-in just worked (in the tab the background worker opened): show it now rather than at the next minute's check.
  if (ch.signedInAt) { whoCache.clear(); announceRegion(); }
});
// PII's full-page screens come from the server, in a frame, so they update with every server release (no store update).
// The copy built into this extension is the fallback: used when the frame cannot load, or when the person turns it on in Options.
let bundledUi = false;
chrome.storage.sync.get('bundledUi').then((v: { bundledUi?: unknown }) => { bundledUi = v.bundledUi === true; }, () => undefined);

const rawTransport: Transport = async (method, path, body, region) => {
  try {
    const r = (await chrome.runtime.sendMessage({ type: 'pii:api', method, path, body, region: region ?? chosenRegion })) as { status: number; json: any } | undefined;
    return r ?? { status: -1, json: null };
  } catch {
    // The extension was reloaded or updated while this Gmail tab stayed open.
    return { status: -1, json: null };
  }
};

// The PII sign-in belongs to the browser, not to one Gmail tab. With several Google accounts open, the Gmail on screen
// can be a different person from the one signed in to PII. Until the two match, nothing is shown or sent.
const wrong = (pii: string) => ({ status: 409, json: { error: { code: 'wrong_account', message: `This Gmail is ${gmailAccount}, but PII is signed in as ${pii}.` }, piiEmail: pii, gmailEmail: gmailAccount } });
// Tell PII this copy is installed and signed in (at most every 12 hours per country). The server records the first install on the partner's case.
const checkedIn = new Map<string, number>();
const checkInOnce = (region?: string) => {
  const key = region ?? '';
  if (Date.now() - (checkedIn.get(key) ?? 0) < 12 * 3600_000) return;
  checkedIn.set(key, Date.now());
  void rawTransport('POST', '/v1/extension/check-in', { extensionId: chrome.runtime.id, version: chrome.runtime.getManifest().version }, region).then((r) => {
    if (r.status !== 204 && r.status !== 200) checkedIn.delete(key); // try again next time if the server refused it
  });
};
const whoCache = new Map<string, { at: number; email: Promise<string | null> }>();
const piiEmailFor = (region?: string): Promise<string | null> => {
  const key = region ?? '';
  const hit = whoCache.get(key);
  if (hit && Date.now() - hit.at < 15_000) return hit.email;
  const email = rawTransport('GET', '/v1/me', undefined, region).then((r) => {
    const who = r.status === 200 && typeof r.json?.user?.email === 'string' ? (r.json.user.email as string).toLowerCase() : null;
    if (who) checkInOnce(region);
    return who;
  });
  whoCache.set(key, { at: Date.now(), email });
  return email;
};
const transport: Transport = async (method, path, body, region) => {
  if (!gmailAccount || !path.startsWith('/v1/')) return rawTransport(method, path, body, region);
  const who = await piiEmailFor(region);
  if (who && who !== gmailAccount) return wrong(who);
  return rawTransport(method, path, body, region);
};
const signIn = (region?: string, keep?: boolean, opts?: { fresh?: boolean }) => { whoCache.clear(); void chrome.runtime.sendMessage({ type: 'pii:signin', region: region ?? chosenRegion, keep, hint: gmailAccount || undefined, fresh: opts?.fresh }); };
const switchRegion = (id: string) => {
  chosenRegion = id; whoCache.clear(); announceRegion();
  if (gmailAccount) void chrome.storage.local.get('regionByAccount').then((v: { regionByAccount?: Record<string, string> }) => chrome.storage.local.set({ regionByAccount: { ...(v.regionByAccount ?? {}), [gmailAccount]: id } }));
};
// The server the frame loads from: the same rule the background worker uses for API calls, so the frame and its token always match.
const frameBase = async (region?: string): Promise<string> => {
  try {
    const r = (await chrome.runtime.sendMessage({ type: 'pii:base', region })) as { base?: string } | undefined;
    if (r?.base) return r.base;
  } catch { /* extension reloaded; fall through */ }
  return (__REGIONS__[region ?? ''] ?? __API_BASE__).replace(/\/+$/, '');
};


// Sending for mail merge: open a normal Gmail compose window, fill it in, press Send, and wait to hear how it went.
const sendOne = (sdk: any): ComposeApi['send'] => async ({ to, subject, html, review }) => {
  let cv: Awaited<ReturnType<typeof sdk.Compose.openNewComposeView>>;
  try { cv = await sdk.Compose.openNewComposeView(); } catch { return { ok: false, error: 'Could not open a Gmail compose window' }; }
  return new Promise((resolve) => {
    type R = { ok: boolean; threadId?: string; error?: string; unconfirmed?: boolean };
    let done = false, clicked = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (r: R) => { if (done) return; done = true; clearTimeout(timer); resolve(r); };
    // One timer at a time. Before Gmail accepts the click a stall is a failure; after it, Gmail has the message,
    // and when it never announces "sent" (undo-send delay, a slow page) the message is reported as handed over, not lost.
    const arm = (ms: number, r: R, closeWindow = false) => { clearTimeout(timer); timer = setTimeout(() => { finish(r); if (closeWindow) { try { cv.close(); } catch { /* already closed */ } } }, ms); };
    // Review mode leaves the window open for the person to read and press Send; they get ten minutes.
    if (review) arm(10 * 60_000, { ok: false, error: 'The email was not sent from the Gmail window' });
    else arm(30_000, { ok: false, error: 'Gmail did not start sending. Close any open drafts and try again.' }, true);
    cv.on('presending', () => { clicked = true; });
    cv.on('sending', () => { clicked = true; arm(45_000, { ok: true, unconfirmed: true }); });
    cv.on('sent', (e) => { void e.getThreadID().then((threadId) => finish({ ok: true, threadId }), () => finish({ ok: true })); });
    cv.on('sendCanceled', () => finish({ ok: false, error: 'Gmail canceled the send' }));
    cv.on('destroy', () => {
      if (clicked) arm(45_000, { ok: true, unconfirmed: true }); // the window closes as Gmail takes the message
      else setTimeout(() => finish({ ok: false, error: 'The compose window was closed before sending' }), 1500);
    });
    try {
      cv.setToRecipients([to]);
      cv.setSubject(subject);
      cv.setBodyHTML(html);
      if (!review) setTimeout(() => { try { clicked = true; cv.send(); } catch (e) { clicked = false; finish({ ok: false, error: (e as Error).message }); } }, 600);
    } catch (e) { finish({ ok: false, error: (e as Error).message }); }
  });
};

interface Snippet { id: string; name: string; body: string; shared: boolean }

// Gmail page side. Reads only what is on screen for the open conversation, and only sends it after the person accepts the notice.
console.info('[PII] content script running');
InboxSDK.load(2, __INBOXSDK_APP_ID__).then((sdk) => {
  console.info('[PII] InboxSDK loaded');
  try { gmailAccount = (sdk.User.getEmailAddress() || '').trim().toLowerCase(); } catch { gmailAccount = ''; }
  return regionFor(gmailAccount).then((r) => { chosenRegion = r; return sdk; }, () => { chosenRegion = DEFAULT_REGION; return sdk; });
}).then((sdk) => {
  // Full-page views: every item in the PII section of Gmail's left panel opens a page in place of the mailbox.
  const goto = (page: string, id?: string) => {
    if (id) sdk.Router.goto('pii/:page/:id', { page, id });
    else sdk.Router.goto('pii/:page', { page });
  };
  const mountRoute = (view: { getElement(): HTMLElement; getParams(): Record<string, string>; on(ev: 'destroy', fn: () => void): unknown; setFullWidth?(fw: boolean): void }) => {
    try { (view as any).setFullWidth?.(true); } catch { /* ignore */ }
    const params = view.getParams();
    const host = document.createElement('div');
    host.style.cssText = 'height:calc(100vh - 120px);min-height:480px;background:#fff;position:relative;width:100%;display:flex;flex-direction:column;overflow:hidden';
    view.getElement().appendChild(host);
    const route = { page: params.page ?? 'crm', id: params.id };
    const fallbackUi = () => {
      host.innerHTML = `
        <div style="padding:48px 24px;text-align:center;font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#64748b;">
          <h3 style="font-size:18px;color:#1e293b;margin-bottom:8px;">CRMONIA Copilot</h3>
          <p style="font-size:14px;max-width:380px;margin:0 auto 16px;">Unable to connect to live workspace iframe. Verify session or retry.</p>
          <button id="crmonia-retry-btn" style="padding:8px 16px;background:#4f46e5;color:#fff;border:none;border-radius:6px;font-weight:500;cursor:pointer;">Retry Connection</button>
        </div>
      `;
      const btn = host.querySelector('#crmonia-retry-btn');
      if (btn) btn.addEventListener('click', () => { void start(); });
      return () => { host.innerHTML = ''; };
    };
    let unmount: () => void = () => undefined;
    let gone = false;
    const start = async () => {
      unmount();
      if (bundledUi) { unmount = fallbackUi(); return; }
      const base = await frameBase(chosenRegion);
      if (gone) return;
      unmount = mountEmbedded(host, {
        base, extVersion: chrome.runtime.getManifest().version, route, regions: REGION_CHOICES, region: chosenRegion,
        getToken: () => transport('POST', '/v1/embed-token', undefined, chosenRegion), onSignIn: signIn, navigate: goto,
        switchRegion, compose: sendOne(sdk), relay: (method, path, body, region) => transport(method, path, body, region),
        // The server's screens did not answer: show the fallback status screen instead.
        onFail: () => { if (gone) return; console.warn('[CRMONIA] server screens did not load; using fallback'); unmount(); unmount = fallbackUi(); },
      });
    };
    void start();
    // The country changed (here or in another tab): load that country's screens.
    const onRegion = () => { if (!bundledUi) void start(); };
    window.addEventListener('pii-region-changed', onRegion);
    const stop = () => { gone = true; window.removeEventListener('pii-region-changed', onRegion); unmount(); };
    view.on('destroy', stop);
  };
  sdk.Router.handleCustomRoute('crmonia/:page', mountRoute);
  sdk.Router.handleCustomRoute('crmonia/:page/:id', mountRoute);
  sdk.Router.handleCustomRoute('pii/:page', mountRoute);
  sdk.Router.handleCustomRoute('pii/:page/:id', mountRoute);

  // The PII mark and the bell in Gmail's top bar, next to the account area. If Gmail's layout changes and the spot is not found, they float top right instead.
  const hostEl = document.createElement('div');
  hostEl.id = 'pii-header';
  mountHeader(hostEl, { extVersion: chrome.runtime.getManifest().version, transport, onSignIn: signIn, regions: REGION_CHOICES, get region() { return chosenRegion; }, switchRegion, navigate: goto }, chrome.runtime.getURL('nav-icon.png'));
  const place = () => {
    const acct = document.querySelector('header[role="banner"] a[aria-label*="Google Account"], header[role="banner"] [aria-label*="Google Account"]');
    let anchor: HTMLElement | null = acct as HTMLElement | null;
    while (anchor && anchor.parentElement && anchor.parentElement.tagName !== 'HEADER' && anchor.parentElement.children.length < 3) anchor = anchor.parentElement;
    const parent = anchor?.parentElement;
    if (anchor && parent && parent.tagName !== 'BODY') {
      hostEl.style.cssText = 'display:inline-flex;align-items:center;margin-right:4px';
      if (hostEl.parentElement !== parent || hostEl.nextElementSibling !== anchor) parent.insertBefore(hostEl, anchor);
    } else if (hostEl.parentElement !== document.body) {
      hostEl.style.cssText = 'position:fixed;top:10px;right:210px;z-index:1000;background:#fff;border-radius:22px;box-shadow:0 1px 4px rgba(10,31,92,.25)';
      document.body.appendChild(hostEl);
    }
  };
  place();
  let placeTimer: ReturnType<typeof setTimeout> | undefined;
  new MutationObserver(() => { if (placeTimer) return; placeTimer = setTimeout(() => { placeTimer = undefined; if (!hostEl.isConnected || hostEl.style.position === 'fixed') place(); }, 500); }).observe(document.body, { childList: true, subtree: true });

  // The left panel is drawn from the person's own layout (Settings > Left panel), limited to what they can use, with live counts.
  interface NavData { items: { id: string; name: string; count: number }[]; pipelines: { id: string; name: string; count: number; views?: { id: string; name: string }[] }[] }
  let section: { remove(): void } | null = null;
  let navSig = '';
  const icon = chrome.runtime.getURL('nav-icon.png');
  const withCount = (name: string, n: number) => (n > 0 ? `${name} (${n})` : name);
  const BUILTIN_ICONS: Record<string, string> = {
    home: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="#5f6368" d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>',
    calendar: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="#5f6368" d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2zm-7 5h5v5h-5v-5z"/></svg>',
    pipelines: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="#5f6368" d="M4 5h4v14H4V5zm6 0h4v9h-4V5zm6 0h4v6h-4V5z"/></svg>',
    renewals: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="#5f6368" d="M12 6V3L8 7l4 4V8c2.76 0 5 2.24 5 5 0 .8-.2 1.56-.54 2.23l1.46 1.46A6.96 6.96 0 0 0 19 13c0-3.87-3.13-7-7-7zm-5.92 1.31A6.96 6.96 0 0 0 5 13c0 3.87 3.13 7 7 7v3l4-4-4-4v3c-2.76 0-5-2.24-5-5 0-.8.2-1.56.54-2.23L6.08 7.31z"/></svg>',
    commercial: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="#5f6368" d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z"/></svg>',
    compliance: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="#5f6368" d="M12 1 3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/></svg>',
    contacts: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="#5f6368" d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-8 2.75c1.24 0 2.25 1.01 2.25 2.25s-1.01 2.25-2.25 2.25S9.75 10.24 9.75 9 10.76 6.75 12 6.75zM17 17H7v-1.5c0-1.67 3.33-2.5 5-2.5s5 .83 5 2.5V17z"/></svg>',
    families: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="#5f6368" d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>',
    training: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="#5f6368" d="M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82zM12 3L1 9l11 6 9-4.91V17h2V9L12 3z"/></svg>',
    merges: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="#5f6368" d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>',
    settings: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="#5f6368" d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>',
    view: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="#5f6368" d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z"/></svg>',
    partners: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="#5f6368" d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>',
    clientfiles: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="#5f6368" d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>',
  };
  const svg = (n: string) => {
    const raw: string = BUILTIN_ICONS[n] ?? BUILTIN_ICONS.view ?? '';
    return `data:image/svg+xml;utf8,${encodeURIComponent(raw)}`;
  };
  const drawNav = async () => {
    // The version tells the server this copy has the Families icon (from 1.6.0); older copies never get that item.
    const r = await transport('GET', `/v1/nav?v=${encodeURIComponent(chrome.runtime.getManifest().version)}`);
    const sig = JSON.stringify(r.status === 200 ? r.json : r.status);
    if (sig === navSig && section) return;
    navSig = sig;
    section?.remove();
    // A normal link item (the kind that worked before) with the pages nested under it, each with a Google Material icon.
    const top = sdk.NavMenu.addNavItem({ name: 'PII', iconUrl: icon, routeID: 'pii/:page', routeParams: { page: 'home' }, orderHint: 5 });
    section = top;
    const fallback: NavData = { items: [['home', 'Home'], ['calendar', 'Calendar'], ['notifications', 'Notifications'], ['pipelines', 'Pipelines'], ['contacts', 'Contacts'], ['settings', 'Settings']].map(([id, name]) => ({ id: id!, name: name!, count: 0 })), pipelines: [] };
    const nav = r.status === 200 && Array.isArray(r.json?.items) ? (r.json as NavData) : fallback;
    // Each item is added on its own, so one that fails never takes the rest of the menu with it. Two levels only (page > pipeline).
    nav.items.filter((it) => it.id !== 'notifications').forEach((it, i) => { // notifications live in the bell in Gmail's top bar
      try {
        const child = top.addNavItem({ name: withCount(it.name, it.count), iconUrl: svg(it.id), routeID: 'pii/:page', routeParams: { page: it.id }, orderHint: i });
        if (it.id === 'pipelines') {
          (nav.pipelines ?? []).forEach((p, j) => {
            try { child.addNavItem({ name: p.count > 0 ? `${p.name}  ⚠ ${p.count}` : p.name, iconUrl: svg('view'), routeID: 'pii/:page/:id', routeParams: { page: 'pipelines', id: p.id }, orderHint: j }); } catch (e) { console.warn('[PII] pipeline item failed', e); }
          });
        }
      } catch (e) { console.warn('[PII] nav item failed', it.id, e); }
    });
  };
  const redraw = () => { void drawNav().catch((e) => console.warn('[PII] left panel failed', e)); };
  redraw();
  setInterval(redraw, 5 * 60_000);
  let redrawTimer: ReturnType<typeof setTimeout> | undefined;
  window.addEventListener('pii-settings-changed', () => { clearTimeout(redrawTimer); redrawTimer = setTimeout(redraw, 400); });

  // Whether the Snippets button shows is a setting; read it at most once a minute.
  let snippetsOn = true;
  let snippetsAt = 0;
  const snippetsEnabled = async () => {
    if (Date.now() - snippetsAt > 60_000) {
      snippetsAt = Date.now();
      const r = await transport('GET', '/v1/settings');
      if (r.status === 200) snippetsOn = r.json?.settings?.['email.snippetsButton']?.value !== false;
    }
    return snippetsOn;
  };
  // Snippets: a button in every compose window that drops a saved reply in, filled in for the person being written to.
  sdk.Compose.registerComposeViewHandler(async (composeView) => {
    if (!(await snippetsEnabled())) return;
    composeView.addButton({
      title: 'PII snippets',
      iconUrl: chrome.runtime.getURL('nav-icon.png'),
      hasDropdown: true,
      orderHint: 10,
      onClick: (ev) => {
        const dd = ev.dropdown; if (!dd) return;
        const box = dd.el;
        const dark = typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
        box.style.cssText = `font:13px system-ui,sans-serif;padding:6px;min-width:260px;max-height:340px;overflow:auto;background:${dark ? '#1f2937' : '#fff'};color:${dark ? '#f9fafb' : '#1f2937'};box-shadow:0 4px 16px rgba(0,0,0,0.15);border-radius:8px`;
        box.innerHTML = `<div style="padding:12px;color:${dark ? '#9ca3af' : '#6b7280'};font-size:13px">Loading snippets…</div>`;
        void transport('GET', '/v1/snippets').then((r) => {
          box.textContent = '';
          const list = (r.json?.snippets ?? []) as Snippet[];
          if (r.status !== 200 || list.length === 0) {
            const msg = r.status === 401 ? 'Sign in to PII to use snippets.' : r.status === 200 ? 'No snippets yet. Add some in PII → More → Snippets.' : 'Could not load snippets.';
            box.innerHTML = `<div style="padding:12px;color:${dark ? '#9ca3af' : '#6b7280'};font-size:13px">${msg}</div>`;
            return;
          }
          for (const s of list) {
            const b = document.createElement('button');
            b.style.cssText = `display:flex;align-items:center;justify-content:space-between;width:100%;text-align:left;border:0;background:none;padding:8px 10px;cursor:pointer;border-radius:6px;font:inherit;color:inherit;transition:background .12s`;
            b.onmouseenter = () => { b.style.background = dark ? '#374151' : '#eef2ff'; };
            b.onmouseleave = () => { b.style.background = 'none'; };
            b.innerHTML = `<span style="font-weight:500">${s.name}</span>${s.shared ? `<span style="font-size:10px;padding:2px 6px;border-radius:10px;background:${dark ? '#3730a3' : '#eef2ff'};color:${dark ? '#c7d2fe' : '#4338ca'};font-weight:600">team</span>` : ''}`;
            b.onclick = () => {
              const first = composeView.getToRecipients()[0];
              void transport('POST', `/v1/snippets/${s.id}/render`, { toName: first?.name ?? '', toEmail: first?.emailAddress ?? '' }).then((x) => {
                if (x.status === 200) composeView.insertHTMLIntoBodyAtCursor(x.json.html);
                dd.close();
              });
            };
            box.append(b);
          }
        });
      },
    });
  });
  sdk.Conversations.registerThreadViewHandler((threadView) => {
    console.info('[PII] conversation opened');
    const el = document.createElement('div');
    mountSidebar(el, {
      accountEmail: () => gmailAccount,
      signInAs: () => signIn(undefined, undefined, { fresh: true }),
      getSubject: () => threadView.getSubject(),
      getSender: () => {
        const c = threadView.getMessageViews()[0]?.getSender();
        return c ? { email: c.emailAddress, name: c.name ?? '' } : null;
      },
      getThreadId: () => threadView.getThreadIDAsync(),
      getRecipients: async () => {
        const out = new Set<string>();
        for (const mv of threadView.getMessageViews()) {
          try { for (const r of await mv.getRecipientsFull()) out.add(r.emailAddress.toLowerCase()); } catch { /* a collapsed message may not answer */ }
        }
        return [...out];
      },
      capture: async () => {
        const messages: CapturedMessage[] = [];
        let skipped = 0;
        for (const mv of threadView.getMessageViews()) {
          if (!mv.isLoaded()) { skipped++; continue; }
          const id = await mv.getMessageIDAsync();
          const sender = mv.getSender();
          const to = (await mv.getRecipientsFull()).map((r) => ({ email: r.emailAddress, name: r.name ?? undefined }));
          const t = Date.parse(mv.getDateString());
          messages.push({
            gmailMessageId: id,
            sentAt: Number.isNaN(t) ? undefined : new Date(t).toISOString(),
            from: sender ? `${sender.name ? sender.name + ' ' : ''}<${sender.emailAddress}>` : undefined,
            to,
            body: mv.getBodyElement().innerText.slice(0, 200000),
            attachments: mv.getFileAttachmentCardViews().map((a) => ({ name: a.getTitle().slice(0, 300) })),
          });
        }
        return { messages, skipped };
      },
    });
    threadView.addSidebarContentPanel({ title: 'PII', iconUrl: chrome.runtime.getURL('nav-icon.png'), el });
  });
}).catch((e) => console.error('[PII] InboxSDK failed to load', e));
