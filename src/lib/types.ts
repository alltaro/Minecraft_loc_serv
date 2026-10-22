export type Server = {
  name: string;
  running: boolean;
  port?: number | null;
  version?: string | null;
  serverType?: string | null;
  role?: "owner" | "collaborator";
  ownerUsername?: string;
  collaborators?: string[];
};

export type Mod = {
  name: string;
  size: number;
};
