export type TeacherAssetType = 'manim-video' | 'interactive-html' | 'classroom-ppt';

export type TeacherAssetStatus = 'pending' | 'running' | 'ready' | 'error';

export interface TeacherAssetRef {
  jobId?: string;
  taskId?: string;
  classroomId?: string;
}

export interface TeacherAsset {
  id: string;
  type: TeacherAssetType;
  title: string;
  status: TeacherAssetStatus;
  createdAt: number;
  updatedAt: number;
  ref: TeacherAssetRef;
  error?: string;
}

export interface DeepSolveSubmitRequest {
  question: string;
  context?: string;
}

export interface DeepSolveSubmitResponse {
  taskId: string;
}

export type DeepSolveTaskState =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | string;

export interface DeepSolvePollResponse {
  state: DeepSolveTaskState;
  ready: boolean;
  videoUrl?: string;
  error?: string;
}

export interface InteractiveHtmlRequest {
  topic: string;
  goal: string;
  interactionType: string;
  audience: string;
  constraints?: string;
}

export interface InteractiveHtmlResponse {
  html: string;
}

export interface PptRequirementInput {
  topic: string;
  audienceLevel: string;
  durationMin: number;
  slidesCount: number;
  includeQuiz: boolean;
  includeInteractive: boolean;
  generateVideo: boolean;
  generateTTS: boolean;
  notes?: string;
}
