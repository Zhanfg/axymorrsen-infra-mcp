import type { Capability, HealthStatus, ProviderDescriptor } from "../core/types.js";
import type { Provider } from "../core/provider.js";

const plannedProviders: ProviderDescriptor[] = [
  { id: "github", displayName: "GitHub", status: "planned" },
  { id: "gitlab", displayName: "GitLab", status: "planned" },
  { id: "cloudflare", displayName: "Cloudflare", status: "planned" },
  { id: "circleci", displayName: "CircleCI", status: "planned" },
  { id: "vercel", displayName: "Vercel", status: "planned" },
  { id: "railway", displayName: "Railway", status: "planned" },
  { id: "supabase", displayName: "Supabase", status: "planned" },
  { id: "docker", displayName: "Docker Hub", status: "planned" },
  { id: "terraform", displayName: "Terraform Cloud", status: "planned" },
  { id: "kubernetes", displayName: "Kubernetes", status: "planned" },
  { id: "sentry", displayName: "Sentry", status: "planned" },
  { id: "vault", displayName: "HashiCorp Vault", status: "planned" },
];

export class ProviderRegistry {
  readonly #providers = new Map<string, Provider>();

  register(provider: Provider): void {
    if (this.#providers.has(provider.descriptor.id)) {
      throw new Error(`provider already registered: ${provider.descriptor.id}`);
    }
    this.#providers.set(provider.descriptor.id, provider);
  }

  listProviders(): ProviderDescriptor[] {
    const live = new Map(
      [...this.#providers.values()].map((provider) => [
        provider.descriptor.id,
        provider.descriptor,
      ]),
    );

    return plannedProviders.map((provider) => live.get(provider.id) ?? provider);
  }

  listCapabilities(): Capability[] {
    return [...this.#providers.values()].flatMap((provider) => [
      ...provider.listCapabilities(),
    ]);
  }

  findCapability(name: string): Capability | undefined {
    return this.listCapabilities().find((capability) => capability.name === name);
  }

  async health(): Promise<HealthStatus[]> {
    return Promise.all(
      [...this.#providers.values()].map((provider) => provider.healthCheck()),
    );
  }
}

export const providerRegistry = new ProviderRegistry();
