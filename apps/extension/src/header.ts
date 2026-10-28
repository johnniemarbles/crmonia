import type { HostOptions } from './types';

export function mountHeader(hostEl: HTMLElement, host: HostOptions, markUrl: string): () => void {
  const root = hostEl.shadowRoot ?? hostEl.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = `
    :host {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 13px;
    }
    .crmonia-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 8px;
      background: #4f46e5;
      color: #ffffff;
      border: 1px solid #4338ca;
      border-radius: 6px;
      cursor: pointer;
      font-weight: 500;
      font-size: 12px;
      transition: background 0.15s, transform 0.1s;
    }
    .crmonia-btn:hover {
      background: #4338ca;
    }
    .crmonia-btn:active {
      transform: scale(0.97);
    }
    .crmonia-icon {
      width: 16px;
      height: 16px;
      border-radius: 3px;
    }
    .crmonia-bell {
      position: relative;
      background: #f1f5f9;
      color: #334155;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 4px 8px;
      font-size: 12px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
    }
    .crmonia-bell:hover {
      background: #e2e8f0;
    }
  `;

  const container = document.createElement('div');
  container.style.cssText = 'display:inline-flex;align-items:center;gap:6px;';

  const openBtn = document.createElement('button');
  openBtn.className = 'crmonia-btn';
  openBtn.title = 'Open CRMONIA CRM';
  openBtn.innerHTML = `
    <img src="${markUrl}" class="crmonia-icon" alt="CRMONIA" onerror="this.style.display='none'" />
    <span>CRMONIA</span>
  `;
  openBtn.onclick = () => {
    if (host.navigate) {
      host.navigate('crm');
    } else {
      window.open('https://app.crmonia.com/crm', '_blank');
    }
  };

  const bellBtn = document.createElement('button');
  bellBtn.className = 'crmonia-bell';
  bellBtn.title = 'CRMONIA Notifications';
  bellBtn.textContent = '🔔';
  bellBtn.onclick = () => {
    if (host.navigate) {
      host.navigate('inbox');
    }
  };

  container.append(openBtn, bellBtn);
  root.replaceChildren(style, container);

  return () => {
    root.replaceChildren();
  };
}
