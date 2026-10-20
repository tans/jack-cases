import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { QueryFeedback, statusLabel } from "../feedback";
import { patch, errorMessage } from "../lib/api";
import { usePage } from "../lib/pagination";
import { useData } from "../hooks/use-data";
import { Panel } from "../components/panel";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import type { ManagedUser, User } from "../types";

export default function AdminUsers({ user }: { user: User }) {
  const { items: data, controls } = usePage<ManagedUser>("users", "/users");
  const qc = useQueryClient();
  const [pending, setPending] = useState<string | null>(null);
  const roleLabels: Record<string, string> = {
    student: "学员",
    reviewer: "审核员",
    admin: "管理员",
    super_admin: "超级管理员",
  };
  const facetsQuery = useData<{ activeSupers: number }>(
    "users",
    "/users/facets",
  );
  const { data: facets } = facetsQuery;
  const activeSupers = facets?.activeSupers ?? 0;
  const restriction = (u: ManagedUser) => {
    if (u.role === "super_admin" && u.status === "active" && activeSupers <= 1)
      return "须保留最后一名启用的超级管理员";
    if (u.id === user.id) return "不能移除自己的访问权限";
    if (user.role === "admin" && !["student", "reviewer"].includes(u.role))
      return "管理员只能管理学员和审核员";
    if (!["admin", "super_admin"].includes(user.role))
      return "仅管理员可管理用户";
    return "";
  };
  const update = async (
    u: ManagedUser,
    changes: { role?: string; status?: string },
  ) => {
    setPending(u.id);
    try {
      await patch("/users/" + u.id, changes);
    } catch (error: any) {
      alert(errorMessage(error));
    } finally {
      await qc.invalidateQueries({ queryKey: ["users"] });
      setPending(null);
    }
  };
  return (
    <Panel title="用户管理">
      <QueryFeedback query={facetsQuery} label="角色保护状态" />
      {controls}
      <Card>
        <CardContent className="overflow-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-3">用户邮箱</th>
                <th>角色</th>
                <th>状态</th>
                <th>管理</th>
              </tr>
            </thead>
            <tbody>
              {data.map((u) => {
                const reason = restriction(u);
                const hintId = `user-restriction-${u.id}`;
                return (
                  <tr key={u.id} className="border-b">
                    <td className="py-3">{u.email}</td>
                    <td>
                      {user.role === "super_admin" ? (
                        <select
                          aria-label={`修改 ${u.email} 的角色`}
                          aria-describedby={reason ? hintId : undefined}
                          disabled={!!reason || pending !== null}
                          className="rounded-md border border-slate-300 bg-white px-2 py-1.5 disabled:opacity-50"
                          value={u.role}
                          onChange={(e) => update(u, { role: e.target.value })}
                        >
                          <option value="student">学员</option>
                          <option value="reviewer">审核员</option>
                          <option value="admin">管理员</option>
                          {u.role === "super_admin" && (
                            <option value="super_admin" disabled>
                              超级管理员
                            </option>
                          )}
                        </select>
                      ) : (
                        (roleLabels[u.role] ?? u.role)
                      )}
                    </td>
                    <td>{statusLabel(u.status)}</td>
                    <td className="py-3">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!!reason || pending !== null}
                        aria-describedby={reason ? hintId : undefined}
                        onClick={() => {
                          if (confirm("确认修改用户状态？"))
                            void update(u, {
                              status:
                                u.status === "active" ? "disabled" : "active",
                            });
                        }}
                      >
                        {pending === u.id
                          ? "保存中…"
                          : u.status === "active"
                            ? "禁用"
                            : "启用"}
                      </Button>
                      {reason && (
                        <p
                          id={hintId}
                          className="mt-1 max-w-52 text-xs text-slate-600"
                        >
                          {reason}
                        </p>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </Panel>
  );
}
