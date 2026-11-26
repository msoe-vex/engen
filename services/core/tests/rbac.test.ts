import { describe, it, expect, beforeEach } from "vitest";
import type { MetadataDoc, MetadataStore, MetadataQueryOpts } from "@engineering-notebook/shared";
import { setMetadataStore } from "../src/db/metadataStore.js";
import {
  isServiceAdmin,
  requireOrgMember,
  requireNotebookAccess,
  getOrgRole,
} from "../src/rbac.js";
import type { SessionUser } from "../src/auth/authPort.js";

class MemoryMetadataStore implements MetadataStore {
  private docs = new Map<string, MetadataDoc>();

  async count(collectionPath: string): Promise<number> {
    let count = 0;
    for (const key of this.docs.keys()) {
      if (key.startsWith(collectionPath)) count++;
    }
    return count;
  }

  async get(path: string): Promise<MetadataDoc | null> {
    const doc = this.docs.get(path);
    return doc ? { ...doc } : null;
  }

  async set(path: string, data: Record<string, unknown>, opts?: { merge?: boolean }): Promise<void> {
    if (opts?.merge && this.docs.has(path)) {
      this.docs.set(path, { ...this.docs.get(path)!, ...data, id: path.split("/").pop()! });
    } else {
      this.docs.set(path, { ...data, id: path.split("/").pop()! });
    }
  }

  async update(path: string, data: Record<string, unknown>): Promise<void> {
    if (!this.docs.has(path)) throw new Error(`Document ${path} not found`);
    this.docs.set(path, { ...this.docs.get(path)!, ...data });
  }

  async delete(path: string): Promise<void> {
    this.docs.delete(path);
  }

  async query(collectionPath: string, _opts?: MetadataQueryOpts): Promise<MetadataDoc[]> {
    const res: MetadataDoc[] = [];
    for (const [k, v] of this.docs.entries()) {
      if (k.startsWith(collectionPath)) {
        res.push({ ...v });
      }
    }
    return res;
  }

  async batch(): Promise<void> {
    // no-op for memory store
  }
}

describe("Core RBAC & Permission Enforcement", () => {
  let memoryStore: MemoryMetadataStore;

  const normalUser: SessionUser = { uid: "user-123", email: "user@example.com" };
  const adminUser: SessionUser = { uid: "admin-456", email: "admin@example.com" };
  const serviceAdminUser: SessionUser = {
    uid: "service-admin-999",
    email: "super@example.com",
    platformRole: "service_admin",
  };

  beforeEach(() => {
    memoryStore = new MemoryMetadataStore();
    setMetadataStore(memoryStore);
  });

  it("identifies service_admin correctly", () => {
    expect(isServiceAdmin(serviceAdminUser)).toBe(true);
    expect(isServiceAdmin(normalUser)).toBe(false);
  });

  it("service_admin bypasses org membership checks", async () => {
    const role = await requireOrgMember(serviceAdminUser, "org-xyz", "owner");
    expect(role).toBe("owner");
  });

  it("rejects non-members with forbidden error", async () => {
    await expect(requireOrgMember(normalUser, "org-xyz", "member")).rejects.toThrow("forbidden");
  });

  it("enforces role hierarchy (member < admin < owner)", async () => {
    await memoryStore.set("org/org-xyz/member/user-123", { role: "member", status: "active" });

    // Member can access member-level
    const role = await requireOrgMember(normalUser, "org-xyz", "member");
    expect(role).toBe("member");

    // Member cannot access admin-level
    await expect(requireOrgMember(normalUser, "org-xyz", "admin")).rejects.toThrow("forbidden");

    // Upgrade to admin
    await memoryStore.set("org/org-xyz/member/user-123", { role: "admin", status: "active" });
    const adminRole = await requireOrgMember(normalUser, "org-xyz", "admin");
    expect(adminRole).toBe("admin");
  });

  it("blocks alumni members unless allowAlumni is true", async () => {
    await memoryStore.set("org/org-xyz/member/user-123", { role: "member", status: "alumni" });

    // Blocked by default with alumni_readonly error
    await expect(requireOrgMember(normalUser, "org-xyz", "member")).rejects.toThrow("alumni_readonly");

    // Allowed when explicit
    const role = await requireOrgMember(normalUser, "org-xyz", "member", { allowAlumni: true });
    expect(role).toBe("member");
  });

  it("enforces notebook access permissions", async () => {
    await memoryStore.set("org/org-1/member/user-123", { role: "member", status: "active" });

    const openNotebook = {
      id: "nb-1",
      orgId: "org-1",
      name: "Open Notebook",
      createdAt: "2026-01-01",
      access: { mode: "org" as const, teamIds: [], userIds: [] },
    };

    const teamRestrictedNotebook = {
      id: "nb-2",
      orgId: "org-1",
      name: "Team Notebook",
      createdAt: "2026-01-01",
      access: { mode: "restricted" as const, teamIds: ["team-a"], userIds: [] },
    };

    // User can access org-wide notebook
    const accessOpen = await requireNotebookAccess(normalUser, "org-1", openNotebook);
    expect(accessOpen).toBe("member");

    // User cannot access team-restricted notebook without team membership
    await expect(
      requireNotebookAccess(normalUser, "org-1", teamRestrictedNotebook)
    ).rejects.toThrow("forbidden");

    // Add user to team-a
    await memoryStore.set("org/org-1/team/team-a/member/user-123", { uid: "user-123" });
    const accessTeam = await requireNotebookAccess(normalUser, "org-1", teamRestrictedNotebook);
    expect(accessTeam).toBe("member");
  });
});
