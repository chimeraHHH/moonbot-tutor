'use client';

import { useMemo } from 'react';
import type { Scene, StageMode } from '@/lib/types/stage';
import { SlideEditor as SlideRenderer } from '../slide-renderer/Editor';
import { QuizView } from '../scene-renderers/quiz-view';
// Reserved for restoring paused playback:
// import { InteractiveRenderer } from '../scene-renderers/interactive-renderer';
// import { PBLRenderer } from '../scene-renderers/pbl-renderer';

interface SceneRendererProps {
  readonly scene: Scene;
  readonly mode: StageMode;
}

/**
 * Playback scene dispatcher. In Pro (edit) mode, Stage renders EditShell
 * directly as a top-level takeover — SceneRenderer is only on the playback
 * path, so it does not branch on `mode === 'edit'`.
 */
export function SceneRenderer({ scene, mode }: SceneRendererProps) {
  const renderer = useMemo(() => {
    switch (scene.type) {
      case 'slide':
        if (scene.content.type !== 'slide') return <div>Invalid slide content</div>;
        return <SlideRenderer mode={mode} />;
      case 'quiz':
        if (scene.content.type !== 'quiz') return <div>Invalid quiz content</div>;
        return <QuizView key={scene.id} questions={scene.content.questions} sceneId={scene.id} />;
      case 'interactive':
        if (scene.content.type !== 'interactive') return <div>Invalid interactive content</div>;
        // return <InteractiveRenderer content={scene.content} sceneId={scene.id} />;
        return <PausedCoursewareNotice />;
      case 'pbl':
        if (scene.content.type !== 'pbl') return <div>Invalid PBL content</div>;
        // return <PBLRenderer content={scene.content} mode={mode} sceneId={scene.id} />;
        return <PausedCoursewareNotice />;
      default:
        return <div>Unknown scene type</div>;
    }
  }, [scene, mode]);

  return <div className="w-full h-full">{renderer}</div>;
}

function PausedCoursewareNotice() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-slate-50 px-8 text-center dark:bg-slate-900">
      <div className="max-w-lg space-y-2">
        <p className="text-base font-semibold text-slate-700 dark:text-slate-200">
          互动与项目课件已暂停
        </p>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          这是暂停前生成的页面，请重新生成本课程以获得普通静态讲解页。
        </p>
      </div>
    </div>
  );
}
