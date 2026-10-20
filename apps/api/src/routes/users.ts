import type Router from "@koa/router";
import type Koa from "koa";
import { and, count, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db.js";
import { auditLogs, users } from "../schema.js";

type Actor = { id: string; role: string; email: string };

// The composition root supplies the existing authentication and error helpers.
// This module never imports server.ts or registers middleware of its own.
interface UserRouteDependencies {
  actor: (ctx: Koa.Context) => Promise<Actor>;
  bad: (message: string, status?: number) => never;
  id: () => string;
  now: () => number;
}

export function registerUserRoutes(
  router: Router,
  dependencies: UserRouteDependencies,
) {
  const { actor, id, now } = dependencies;
  const bad: UserRouteDependencies["bad"] = dependencies.bad;
  router.patch("/users/:id", async (ctx) => {
    const a = await actor(ctx);
    const d = z
      .object({
        status: z.enum(["active", "disabled"]).optional(),
        role: z.enum(["student", "reviewer", "admin"]).optional(),
      })
      .parse(ctx.request.body);
    db.transaction(
      (tx) => {
        // Re-read after taking the write lock: concurrent demotion/disable must revoke authority.
        const current = tx.select().from(users).where(eq(users.id, a.id)).get();
        if (!current || current.status !== "active") bad("Unauthorized", 401);
        if (!["admin", "super_admin"].includes(current.role))
          bad("Forbidden", 403);
        const target = tx
          .select()
          .from(users)
          .where(eq(users.id, ctx.params.id))
          .get();
        if (!target) bad("User not found", 404);
        const removesAccess =
          d.status === "disabled" || !!(d.role && d.role !== target.role);
        if (
          target.role === "super_admin" &&
          target.status === "active" &&
          removesAccess
        ) {
          const activeSupers = tx
            .select({ total: count() })
            .from(users)
            .where(
              and(eq(users.role, "super_admin"), eq(users.status, "active")),
            )
            .get()!.total;
          if (activeSupers <= 1)
            bad("Cannot remove the last active super_admin", 409);
        }
        if (current.id === target.id && removesAccess)
          bad("Cannot remove own access");
        if (
          current.role === "admin" &&
          !["student", "reviewer"].includes(target.role)
        )
          bad("Admins may only manage lower roles", 403);
        if (d.role && current.role !== "super_admin")
          bad("Only super_admin may change roles", 403);
        if (!d.status && !d.role) bad("No user changes provided");
        tx.update(users).set(d).where(eq(users.id, target.id)).run();
        tx.insert(auditLogs)
          .values({
            id: id(),
            actorId: current.id,
            action: "update",
            resourceType: "user",
            resourceId: target.id,
            createdAt: now(),
          })
          .run();
      },
      { behavior: "immediate" },
    );
    ctx.body = { ok: true };
  });
}
