export type Locale = 'en' | 'fr-CA';

export interface TransportResult {
  status: number;
  json: any;
}

export type Transport = (
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
  region?: string,
) => Promise<TransportResult>;

export interface ComposeApi {
  send(m: {
    to: string;
    subject: string;
    html: string;
    review?: boolean;
  }): Promise<{ ok: boolean; threadId?: string; error?: string; unconfirmed?: boolean }>;
}

export interface RegionChoice {
  id: string;
  label: string;
}

export interface HostOptions {
  extVersion?: string;
  transport: Transport;
  onSignIn: (region?: string, keep?: boolean, opts?: { fresh?: boolean }) => void;
  onSignOut?: () => void;
  regions?: RegionChoice[];
  region?: string;
  switchRegion?: (region: string) => void;
  assetBase?: string;
  compose?: ComposeApi;
  route?: { page: string; id?: string };
  navigate?: (page: string, id?: string) => void;
}
