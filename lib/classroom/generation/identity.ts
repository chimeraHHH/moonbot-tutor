export interface GenerationIdentity {
  classroomId: string;
  sessionId: string;
  generationId: string;
}

export interface GenerationContext extends GenerationIdentity {
  topic: string;
  lessonLanguage: string;
  sceneId?: string;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const GENERATION_SESSION_STORAGE_KEY = 'generationSession';

export function isSameGeneration(
  left: Partial<GenerationIdentity> | null | undefined,
  right: Partial<GenerationIdentity> | null | undefined,
): boolean {
  return Boolean(
    left?.classroomId &&
      left.sessionId &&
      left.generationId &&
      left.classroomId === right?.classroomId &&
      left.sessionId === right.sessionId &&
      left.generationId === right.generationId,
  );
}

export function generationParamsStorageKey(classroomId: string): string {
  return `generationParams:${classroomId}`;
}

export function replaceGenerationSession(storage: StorageLike, session: GenerationIdentity): void {
  storage.setItem(GENERATION_SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function persistGenerationSessionIfCurrent<T extends GenerationIdentity>(
  storage: StorageLike,
  session: T,
): boolean {
  const raw = storage.getItem(GENERATION_SESSION_STORAGE_KEY);
  if (!raw) return false;

  try {
    const current = JSON.parse(raw) as Partial<GenerationIdentity>;
    if (!isSameGeneration(current, session)) return false;
    storage.setItem(GENERATION_SESSION_STORAGE_KEY, JSON.stringify(session));
    return true;
  } catch {
    return false;
  }
}

export function removeGenerationSessionIfCurrent(
  storage: StorageLike,
  identity: GenerationIdentity,
): boolean {
  const raw = storage.getItem(GENERATION_SESSION_STORAGE_KEY);
  if (!raw) return false;
  try {
    const current = JSON.parse(raw) as Partial<GenerationIdentity>;
    if (!isSameGeneration(current, identity)) return false;
    storage.removeItem(GENERATION_SESSION_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function isGenerationContextValid(
  context: GenerationContext | undefined,
  expected: { classroomId: string; sceneId?: string; topic?: string },
): boolean {
  if (!context) return false;
  if (!context.sessionId || !context.generationId) return false;
  if (context.classroomId !== expected.classroomId) return false;
  if (expected.sceneId !== undefined && context.sceneId !== expected.sceneId) return false;
  if (expected.topic !== undefined && context.topic.trim() !== expected.topic.trim()) return false;
  return true;
}
