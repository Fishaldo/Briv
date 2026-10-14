import type { Database } from "@briv/db";
import type { Env } from "../env.ts";
import type { ErrorReporter, Logger } from "../log.ts";
import type { Mailer } from "../mail.ts";
import type { TownResolver } from "../town.ts";

/** What the routes are given. Tables are not among them: routes reach data through data/. */
export type RouteDeps = {
  /** Only for the sign-in side (data/account.ts); private data goes through `person`. */
  db: Database;
  env: Env;
  log: Logger;
  /** Error monitoring, when it is set up. */
  report?: ErrorReporter;
  mail: Mailer;
  resolveTown: TownResolver;
  today: () => Date;
};
