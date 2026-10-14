import { Hono } from "hono";
import { deleteAccount as deleteAccountBody, locationAnswer, newPlace, profilePatch } from "@briv/contract";
import { z } from "zod";
import { allow, checkDeleteCode, deleteAccount, identityOf, limitKey, newDeleteCode, rename } from "../data/account.ts";
import type { Person } from "../data/person.ts";
import { bad, parse, type Vars } from "../http.ts";
import { deleteCodeMessage } from "../mail.ts";
import { forgetPerson } from "../people.ts";
import { inUk } from "../town.ts";
import type { RouteDeps } from "./deps.ts";

/** The person: their profile, the location question, extra towns, and deleting the account. */
export function meRoutes(deps: RouteDeps, person: (personId: string) => Person) {
  const { db, env, log, resolveTown, mail } = deps;
  const me = new Hono<{ Variables: Vars }>();

  const answer = async (userId: string, personId: string) => person(personId).me(await identityOf(db, userId));

  me.get("/", async (c) => c.json(await answer(c.var.userId, c.var.personId)));

  me.patch("/", async (c) => {
    const patch = parse(profilePatch, await c.req.json().catch(() => ({})));
    if (patch.name !== undefined) await rename(db, c.var.userId, patch.name);
    await person(c.var.personId).updateProfile({
      homeTown: patch.homeTown,
      paydayRule: patch.paydayRule ?? (patch.paydayDay !== undefined ? (patch.paydayDay ? "day_of_month" : "none") : undefined),
      paydayDay: patch.paydayDay,
      usualTakeHome: patch.usualTakeHome,
      country: patch.country,
      onboarded: patch.onboarded,
    });
    return c.json(await answer(c.var.userId, c.var.personId));
  });

  /**
   * The location question, asked once after the first sign-in. A point is
   * turned into a town and then dropped; only the town is kept.
   */
  me.post("/location", async (c) => {
    const body = parse(locationAnswer, await c.req.json().catch(() => ({})));
    const mine = person(c.var.personId);
    let found: string | null = body.town ?? null;
    if (body.allowed && !found && body.lat !== undefined && body.lng !== undefined && inUk(body.lat, body.lng)) {
      found = await resolveTown(body.lat, body.lng).catch((error: unknown) => {
        log("warn", "town_lookup_failed", { id: c.var.requestId, error: error instanceof Error ? error.name : "unknown" });
        return null;
      });
    }
    await mine.recordConsent("location", body.allowed);
    if (body.allowed) await mine.recordConsent("precise_location", body.precise === true);
    await mine.updateProfile({
      locationAsked: true,
      preciseLocation: body.allowed && body.precise === true,
      ...(found ? { homeTown: found } : {}),
    });
    return c.json({ town: found, me: await answer(c.var.userId, c.var.personId) });
  });

  /** Extra towns typed by hand, such as where you work. */
  me.post("/places", async (c) => {
    const body = parse(newPlace, await c.req.json().catch(() => ({})));
    await person(c.var.personId).addPlace(body.town);
    return c.json(await answer(c.var.userId, c.var.personId));
  });

  me.delete("/places/:id", async (c) => {
    const id = parse(z.string().uuid(), c.req.param("id"));
    await person(c.var.personId).removePlace(id);
    return c.json(await answer(c.var.userId, c.var.personId));
  });

  /**
   * Deleting the account takes a code sent to the person's email, however
   * long ago they signed in, so a phone left signed in cannot be used to wipe
   * someone's account, and a person who has been signed in for months can
   * still delete theirs.
   */
  me.post("/delete-code", async (c) => {
    if (!(await allow(db, limitKey("delete-code", c.var.userId, env.secret), 3, 3600))) {
      bad("Too many codes asked for. Try again in an hour.", 429);
    }
    const code = await newDeleteCode(db, c.var.userId, env.secret);
    await mail({ to: c.var.email, ...deleteCodeMessage(code) });
    return c.json({ sent: true });
  });

  me.delete("/", async (c) => {
    const body = parse(deleteAccountBody, await c.req.json().catch(() => ({})));
    if (!(await checkDeleteCode(db, c.var.userId, body.code, env.secret))) {
      bad("That code is not right, or it has run out. Ask for a new one.");
    }
    await deleteAccount(db, { userId: c.var.userId, personId: c.var.personId, email: c.var.email });
    forgetPerson(c.var.userId);
    log("info", "account_deleted", { id: c.var.requestId });
    return c.json({ deleted: true });
  });

  return me;
}
