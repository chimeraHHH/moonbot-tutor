export type TeacherAssetType = 'manim-video' | 'interactive-html' | 'classroom-ppt';

type TeacherAssetStatus = 'pending' | 'running' | 'ready' | 'error';

interface TeacherAssetRef {
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
