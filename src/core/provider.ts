import type {
  Capability,
  ExecutionContext,
  HealthStatus,
  ProviderResult,
} from "./types.js";

export interface Provider {
  readonly id: string;

  healthCheck(): Promise<HealthStatus>;

  listCapabilities(): readonly Capability[];

  execute(
    action: string,
    input: unknown,
    context: ExecutionContext,
  ): Promise<ProviderResult>;
}
