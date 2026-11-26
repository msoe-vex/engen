import type { MetadataStore, MetadataWhere, MetadataWhereOp } from "@engineering-notebook/shared";
import { createAdapterFactory } from "@better-auth/core/db/adapter";
import type { CleanedWhere, CustomAdapter, JoinConfig, ModelTarget } from "@better-auth/core/db/adapter";

function mapOp(operator: string): MetadataWhereOp {
  switch (operator) {
    case "eq":
      return "==";
    case "ne":
      return "!=";
    case "lt":
      return "<";
    case "lte":
      return "<=";
    case "gt":
      return ">";
    case "gte":
      return ">=";
    default:
      return "==";
  }
}

function normalizeVal(v: unknown): unknown {
  if (v instanceof Date) return v.getTime();
  if (typeof v === "string" && (v.includes("T") || v.endsWith("Z")) && !isNaN(Date.parse(v))) {
    return Date.parse(v);
  }
  return v;
}

function matchInProcess(row: Record<string, unknown>, where: CleanedWhere[]): boolean {
  for (const clause of where) {
    const rawVal = row[clause.field];
    const rawTarget = clause.value;

    const val = normalizeVal(rawVal);
    const target = normalizeVal(rawTarget);

    switch (clause.operator) {
      case "eq":
        if (typeof val === "string" && typeof target === "string") {
          if (val.toLowerCase() !== target.toLowerCase()) return false;
        } else if (val !== target) {
          return false;
        }
        break;
      case "ne":
        if (val === target) return false;
        break;
      case "lt":
        if ((val as number) >= (target as number)) return false;
        break;
      case "lte":
        if ((val as number) > (target as number)) return false;
        break;
      case "gt":
        if ((val as number) <= (target as number)) return false;
        break;
      case "gte":
        if ((val as number) < (target as number)) return false;
        break;
      case "in":
        if (Array.isArray(target) && !(target as unknown[]).includes(val)) return false;
        break;
      case "contains":
        if (typeof rawVal === "string" && typeof rawTarget === "string" && !rawVal.includes(rawTarget)) return false;
        break;
      case "starts_with":
        if (typeof rawVal === "string" && typeof rawTarget === "string" && !rawVal.startsWith(rawTarget)) return false;
        break;
      case "ends_with":
        if (typeof rawVal === "string" && typeof rawTarget === "string" && !rawVal.endsWith(rawTarget)) return false;
        break;
    }
  }
  return true;
}

/**
 * Creates a Better Auth database adapter backed by any implementation of MetadataStore.
 */
export const metadataStoreAdapter = (store: MetadataStore) => {
  return createAdapterFactory({
    config: {
      adapterId: "metadata-store",
      adapterName: "MetadataStore Adapter",
      supportsDates: false,
      supportsBooleans: true,
      supportsJSON: true,
      supportsArrays: true,
      supportsNumericIds: true,
      supportsUUIDs: false,
    },
    adapter: (): CustomAdapter => ({
      async create({ model, data }) {
        const id = String(data.id || (data as Record<string, unknown>)._id || crypto.randomUUID());
        const record = { ...data, id };
        const docPath = `${model}/${id}`;
        await store.set(docPath, record as Record<string, unknown>, { merge: false });
        return record;
      },

      async findOne<T>({
        model,
        where,
        join,
      }: ModelTarget & {
        where: CleanedWhere[];
        select?: string[];
        join?: JoinConfig;
      }): Promise<T | null> {
        let result: Record<string, unknown> | null = null;
        const idClause = where.find((w) => w.field === "id");
        if (idClause && (!idClause.operator || idClause.operator === "eq")) {
          const doc = await store.get(`${model}/${String(idClause.value)}`);
          if (doc && matchInProcess(doc, where)) {
            result = doc;
          }
        } else {
          // Use the most selective single equality clause for Firestore query to avoid index failures
          const eqClauses = where.filter((w) => !w.operator || w.operator === "eq");
          const primaryClause =
            eqClauses.find((w) => w.field === "accountId" || w.field === "email" || w.field === "token") ||
            eqClauses[0];

          const storeWheres: MetadataWhere[] = primaryClause
            ? [{ field: primaryClause.field, op: "==", value: primaryClause.value }]
            : where
                .filter((w) => ["eq", "ne", "lt", "lte", "gt", "gte"].includes(w.operator))
                .slice(0, 1)
                .map((w) => ({ field: w.field, op: mapOp(w.operator), value: w.value }));

          const results = await store.query(model, {
            where: storeWheres.length > 0 ? storeWheres : undefined,
            limit: 25,
          });

          for (const row of results) {
            if (matchInProcess(row, where)) {
              result = row;
              break;
            }
          }
        }

        if (!result) return null;

        // Resolve joins if requested by Better Auth
        if (join && Object.keys(join).length > 0) {
          result = { ...result };
          if (join.user && typeof result.userId === "string") {
            const userDoc = await store.get(`user/${result.userId}`);
            result.user = userDoc ?? null;
          }
          if (join.account && typeof result.id === "string") {
            const accounts = await store.query("account", {
              where: [{ field: "userId", op: "==", value: String(result.id) }],
              limit: 10,
            });
            result.account = accounts;
          }
        }

        return result as unknown as T;
      },

      async findMany<T>({
        model,
        where,
        limit,
        select,
        sortBy,
        offset,
        join,
      }: ModelTarget & {
        where?: CleanedWhere[];
        limit?: number;
        select?: string[];
        sortBy?: { field: string; direction: "asc" | "desc" };
        offset?: number;
        join?: JoinConfig;
      }): Promise<T[]> {
        let rows: Record<string, unknown>[] = [];
        const idClause = (where || []).find((w) => w.field === "id");
        if (idClause && (!idClause.operator || idClause.operator === "eq")) {
          const doc = await store.get(`${model}/${String(idClause.value)}`);
          if (doc && matchInProcess(doc, where || [])) {
            rows = [doc];
          }
        } else {
          const eqClauses = (where || []).filter((w) => !w.operator || w.operator === "eq");
          const primaryClause =
            eqClauses.find((w) => w.field === "accountId" || w.field === "userId" || w.field === "email" || w.field === "token") ||
            eqClauses[0];

          const storeWheres: MetadataWhere[] = primaryClause
            ? [{ field: primaryClause.field, op: "==", value: primaryClause.value }]
            : (where || [])
                .filter((w) => ["eq", "ne", "lt", "lte", "gt", "gte"].includes(w.operator))
                .slice(0, 1)
                .map((w) => ({ field: w.field, op: mapOp(w.operator), value: w.value }));

          const results = await store.query(model, {
            where: storeWheres.length > 0 ? storeWheres : undefined,
            orderBy: sortBy ? { field: sortBy.field, direction: sortBy.direction } : undefined,
            limit: limit && limit > 0 ? limit * 3 : 100,
          });

          rows = where ? results.filter((r) => matchInProcess(r, where)) : results;
          if (limit && limit > 0) {
            rows = rows.slice(0, limit);
          }
        }

        // Resolve joins if requested
        if (join && Object.keys(join).length > 0) {
          rows = await Promise.all(
            rows.map(async (row) => {
              const enriched = { ...row };
              if (join.user && typeof enriched.userId === "string") {
                const userDoc = await store.get(`user/${enriched.userId}`);
                enriched.user = userDoc ?? null;
              }
              if (join.account && typeof enriched.id === "string") {
                const accounts = await store.query("account", {
                  where: [{ field: "userId", op: "==", value: String(enriched.id) }],
                  limit: 10,
                });
                enriched.account = accounts;
              }
              return enriched;
            })
          );
        }

        return rows as unknown as T[];
      },

      async update<T>({
        model,
        where,
        update: updates,
      }: ModelTarget & {
        where: CleanedWhere[];
        update: T;
      }): Promise<T | null> {
        const idClause = where.find((w) => w.field === "id");
        if (idClause && idClause.operator === "eq") {
          const docPath = `${model}/${String(idClause.value)}`;
          const existing = await store.get(docPath);
          if (!existing || !matchInProcess(existing, where)) return null;
          const merged = { ...existing, ...(updates as Record<string, unknown>), id: existing.id };
          await store.update(docPath, updates as Record<string, unknown>);
          return merged as unknown as T;
        }

        const target = await this.findOne<Record<string, unknown>>({ model, where });
        if (!target) return null;
        const id = String((target as Record<string, unknown>).id);
        const docPath = `${model}/${id}`;
        await store.update(docPath, updates as Record<string, unknown>);
        return { ...(target as Record<string, unknown>), ...(updates as Record<string, unknown>), id } as unknown as T;
      },

      async updateMany({ model, where, update: updates }) {
        const targets = await this.findMany({ model, where, limit: 100 });
        for (const t of targets) {
          const id = String((t as Record<string, unknown>).id);
          await store.update(`${model}/${id}`, updates as Record<string, unknown>);
        }
        return targets.length;
      },

      async delete({ model, where }) {
        const idClause = where.find((w) => w.field === "id");
        if (idClause && (!idClause.operator || idClause.operator === "eq")) {
          await store.delete(`${model}/${String(idClause.value)}`);
          return;
        }
        const target = await this.findOne({ model, where });
        if (target) {
          const id = String((target as Record<string, unknown>).id);
          await store.delete(`${model}/${id}`);
        }
      },

      async deleteMany({ model, where }) {
        const targets = await this.findMany({ model, where, limit: 500 });
        for (const t of targets) {
          const id = String((t as Record<string, unknown>).id);
          await store.delete(`${model}/${id}`);
        }
        return targets.length;
      },

      async count({ model, where }) {
        if (!where || where.length === 0) {
          if (store.count) {
            return await store.count(model);
          }
        }
        const targets = await this.findMany({ model, where, limit: 1000 });
        return targets.length;
      },
    }),
  });
};
