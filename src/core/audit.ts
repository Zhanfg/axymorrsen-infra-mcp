import type { RiskClass } from "./types.js";

export type AuditOutcome =
  | "denied"
  | "success"
  | "error";

export interface AuditEvent {
  timestamp: string;
  requestId: string;
  clientId: string;
  subject: string;
  providerId: string;
  action: string;
  risk: RiskClass;
  resources: string[];
  outcome: AuditOutcome;
  reason?: string;
  errorCode?: string;
}

export interface AuditSink {
  append(event: AuditEvent): Promise<void>;
}

export class JsonLineAuditSink
  implements AuditSink
{
  readonly #write: (line: string) => void;

  constructor(
    write: (line: string) => void = (line) =>
      process.stderr.write(line),
  ) {
    this.#write = write;
  }

  async append(
    event: AuditEvent,
  ): Promise<void> {
    this.#write(
      `${JSON.stringify(event)}\n`,
    );
  }
}

export class MemoryAuditSink
  implements AuditSink
{
  readonly events: AuditEvent[] = [];

  async append(
    event: AuditEvent,
  ): Promise<void> {
    this.events.push(
      structuredClone(event),
    );
  }
}
