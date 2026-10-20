// Browser-only response contracts. No API runtime or database imports.
export type User = { id: string; email: string; role: string };

export type ManagedUser = User & {
  status: string;
  createdAt: number;
};
