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

  resolveResources(
    action: string,
    input: unknown,
  ): readonly string[];

  execute(
    action: string,
    input: unknown,
    context: ExecutionContext,
  ): Promise<ProviderResult>;
}
