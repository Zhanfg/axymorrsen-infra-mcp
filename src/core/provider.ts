import type {
  Capability,
  ExecutionContext,
  HealthStatus,
  ProviderDescriptor,
  ProviderResult,
} from "./types.js";

export interface Provider {
  readonly descriptor: ProviderDescriptor;

  healthCheck(): Promise<HealthStatus>;

  listCapabilities(): readonly Capability[];

  execute(
    action: string,
    input: unknown,
    context: ExecutionContext,
  ): Promise<ProviderResult>;
}
