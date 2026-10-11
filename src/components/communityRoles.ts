import type { CommunityRole } from "../types";

export const ROLE_LABELS: Record<CommunityRole, string> = {
  owner: "Владелец",
  admin: "Администратор",
  editor: "Редактор",
  member: "Участник",
};

export const isLeader = (role: CommunityRole) => role !== "member";

export const leaderLabel = (role: CommunityRole) => (isLeader(role) ? ROLE_LABELS[role] : "");
