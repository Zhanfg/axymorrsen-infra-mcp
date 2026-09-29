export type RiskClass =
  | "READ"
  | "WRITE"
  | "DEPLOY"
  | "DESTRUCTIVE"
  | "SECURITY"
  | "BILLING";

export interface Capability {
  name: string;
  description: string;
  risk: RiskClass;
  requiredScopes: string[];
  resourceKinds: string[];
  idempotent?: boolean;
}

export interface ExecutionContext {
  requestId: string;
  clientId: string;
  subject: string;
  scopes: string[];
  allowedResources: string[];
}

export interface ProviderResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    retryable?: boolean;
  };
}

export interface HealthStatus {
  ok: boolean;
  provider: string;
  message?: string;
}
