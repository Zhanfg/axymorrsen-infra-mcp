import * as z from "zod/v4";
import type {
  Capability,
  ExecutionContext,
  ProviderDescriptor,
  ProviderResult,
} from "../core/types.js";
import type { Provider } from "../core/provider.js";
import type { SecretResolver } from "../secrets/resolver.js";
import { ProviderBase } from "./base.js";
import {
  jsonBody,
  objectValue,
  type FetchLike,
} from "./http.js";

const slugSchema = z
  .string()
  .regex(/^[A-Za-z0-9._-]+$/u);

const issueSchema = z.object({
  organization: slugSchema,
  issueId: z
    .string()
    .regex(/^[A-Za-z0-9_-]+$/u),
});

const eventSchema =
  issueSchema.extend({
    eventId: z
      .union([
        z.enum([
          "latest",
          "oldest",
          "recommended",
        ]),
        z.string().regex(
          /^[0-9a-fA-F]{32}$/u,
        ),
      ])
      .default("latest"),
  });

const updateSchema =
  issueSchema.extend({
    status: z
      .enum([
        "resolved",
        "unresolved",
        "ignored",
        "resolvedInNextRelease",
        "muted",
      ])
      .optional(),
    substatus: z
      .enum([
        "archived_until_escalating",
        "archived_until_condition_met",
        "archived_forever",
        "escalating",
        "ongoing",
        "regressed",
        "new",
      ])
      .optional(),
    priority: z
      .enum([
        "low",
        "medium",
        "high",
      ])
      .optional(),
    assignedTo:
      z.string().min(1).optional(),
    isSubscribed:
      z.boolean().optional(),
    isBookmarked:
      z.boolean().optional(),
  })
  .refine(
    (value) =>
      value.status !== undefined ||
      value.substatus !== undefined ||
      value.priority !== undefined ||
      value.assignedTo !== undefined ||
      value.isSubscribed !== undefined ||
      value.isBookmarked !== undefined,
    {
      message:
        "at least one mutable field is required",
    },
  );

export class SentryProvider
  extends ProviderBase
  implements Provider
{
  readonly descriptor: ProviderDescriptor = {
    id: "sentry",
    displayName: "Sentry",
    status: "available",
  };

  readonly #capabilities: Capability[] = [
    {
      name: "sentry.issue.get",
      description:
        "Read one Sentry issue within an authorized organization.",
      risk: "READ",
      requiredScopes: [
        "sentry:issue:read",
      ],
      resourceKinds: [
        "sentry:issue",
      ],
      idempotent: true,
    },
    {
      name: "sentry.issue.event.get",
      description:
        "Read one event belonging to an authorized Sentry issue.",
      risk: "READ",
      requiredScopes: [
        "sentry:event:read",
      ],
      resourceKinds: [
        "sentry:issue",
      ],
      idempotent: true,
    },
    {
      name: "sentry.issue.update",
      description:
        "Update a limited set of Sentry issue workflow fields; merge, discard and public-sharing mutations are not exposed.",
      risk: "WRITE",
      requiredScopes: [
        "sentry:issue:write",
      ],
      resourceKinds: [
        "sentry:issue",
      ],
    },
  ];

  constructor(options: {
    secretResolver: SecretResolver;
    credentialRef?: string;
    baseUrl?: string;
    fetchImpl?: FetchLike;
  }) {
    super({
      id: "sentry",
      baseUrl:
        options.baseUrl ??
        "https://sentry.io/api/0/",
      credentialRef:
        options.credentialRef ??
        "env:SENTRY_AUTH_TOKEN",
      secretResolver:
        options.secretResolver,
      ...(options.fetchImpl
        ? { fetchImpl: options.fetchImpl }
        : {}),
    });
  }

  healthCheck() {
    return this.credentialHealth();
  }

  listCapabilities() {
    return this.#capabilities;
  }

  resolveResources(
    _action: string,
    input: unknown,
  ): readonly string[] {
    const parsed =
      issueSchema.safeParse(input);
    return parsed.success
      ? [
          `sentry:issue:${parsed.data.organization}/${parsed.data.issueId}`,
        ]
      : [];
  }

  async execute(
    action: string,
    input: unknown,
    _context: ExecutionContext,
  ): Promise<ProviderResult> {
    const token = await this.token();
    if (!token.ok || !token.data) {
      return token;
    }

    const headers = {
      authorization:
        `Bearer ${token.data}`,
      accept: "application/json",
    };

    if (
      action === "sentry.issue.get"
    ) {
      const parsed =
        issueSchema.safeParse(input);
      if (!parsed.success) {
        return invalidInput();
      }

      const result =
        await this.http.request(
          issuePath(
            parsed.data.organization,
            parsed.data.issueId,
          ),
          {
            method: "GET",
            headers,
          },
        );

      return sanitizeIssue(result);
    }

    if (
      action ===
      "sentry.issue.event.get"
    ) {
      const parsed =
        eventSchema.safeParse(input);
      if (!parsed.success) {
        return invalidInput();
      }

      const result =
        await this.http.request(
          `${issuePath(
            parsed.data.organization,
            parsed.data.issueId,
          )}events/${encodeURIComponent(parsed.data.eventId)}/`,
          {
            method: "GET",
            headers,
          },
        );

      if (!result.ok) return result;

      const value =
        objectValue(result.data);

      return {
        ok: true,
        data: {
          id: value.id,
          eventID: value.eventID,
          groupID: value.groupID,
          title: value.title,
          message: value.message,
          platform: value.platform,
          dateCreated:
            value.dateCreated,
          tags: value.tags,
          contexts: value.contexts,
          errors: value.errors,
          entries: value.entries,
        },
      };
    }

    if (
      action ===
      "sentry.issue.update"
    ) {
      const parsed =
        updateSchema.safeParse(input);
      if (!parsed.success) {
        return invalidInput();
      }

      const before =
        await this.http.request(
          issuePath(
            parsed.data.organization,
            parsed.data.issueId,
          ),
          {
            method: "GET",
            headers,
          },
        );
      if (!before.ok) return before;

      const issue =
        objectValue(before.data);
      const project =
        objectValue(issue.project);

      if (!project.slug) {
        return {
          ok: false,
          error: {
            code:
              "issue_verification_failed",
            message:
              "Sentry issue project could not be verified",
          },
        };
      }

      const {
        organization: _organization,
        issueId: _issueId,
        ...body
      } = parsed.data;

      const json = jsonBody(body);
      const result =
        await this.http.request(
          issuePath(
            parsed.data.organization,
            parsed.data.issueId,
          ),
          {
            method: "PUT",
            headers: {
              ...headers,
              ...json.headers,
            },
            body: json.body,
          },
        );

      return sanitizeIssue(result);
    }

    return capabilityUnavailable();
  }
}

function issuePath(
  organization: string,
  issueId: string,
): string {
  return `organizations/${encodeURIComponent(organization)}/issues/${encodeURIComponent(issueId)}/`;
}

function sanitizeIssue(
  result: ProviderResult,
): ProviderResult {
  if (!result.ok) return result;

  const value =
    objectValue(result.data);
  const project =
    objectValue(value.project);

  return {
    ok: true,
    data: {
      id: value.id,
      shortId: value.shortId,
      title: value.title,
      culprit: value.culprit,
      permalink:
        value.permalink,
      level: value.level,
      status: value.status,
      substatus:
        value.substatus,
      priority:
        value.priority,
      platform:
        value.platform,
      firstSeen:
        value.firstSeen,
      lastSeen:
        value.lastSeen,
      count: value.count,
      userCount:
        value.userCount,
      project: {
        id: project.id,
        slug: project.slug,
        name: project.name,
      },
    },
  };
}

function invalidInput(): ProviderResult {
  return {
    ok: false,
    error: {
      code: "invalid_input",
      message:
        "provider input is invalid",
    },
  };
}

function capabilityUnavailable(): ProviderResult {
  return {
    ok: false,
    error: {
      code:
        "capability_not_available",
      message:
        "capability is not available",
    },
  };
}
