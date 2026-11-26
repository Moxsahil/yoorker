import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { SLOT_CHANGED, slotChangedSchema, type SlotChanged } from "@yoorker/contracts";
import pg from "pg";
import { filter, Subject, type Observable } from "rxjs";
import { ENV, type Env } from "../config/env";

@Injectable()
export class SlotEvents implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(SlotEvents.name);
  private readonly events = new Subject<SlotChanged>();
  private client: pg.Client | null = null;
  private closed = false;

  constructor(@Inject(ENV) private readonly env: Env) {}

  async onApplicationBootstrap() {
    await this.listen();
  }

  async onApplicationShutdown() {
    this.closed = true;
    this.events.complete();
    await this.client?.end().catch(() => undefined);
  }

  forVenue(venueId: string): Observable<SlotChanged> {
    return this.events.pipe(filter((event) => event.venueId === venueId));
  }

  private async listen(): Promise<void> {
    const client = new pg.Client({ connectionString: this.env.DATABASE_URL });
    client.on("notification", (message) => {
      if (message.channel !== SLOT_CHANGED || !message.payload) return;
      const event = slotChangedSchema.safeParse(JSON.parse(message.payload));
      if (event.success) this.events.next(event.data);
    });
    client.on("error", (error) => {
      this.logger.warn(`Event listener dropped: ${error.message}`);
      this.retry(client);
    });
    try {
      await client.connect();
      await client.query(`LISTEN ${SLOT_CHANGED}`);
      this.client = client;
    } catch (error) {
      this.logger.warn(`Couldn't listen for events: ${(error as Error).message}`);
      this.retry(client);
    }
  }

  private retry(client: pg.Client) {
    client.removeAllListeners("error");
    client.on("error", () => undefined);
    void client.end().catch(() => undefined);
    if (this.client === client) this.client = null;
    if (!this.closed) setTimeout(() => void this.listen(), 1_000);
  }
}
