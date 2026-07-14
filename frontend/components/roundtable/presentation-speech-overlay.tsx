'use client';

import { AnimatePresence, motion } from 'motion/react';
import { Loader2 } from 'lucide-react';
import type { PlaybackView } from '@/lib/playback';
import type { Participant } from '@/lib/types/roundtable';
import type { AudioIndicatorState } from '@/components/roundtable/audio-indicator';

interface PresentationSpeechOverlayProps {
  readonly playbackView: PlaybackView;
  readonly participants: Participant[];
  readonly speakingAgentId: string | null;
  readonly isTopicPending: boolean;
  readonly userAvatar?: string;
  /** Which side this overlay instance renders — only 'left' paints the caption. */
  readonly side?: 'left' | 'right';
  readonly onBubbleClick?: () => void;
  readonly audioIndicatorState?: AudioIndicatorState;
  readonly buttonState?: 'play' | 'bars' | 'restart' | 'none';
  readonly isPaused?: boolean;
}

/** Minimal caption model — just the text + loading flag, no avatars/names/box. */
function buildCaption(playbackView: PlaybackView): { text: string; isLoading: boolean } | null {
  const { phase, bubbleRole, sourceText } = playbackView;
  const showDuringPhase =
    phase === 'lecturePlaying' ||
    phase === 'lecturePaused' ||
    phase === 'discussionActive' ||
    phase === 'discussionPaused';
  const isLoading = phase === 'discussionActive' && bubbleRole !== null && sourceText === '';

  if (!showDuringPhase) return null;
  if (bubbleRole !== 'teacher' && bubbleRole !== 'agent' && bubbleRole !== 'user') return null;
  if (!sourceText && !isLoading) return null;

  return { text: sourceText, isLoading };
}

/**
 * Video-style captions: a single, boxless, centered two-line caption pinned to
 * the bottom of the stage. Avatars, names and speech bubbles are intentionally
 * gone. Only the 'left' instance paints — the 'right' instance renders nothing
 * so there is never a duplicate caption.
 */
export function PresentationSpeechOverlay({
  playbackView,
  side = 'left',
  isTopicPending,
  onBubbleClick,
}: PresentationSpeechOverlayProps) {
  if (side !== 'left') return null;

  const caption = buildCaption(playbackView);

  return (
    <div className="absolute inset-0 pointer-events-none">
      <AnimatePresence mode="wait">
        {caption && (
          <motion.div
            key={caption.isLoading ? 'caption-loading' : 'caption-text'}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.22, ease: [0.21, 1, 0.36, 1] }}
            className="absolute bottom-10 left-1/2 -translate-x-1/2 w-[min(900px,90vw)] flex justify-center px-4 z-30 pointer-events-auto"
            onClick={onBubbleClick}
          >
            {caption.isLoading ? (
              <Loader2 className="w-7 h-7 text-white/90 animate-spin drop-shadow-[0_2px_10px_rgba(0,0,0,0.85)]" />
            ) : (
              <p className="text-center text-[22px] leading-snug font-medium text-white line-clamp-2 whitespace-pre-wrap break-words [text-shadow:_0_2px_12px_rgba(0,0,0,0.9)]">
                {caption.text}
                {isTopicPending && (
                  <span className="inline-block w-2 h-2 rounded-full bg-red-500 ml-1.5 align-middle" />
                )}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
