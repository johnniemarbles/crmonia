export interface ApiRequest { type: 'crmonia:api' | 'pii:api'; method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'; path: string; body?: unknown; region?: string }
export interface ApiResponse { status: number; json: any }
export interface OpenSignIn { type: 'crmonia:signin' | 'pii:signin'; region?: string; keep?: boolean; hint?: string; fresh?: boolean }
/** Which server the Gmail page should frame, by the same rule API calls use. */
export interface BaseRequest { type: 'crmonia:base' | 'pii:base'; region?: string }
export interface SignOut { type: 'crmonia:signout' | 'pii:signout'; region?: string }
export type Message = ApiRequest | OpenSignIn | BaseRequest | SignOut;
