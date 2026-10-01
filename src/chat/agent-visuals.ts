/** Palette du design, assignée de façon stable à partir de l'identifiant de l'agent. */
const AGENT_COLORS = ['#004AEB', '#547863', '#7C3AED', '#EA580C', '#0891B2'];

export function agentColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return AGENT_COLORS[hash % AGENT_COLORS.length];
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
