export interface TeacherAgentCandidate {
  role?: string;
  priority?: number;
  [key: string]: unknown;
}

export function normalizeSingleTeacherAgents<T extends TeacherAgentCandidate>(agents: T[]) {
  if (agents.length === 0) {
    throw new Error('Expected at least one agent');
  }

  const selected = agents.find((agent) => agent.role === 'teacher') ?? agents[0];
  return [{ ...selected, role: 'teacher' as const, priority: 10 }];
}
