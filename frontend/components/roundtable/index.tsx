'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, MicOff, Send, MessageSquare, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AudioIndicatorState } from './audio-indicator';
import { CanvasToolbar } from '@/components/canvas/canvas-toolbar';
import { useAudioRecorder } from '@/lib/hooks/use-audio-recorder';
import { useI18n } from '@/lib/hooks/use-i18n';
import { toast } from 'sonner';
import { useSettingsStore, PLAYBACK_SPEEDS } from '@/lib/store/settings';
import { ProactiveCard } from '@/components/chat/proactive-card';
import { PresentationSpeechOverlay } from '@/components/roundtable/presentation-speech-overlay';
import { useAgentRegistry } from '@/lib/orchestration/registry/store';
import { DEFAULT_USER_AVATAR } from '@/components/roundtable/constants';
import type { DiscussionAction } from '@/lib/types/action';
import type { EngineMode, PlaybackView } from '@/lib/playback';
import type { Participant } from '@/lib/types/roundtable';

export interface DiscussionRequest {
  topic: string;
  prompt?: string;
  agentId?: string; // Agent ID to initiate discussion (default: 'default-1')
}

interface RoundtableProps {
  readonly mode?: 'playback' | 'autonomous';
  readonly initialParticipants?: Participant[];
  readonly playbackView?: PlaybackView; // Centralised derived state from Stage
  readonly currentSpeech?: string | null; // Live SSE speech (from StreamBuffer — discussion/QA)
  readonly lectureSpeech?: string | null; // Active lecture speech (from PlaybackEngine, full text)
  readonly idleText?: string | null; // Static idle text (first speech action)
  readonly playbackCompleted?: boolean; // True when engine finished all actions (show restart icon)
  readonly discussionRequest?: DiscussionAction | null;
  readonly engineMode?: EngineMode;
  readonly isStreaming?: boolean;
  readonly sessionType?: 'qa' | 'discussion';
  readonly speakingAgentId?: string | null;
  readonly audioIndicatorState?: AudioIndicatorState;
  readonly audioAgentId?: string | null;
  readonly speechProgress?: number | null; // StreamBuffer reveal progress (0–1) for auto-scroll
  readonly showEndFlash?: boolean;
  readonly endFlashSessionType?: 'qa' | 'discussion';
  readonly thinkingState?: { stage: string; agentId?: string } | null;
  readonly isCueUser?: boolean;
  readonly isTopicPending?: boolean;
  readonly onMessageSend?: (message: string) => void;
  readonly onDiscussionStart?: (request: DiscussionAction) => void;
  readonly onDiscussionSkip?: () => void;
  readonly onStopDiscussion?: () => void;
  readonly onInputActivate?: () => void;

  readonly onResumeTopic?: () => void;
  readonly onPlayPause?: () => void;
  readonly isDiscussionPaused?: boolean;
  readonly onDiscussionPause?: () => void;
  readonly onDiscussionResume?: () => void;
  readonly totalActions?: number;
  readonly currentActionIndex?: number;
  // Toolbar props (merged from CanvasArea)
  readonly currentSceneIndex?: number;
  readonly scenesCount?: number;
  readonly whiteboardOpen?: boolean;
  readonly sidebarCollapsed?: boolean;
  readonly chatCollapsed?: boolean;
  readonly onToggleSidebar?: () => void;
  readonly onToggleChat?: () => void;
  readonly onPrevSlide?: () => void;
  readonly onNextSlide?: () => void;
  readonly onWhiteboardClose?: () => void;
  readonly isPresenting?: boolean;
  readonly controlsVisible?: boolean;
  readonly onTogglePresentation?: () => void;
  readonly onPresentationInteractionChange?: (active: boolean) => void;
  /** Ref to the fullscreen container — passed to ProactiveCard so its portal
   *  renders inside the top-layer during presentation mode. */
  readonly fullscreenContainerRef?: React.RefObject<HTMLDivElement | null>;
}

const VOICE_WAVE_BARS = [
  { peak: 18, duration: 0.55 },
  { peak: 24, duration: 0.72 },
  { peak: 15, duration: 0.63 },
  { peak: 22, duration: 0.68 },
  { peak: 27, duration: 0.78 },
  { peak: 19, duration: 0.61 },
  { peak: 26, duration: 0.74 },
  { peak: 17, duration: 0.58 },
  { peak: 23, duration: 0.7 },
  { peak: 16, duration: 0.57 },
  { peak: 21, duration: 0.66 },
  { peak: 14, duration: 0.53 },
] as const;

function VoiceWaveformBars({ barClassName }: { readonly barClassName: string }) {
  return VOICE_WAVE_BARS.map((bar, i) => (
    <motion.div
      key={i}
      animate={{
        height: [4, bar.peak, 4],
        opacity: [0.3, 1, 0.3],
      }}
      transition={{
        repeat: Infinity,
        duration: bar.duration,
        delay: i * 0.05,
        ease: 'easeInOut',
      }}
      className={cn('w-1 rounded-full', barClassName)}
    />
  ));
}

export function Roundtable({
  mode: _mode = 'autonomous',
  initialParticipants = [],
  playbackView,
  currentSpeech,
  lectureSpeech,
  idleText,
  playbackCompleted,
  discussionRequest,
  engineMode = 'idle',
  isStreaming,
  sessionType,
  speakingAgentId,
  audioIndicatorState,
  audioAgentId,
  speechProgress: _speechProgress,
  showEndFlash,
  endFlashSessionType = 'discussion',
  thinkingState,
  isCueUser,
  isTopicPending,
  onMessageSend,
  onDiscussionStart,
  onDiscussionSkip,
  onStopDiscussion,
  onInputActivate,

  onResumeTopic,
  onPlayPause,
  isDiscussionPaused,
  onDiscussionPause,
  onDiscussionResume,
  currentSceneIndex = 0,
  scenesCount = 1,
  whiteboardOpen = false,
  sidebarCollapsed,
  chatCollapsed,
  onToggleSidebar,
  onToggleChat,
  onPrevSlide,
  onNextSlide,
  onWhiteboardClose,
  isPresenting,
  controlsVisible,
  onTogglePresentation,
  onPresentationInteractionChange,
  fullscreenContainerRef,
}: RoundtableProps) {
  const { t } = useI18n();
  const ttsMuted = useSettingsStore((s) => s.ttsMuted);
  const setTTSMuted = useSettingsStore((s) => s.setTTSMuted);
  const ttsEnabled = useSettingsStore((state) => state.ttsEnabled);
  const asrEnabled = useSettingsStore((state) => state.asrEnabled);
  const chatAreaWidth = useSettingsStore((s) => s.chatAreaWidth);
  const ttsVolume = useSettingsStore((s) => s.ttsVolume);
  const setTTSVolume = useSettingsStore((s) => s.setTTSVolume);
  const autoPlayLecture = useSettingsStore((s) => s.autoPlayLecture);
  const setAutoPlayLecture = useSettingsStore((s) => s.setAutoPlayLecture);
  const playbackSpeed = useSettingsStore((s) => s.playbackSpeed);
  const setPlaybackSpeed = useSettingsStore((s) => s.setPlaybackSpeed);
  const [isInputOpen, setIsInputOpen] = useState(false);
  const [isVoiceOpen, setIsVoiceOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [userMessage, setUserMessage] = useState<string | null>(null);
  const bubbleScrollRef = useRef<HTMLDivElement>(null);
  const teacherAvatarRef = useRef<HTMLDivElement>(null);
  const studentAvatarRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const userMessageClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // End flash visible state (Issue 3)
  const [endFlashVisible, setEndFlashVisible] = useState(false);

  // Send cooldown: lock input from "message sent" until "agent bubble appears"
  const [isSendCooldown, setIsSendCooldown] = useState(false);
  const isSendCooldownRef = useRef(false);

  const teacherParticipant = initialParticipants.find((p) => p.role === 'teacher');
  const studentParticipants = initialParticipants.filter(
    (p) => p.role !== 'teacher' && p.role !== 'user',
  );

  // Stable ref object for the current discussion agent's avatar
  const discussionAnchorRef = useRef<HTMLDivElement>(null);
  const presentationActionAnchorRef = useRef<HTMLDivElement>(null);
  const presentationAgentAvatarRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!discussionRequest) {
      discussionAnchorRef.current = null;
      return;
    }
    if (discussionRequest.agentId === teacherParticipant?.id) {
      discussionAnchorRef.current = teacherAvatarRef.current;
    } else {
      discussionAnchorRef.current =
        studentAvatarRefs.current.get(discussionRequest.agentId || '') || null;
    }
  }, [discussionRequest, teacherParticipant?.id]);

  // Derived state from Stage's computePlaybackView (centralised derivation)
  const isInLiveFlow =
    playbackView?.isInLiveFlow ??
    !!(speakingAgentId || thinkingState || isStreaming || sessionType);

  // Role-aware source text: userMessage overlay on top of playbackView
  const sourceText = userMessage
    ? userMessage
    : (playbackView?.sourceText ??
      (currentSpeech
        ? currentSpeech
        : isInLiveFlow
          ? ''
          : lectureSpeech || (playbackCompleted ? '' : idleText) || ''));
  const hasAgentFeedback = Boolean(playbackView?.sourceText || thinkingState);
  const prevHasAgentFeedbackRef = useRef(hasAgentFeedback);

  const clearUserMessageClearTimer = useCallback(() => {
    if (userMessageClearTimerRef.current) {
      clearTimeout(userMessageClearTimerRef.current);
      userMessageClearTimerRef.current = null;
    }
  }, []);

  const scheduleUserMessageClear = useCallback(() => {
    clearUserMessageClearTimer();
    userMessageClearTimerRef.current = setTimeout(() => {
      setUserMessage(null);
      userMessageClearTimerRef.current = null;
    }, 3000);
  }, [clearUserMessageClearTimer]);

  const showLocalUserMessage = useCallback(
    (text: string) => {
      setUserMessage(text);
      // Mark as "already seen feedback" so that the immediate thinkingState
      // transition (false→true) after user sends won't trigger the early-clear
      // effect and swallow the user bubble.
      prevHasAgentFeedbackRef.current = true;
      scheduleUserMessageClear();
    },
    [scheduleUserMessageClear],
  );

  // Auto-scroll bubble: keep latest streaming text visible during live/discussion flow
  useEffect(() => {
    if (!isInLiveFlow) return;
    const el = bubbleScrollRef.current;
    if (!el) return;
    const scrollableHeight = el.scrollHeight - el.clientHeight;
    if (scrollableHeight <= 0) return;
    el.scrollTo({ top: scrollableHeight, behavior: 'smooth' });
  }, [sourceText, isInLiveFlow]);

  // Clear user message early when agent starts responding
  useEffect(() => {
    const feedbackStarted = hasAgentFeedback && !prevHasAgentFeedbackRef.current;
    if (userMessage && feedbackStarted) {
      clearUserMessageClearTimer();
      setUserMessage(null);
    }
    prevHasAgentFeedbackRef.current = hasAgentFeedback;
  }, [clearUserMessageClearTimer, hasAgentFeedback, userMessage]);

  useEffect(() => () => clearUserMessageClearTimer(), [clearUserMessageClearTimer]);

  // End flash effect (Issue 3)
  useEffect(() => {
    if (showEndFlash) {
      setEndFlashVisible(true);
      const timer = setTimeout(() => setEndFlashVisible(false), 1800);
      return () => clearTimeout(timer);
    } else {
      setEndFlashVisible(false);
    }
  }, [showEndFlash]);

  // Clear send cooldown when agent bubble appears
  useEffect(() => {
    if (isSendCooldown && speakingAgentId) {
      setIsSendCooldown(false);
      isSendCooldownRef.current = false;
    }
  }, [isSendCooldown, speakingAgentId]);

  // Safety net: clear cooldown when streaming transitions from active → ended
  // (not when isStreaming was already false — that would clear cooldown immediately)
  const prevStreamingRef = useRef(false);
  useEffect(() => {
    if (prevStreamingRef.current && !isStreaming && isSendCooldown) {
      setIsSendCooldown(false);
      isSendCooldownRef.current = false;
    }
    prevStreamingRef.current = !!isStreaming;
  }, [isStreaming, isSendCooldown]);

  // Separate participants by role (teacherParticipant & studentParticipants declared earlier for effect)
  const userParticipant = initialParticipants.find((p) => p.role === 'user');

  const userAvatar = userParticipant?.avatar || DEFAULT_USER_AVATAR;

  // Audio recording
  const { isRecording, isProcessing, startRecording, stopRecording, cancelRecording } =
    useAudioRecorder({
      onTranscription: (text) => {
        if (!text.trim()) {
          toast.info(t('roundtable.noSpeechDetected'));
          setIsVoiceOpen(false);
          return;
        }
        // Block if in send cooldown (e.g. text was sent while voice was processing)
        if (isSendCooldownRef.current) {
          setIsVoiceOpen(false);
          return;
        }
        showLocalUserMessage(text);
        onMessageSend?.(text);
        setIsSendCooldown(true);
        isSendCooldownRef.current = true;
        setIsVoiceOpen(false);
      },
      onError: (error) => {
        toast.error(error);
        setIsVoiceOpen(false);
      },
    });

  const handleSendMessage = () => {
    if (!inputValue.trim() || isSendCooldown) return;

    showLocalUserMessage(inputValue);
    onMessageSend?.(inputValue);
    setIsSendCooldown(true);
    isSendCooldownRef.current = true;
    setInputValue('');
    setIsInputOpen(false);
  };

  const handleToggleInput = () => {
    if (isSendCooldown) return;
    if (!isInputOpen) {
      onInputActivate?.();
    }
    setIsInputOpen(!isInputOpen);
    // Cancel any in-flight ASR to prevent ghost auto-sends
    if (isVoiceOpen || isProcessing) {
      cancelRecording();
      setIsVoiceOpen(false);
    }
  };

  const handleToggleVoice = () => {
    if (isVoiceOpen) {
      if (isRecording) {
        stopRecording();
      }
      setIsVoiceOpen(false);
    } else {
      if (isSendCooldown || isProcessing) return;
      onInputActivate?.();
      setIsVoiceOpen(true);
      setIsInputOpen(false);
      startRecording();
    }
  };

  // Keyboard shortcuts for roundtable interaction (#255)
  // T = toggle text input, V = toggle voice input, Escape = dismiss panels,
  // Space = discussion pause/resume (during live flow)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape should always work, even when typing in an input
      if (e.key === 'Escape') {
        if (isInputOpen || isVoiceOpen) {
          e.preventDefault();
          e.stopPropagation(); // Prevent fullscreen exit when panels are open
          setIsInputOpen(false);
          setIsVoiceOpen(false);
          if (isRecording || isProcessing) cancelRecording();
        }
        return;
      }

      // Skip other shortcuts when user is typing in an input, textarea, or contentEditable
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) {
        return;
      }

      switch (e.key) {
        case ' ':
        case 'Spacebar':
          // Only handle during live flow (QA/Discussion)
          if (!isInLiveFlow) return;
          e.preventDefault(); // Prevent page scroll
          if (isDiscussionPaused) {
            onDiscussionResume?.();
          } else if (!thinkingState && currentSpeech) {
            // Same guard as bubble click: don't pause during thinking or before text arrives
            onDiscussionPause?.();
          }
          break;

        case 't':
        case 'T':
          e.preventDefault();
          handleToggleInput();
          break;

        case 'v':
        case 'V':
          e.preventDefault();
          if (asrEnabled) handleToggleVoice();
          break;

        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isInLiveFlow,
    isDiscussionPaused,
    thinkingState,
    currentSpeech,
    onDiscussionPause,
    onDiscussionResume,
    asrEnabled,
    isInputOpen,
    isVoiceOpen,
    isRecording,
    isProcessing,
  ]);

  const isPresentationInteractionActive = isInputOpen || isVoiceOpen || isRecording || isProcessing;

  useEffect(() => {
    onPresentationInteractionChange?.(isPresentationInteractionActive);

    return () => {
      if (isPresentationInteractionActive) {
        onPresentationInteractionChange?.(false);
      }
    };
  }, [isPresentationInteractionActive, onPresentationInteractionChange]);

  // Determine active speaking state and bubble ownership
  // Check if current speaker is a student agent (not teacher)
  const speakingStudent = speakingAgentId
    ? studentParticipants.find((s) => s.id === speakingAgentId)
    : null;

  // Bubble loading: speakingAgentId is set (agent_start fired) but text hasn't arrived yet
  const isBubbleLoading = !!(speakingAgentId && !currentSpeech && !userMessage);
  // Student agent specifically loading (for agent-style bubble)
  const isAgentLoading = !!(speakingStudent && !currentSpeech && !userMessage);

  const activeRole: 'teacher' | 'user' | 'agent' | null = userMessage
    ? 'user'
    : (playbackView?.activeRole ??
      (currentSpeech && speakingStudent
        ? 'agent'
        : currentSpeech
          ? 'teacher'
          : isAgentLoading
            ? 'agent'
            : isBubbleLoading
              ? 'teacher'
              : isCueUser
                ? null
                : lectureSpeech
                  ? 'teacher'
                  : null));

  const bubbleRole: 'teacher' | 'user' | 'agent' | null = userMessage
    ? 'user'
    : (playbackView?.bubbleRole ??
      (currentSpeech && speakingStudent
        ? 'agent'
        : currentSpeech
          ? 'teacher'
          : isAgentLoading
            ? 'agent'
            : isBubbleLoading
              ? 'teacher'
              : isInLiveFlow
                ? null
                : isCueUser
                  ? null
                  : lectureSpeech || idleText
                    ? 'teacher'
                    : null));

  // Stable key based on speaker identity, NOT text content (prevents re-mount flicker)
  const bubbleKey =
    bubbleRole === 'user'
      ? 'user'
      : bubbleRole === 'agent'
        ? `agent-${speakingAgentId}`
        : bubbleRole === 'teacher'
          ? 'teacher'
          : 'idle';

  // Enriched playbackView that includes userMessage overlay for bubbleRole/sourceText
  const enrichedPlaybackView: PlaybackView = playbackView
    ? { ...playbackView, bubbleRole, sourceText, activeRole: activeRole ?? playbackView.activeRole }
    : {
        phase: 'idle' as const,
        sourceText,
        bubbleRole,
        activeRole,
        buttonState: 'none' as const,
        isInLiveFlow: false,
        isTopicActive: false,
      };

  // Show stop button whenever there's an active QA/discussion session or live mode.
  // sessionType is only cleared in doSessionCleanup, so this stays stable through
  // brief loading gaps (e.g. between user message and agent SSE response).
  const showStopButton =
    engineMode === 'live' || sessionType === 'qa' || sessionType === 'discussion';

  const handleCycleSpeed = useCallback(() => {
    const currentIndex = PLAYBACK_SPEEDS.indexOf(playbackSpeed as (typeof PLAYBACK_SPEEDS)[number]);
    const nextIndex = (currentIndex + 1) % PLAYBACK_SPEEDS.length;
    setPlaybackSpeed(PLAYBACK_SPEEDS[nextIndex]);
  }, [playbackSpeed, setPlaybackSpeed]);

  // Intentionally non-reactive: agent metadata is treated as immutable during a classroom session.
  const agentRegistry = useAgentRegistry.getState();
  const getAgentConfig = (id: string) => agentRegistry.getAgent(id);

  const presentationDiscussionParticipant = discussionRequest
    ? discussionRequest.agentId === teacherParticipant?.id
      ? teacherParticipant || null
      : studentParticipants.find((student) => student.id === discussionRequest.agentId) || null
    : null;
  const presentationDiscussionAgentConfig = discussionRequest
    ? getAgentConfig(discussionRequest.agentId || '')
    : null;

  const handlePresentationBubbleClick = useCallback(() => {
    if (isTopicPending) {
      onResumeTopic?.();
      return;
    }
    if (isInLiveFlow) {
      if (isDiscussionPaused) {
        onDiscussionResume?.();
      } else if (!thinkingState && currentSpeech) {
        onDiscussionPause?.();
      }
      return;
    }
    onPlayPause?.();
  }, [
    isTopicPending,
    isInLiveFlow,
    isDiscussionPaused,
    thinkingState,
    currentSpeech,
    onResumeTopic,
    onDiscussionResume,
    onDiscussionPause,
    onPlayPause,
  ]);
  const showPresentationDock =
    !!controlsVisible ||
    !!discussionRequest ||
    isCueUser ||
    isInputOpen ||
    isVoiceOpen ||
    isRecording ||
    isProcessing;
  const toolbar = (
    <CanvasToolbar
      className="shrink-0 h-8 px-3 border-b border-[rgba(255,197,90,0.12)]"
      currentSceneIndex={currentSceneIndex}
      scenesCount={scenesCount}
      engineState={
        engineMode === 'playing' || engineMode === 'live'
          ? 'playing'
          : engineMode === 'paused'
            ? 'paused'
            : 'idle'
      }
      isLiveSession={isStreaming || isTopicPending || engineMode === 'live'}
      whiteboardOpen={whiteboardOpen}
      sidebarCollapsed={sidebarCollapsed}
      chatCollapsed={chatCollapsed}
      onToggleSidebar={onToggleSidebar}
      onToggleChat={onToggleChat}
      onPrevSlide={onPrevSlide ?? (() => {})}
      onNextSlide={onNextSlide ?? (() => {})}
      onPlayPause={onPlayPause ?? (() => {})}
      onWhiteboardClose={onWhiteboardClose ?? (() => {})}
      isPresenting={isPresenting}
      onTogglePresentation={onTogglePresentation}
      showStopDiscussion={showStopButton}
      onStopDiscussion={onStopDiscussion}
      ttsEnabled={ttsEnabled}
      ttsMuted={ttsMuted}
      ttsVolume={ttsVolume}
      onToggleMute={() => ttsEnabled && setTTSMuted(!ttsMuted)}
      onVolumeChange={(v) => setTTSVolume(v)}
      autoPlayLecture={autoPlayLecture}
      onToggleAutoPlay={() => setAutoPlayLecture(!autoPlayLecture)}
      playbackSpeed={playbackSpeed}
      onCycleSpeed={handleCycleSpeed}
    />
  );

  if (isPresenting) {
    return (
      <div className="h-0 w-full relative z-10 overflow-visible">
        {/* Speech overlay — fills the full stage area via absolute positioning */}
        <PresentationSpeechOverlay
          playbackView={enrichedPlaybackView}
          participants={initialParticipants}
          speakingAgentId={speakingAgentId ?? null}
          isTopicPending={!!isTopicPending}
          side="left"
          onBubbleClick={handlePresentationBubbleClick}
          audioIndicatorState={audioIndicatorState ?? 'idle'}
          buttonState={enrichedPlaybackView?.buttonState}
          isPaused={isDiscussionPaused || engineMode === 'paused'}
        />

        {/* Click-outside backdrop to dismiss input/voice */}
        {(isInputOpen || isVoiceOpen) && (
          <div
            className="fixed top-0 left-0 right-0 bottom-14 z-[45] pointer-events-auto"
            onClick={() => {
              setIsInputOpen(false);
              setIsVoiceOpen(false);
              cancelRecording();
            }}
          />
        )}

        {/* ── Toolbar — pinned to bottom of screen ── */}
        <div
          className={cn(
            'fixed bottom-0 left-0 z-[40] pointer-events-none flex items-center justify-center transition-all duration-300',
            controlsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2',
          )}
          style={{ right: chatCollapsed === false ? (chatAreaWidth ?? 320) : 0 }}
        >
          <div className="mb-3 px-2 py-1 rounded-full bg-white/70 dark:bg-black/60 backdrop-blur-xl border border-gray-200/60 dark:border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.08)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.4)] pointer-events-auto">
            {toolbar}
          </div>
        </div>

        {/* ── End flash notification ── */}
        <AnimatePresence>
          {endFlashVisible && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.9 }}
              animate={{
                opacity: [0, 1, 1, 0],
                y: [10, 0, 0, 6],
                scale: [0.9, 1, 1, 0.95],
              }}
              transition={{
                duration: 1.8,
                times: [0, 0.15, 0.7, 1],
                ease: 'easeOut',
              }}
              className="fixed bottom-20 -translate-x-1/2 z-[50] bg-gray-100/80 dark:bg-gray-800/80 backdrop-blur-md text-gray-700 dark:text-white px-3.5 py-1.5 rounded-full text-xs font-medium pointer-events-none"
              style={{
                left: `calc((100vw - ${chatCollapsed === false ? (chatAreaWidth ?? 320) : 0}px) / 2)`,
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-gray-400 inline-block mr-1.5" />
              {endFlashSessionType === 'discussion'
                ? t('roundtable.discussionEnded')
                : t('roundtable.qaEnded')}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Center stack: input / voice / thinking — anchored above toolbar ── */}
        <div
          className="fixed bottom-14 left-0 z-[50] flex flex-col items-center justify-center gap-3 pointer-events-none transition-[right] duration-300"
          style={{ right: chatCollapsed === false ? (chatAreaWidth ?? 320) : 0 }}
        >
          {/* Input panel */}
          <AnimatePresence>
            {isInputOpen && (
              <motion.div
                key="presentation-input-stage"
                initial={{ opacity: 0, scale: 0.95, y: 15, filter: 'blur(4px)' }}
                animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, scale: 0.95, y: 15, filter: 'blur(4px)' }}
                className="w-[min(480px,calc(100vw-3rem))] pointer-events-auto"
              >
                <div className="flex items-center gap-3 bg-white/70 dark:bg-black/60 backdrop-blur-xl rounded-full px-4 py-2 shadow-[0_8px_32px_rgba(0,0,0,0.08)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.4)] border border-gray-200/60 dark:border-white/10">
                  <div className="flex-1 min-w-0 flex items-center">
                    <textarea
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                          e.preventDefault();
                          handleSendMessage();
                        }
                      }}
                      placeholder={t('roundtable.inputPlaceholder')}
                      autoFocus
                      rows={1}
                      className="w-full resize-none bg-transparent border-none focus:ring-0 focus:outline-none outline-none shadow-none ring-0 text-gray-900 dark:text-white text-sm placeholder:text-gray-400 dark:placeholder:text-gray-400 py-0 leading-[40px] max-h-[80px]"
                      style={{ fieldSizing: 'content' } as Record<string, string>}
                    />
                  </div>
                  <button
                    onClick={handleSendMessage}
                    disabled={isSendCooldown}
                    className={cn(
                      'w-10 h-10 rounded-full flex items-center justify-center transition-all shrink-0',
                      isSendCooldown
                        ? 'bg-gray-500/50 cursor-not-allowed'
                        : 'bg-purple-600 hover:bg-purple-700 shadow-[0_4px_16px_rgba(147,51,234,0.3)]',
                    )}
                  >
                    {isSendCooldown ? (
                      <Loader2 className="w-4 h-4 text-white animate-spin" />
                    ) : (
                      <Send className="w-4 h-4 text-white" />
                    )}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Voice panel */}
          <AnimatePresence>
            {isVoiceOpen && (
              <motion.div
                key="presentation-voice-stage"
                initial={{ opacity: 0, scale: 0.9, y: 20, filter: 'blur(4px)' }}
                animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, scale: 0.9, y: 20, filter: 'blur(4px)' }}
                className="pointer-events-auto"
              >
                <div className="flex items-center gap-4 bg-white/70 dark:bg-black/60 backdrop-blur-xl rounded-full px-5 py-3 shadow-[0_8px_32px_rgba(0,0,0,0.08)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.4)] border border-gray-200/60 dark:border-white/10">
                  {/* Waveform bars */}
                  <div className="flex items-center gap-0.5 h-8">
                    <VoiceWaveformBars barClassName="bg-gradient-to-t from-purple-400 to-indigo-400" />
                  </div>
                  <span className="text-[11px] font-semibold tracking-wider text-purple-600 dark:text-purple-300 uppercase">
                    {isProcessing ? t('roundtable.processing') : t('roundtable.listening')}
                  </span>
                  {/* Mic button */}
                  <button
                    type="button"
                    aria-label={
                      isRecording ? t('roundtable.stopRecording') : t('roundtable.startRecording')
                    }
                    className="relative group cursor-pointer bg-transparent border-none p-0"
                    onClick={handleToggleVoice}
                  >
                    <div className="relative w-12 h-12 rounded-full bg-gradient-to-br from-purple-600 to-indigo-700 shadow-[0_4px_20px_rgba(147,51,234,0.3)] flex items-center justify-center group-hover:scale-105 transition-transform duration-300 border border-white/20">
                      <Mic className="w-5 h-5 text-white" />
                    </div>
                    <div className="absolute inset-0 rounded-full border-2 border-purple-500 opacity-40 animate-[ping_2s_ease-in-out_infinite]" />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* "Your turn" cue prompt — clickable, opens input panel */}
          <AnimatePresence>
            {isCueUser && !bubbleRole && !thinkingState && !isInputOpen && !isVoiceOpen && (
              <motion.div
                key="presentation-cue-user"
                initial={{ opacity: 0, scale: 0.92, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.92, y: 8 }}
                transition={{ duration: 0.22, ease: [0.21, 1, 0.36, 1] }}
                className="pointer-events-auto"
              >
                <button
                  onClick={() => (asrEnabled ? handleToggleVoice() : handleToggleInput())}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/70 dark:bg-black/50 backdrop-blur-xl border border-amber-400/50 dark:border-amber-500/50 shadow-[0_0_16px_rgba(245,158,11,0.2),0_8px_32px_rgba(0,0,0,0.06)] dark:shadow-[0_0_16px_rgba(245,158,11,0.25),0_8px_32px_rgba(0,0,0,0.4)] text-amber-600 dark:text-amber-400 text-sm font-semibold tracking-wide hover:bg-gray-100/80 dark:hover:bg-black/60 hover:border-amber-500/70 dark:hover:border-amber-400/70 hover:shadow-[0_0_24px_rgba(245,158,11,0.25)] dark:hover:shadow-[0_0_24px_rgba(245,158,11,0.35)] transition-all active:scale-95 animate-pulse"
                >
                  {asrEnabled ? <Mic className="w-4 h-4" /> : <MessageSquare className="w-4 h-4" />}
                  {t('roundtable.yourTurn')}
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Director thinking indicator — single spinner */}
          <AnimatePresence>
            {thinkingState?.stage === 'director' && !currentSpeech && !userMessage && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="flex items-center justify-center p-2"
              >
                <Loader2 className="w-6 h-6 text-[#ffc55a] animate-spin" />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── Right-side stack: bubble + dock — flex column, no hardcoded px ── */}
        <div
          className="fixed bottom-5 z-[48] flex flex-col items-end gap-3 pointer-events-none transition-[right] duration-300"
          style={{ right: chatCollapsed ? 20 : 20 + (chatAreaWidth ?? 320) }}
        >
          {/* Right-side speech bubble (flows above dock via flex) */}
          <PresentationSpeechOverlay
            playbackView={enrichedPlaybackView}
            participants={initialParticipants}
            speakingAgentId={speakingAgentId ?? null}
            isTopicPending={!!isTopicPending}
            userAvatar={userAvatar}
            side="right"
            onBubbleClick={handlePresentationBubbleClick}
            audioIndicatorState={audioIndicatorState ?? 'idle'}
            buttonState={enrichedPlaybackView?.buttonState}
            isPaused={isDiscussionPaused || engineMode === 'paused'}
          />

          {/* Dock */}
          <AnimatePresence>
            {showPresentationDock && (
              <motion.div
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.92 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="pointer-events-auto"
              >
                <div
                  ref={presentationActionAnchorRef}
                  className="flex items-center gap-2.5 rounded-full bg-white/70 dark:bg-black/60 backdrop-blur-xl border border-gray-200/60 dark:border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.08)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.4)] px-2.5 py-2"
                >
                  {/* Anchor for the discussion ProactiveCard (avatar removed) */}
                  <div ref={presentationAgentAvatarRef} className="w-0 h-0" />
                  {isSendCooldown ? (
                    <div className="flex items-center justify-center w-8 h-8">
                      <div className="flex items-center gap-[3px]">
                        {[0, 1, 2].map((i) => (
                          <motion.div
                            key={i}
                            animate={{ y: [0, -3, 0], opacity: [0.35, 0.9, 0.35] }}
                            transition={{
                              repeat: Infinity,
                              duration: 0.9,
                              delay: i * 0.12,
                              ease: 'easeInOut',
                            }}
                            className="w-[3px] h-[3px] rounded-full bg-purple-400"
                          />
                        ))}
                      </div>
                    </div>
                  ) : (
                    <>
                      <button
                        aria-label={
                          asrEnabled
                            ? t('roundtable.voiceInput')
                            : t('roundtable.voiceInputDisabled')
                        }
                        onClick={(e) => {
                          e.stopPropagation();
                          if (asrEnabled) handleToggleVoice();
                        }}
                        disabled={!asrEnabled}
                        className={cn(
                          'w-8 h-8 rounded-full flex items-center justify-center transition-all active:scale-95',
                          !asrEnabled
                            ? 'text-gray-500 cursor-not-allowed'
                            : isVoiceOpen
                              ? 'bg-purple-600 text-white'
                              : 'text-gray-500 dark:text-gray-300 hover:text-gray-700 dark:hover:text-white hover:bg-gray-200/50 dark:hover:bg-white/10',
                        )}
                      >
                        {asrEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                      </button>
                      <button
                        aria-label={t('roundtable.textInput')}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleInput();
                        }}
                        className={cn(
                          'w-8 h-8 rounded-full flex items-center justify-center transition-all active:scale-95',
                          isInputOpen
                            ? 'bg-purple-600 text-white'
                            : 'text-gray-500 dark:text-gray-300 hover:text-gray-700 dark:hover:text-white hover:bg-gray-200/50 dark:hover:bg-white/10',
                        )}
                      >
                        <MessageSquare className="w-4 h-4" />
                      </button>
                    </>
                  )}

                </div>

                <AnimatePresence>
                  {discussionRequest && (
                    <ProactiveCard
                      action={discussionRequest}
                      mode={engineMode === 'paused' ? 'paused' : 'playback'}
                      anchorRef={presentationAgentAvatarRef}
                      portalContainer={fullscreenContainerRef?.current}
                      align="left"
                      agentName={
                        presentationDiscussionParticipant?.name ||
                        presentationDiscussionAgentConfig?.name
                      }
                      agentAvatar={
                        presentationDiscussionParticipant?.avatar ||
                        presentationDiscussionAgentConfig?.avatar
                      }
                      agentColor={presentationDiscussionAgentConfig?.color}
                      onSkip={() => onDiscussionSkip?.()}
                      onListen={() => onDiscussionStart?.(discussionRequest)}
                      onTogglePause={() => onPlayPause?.()}
                    />
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'h-[112px] w-full flex flex-col relative z-10 transition-all duration-300',
        isPresenting && !controlsVisible
          ? 'border-t border-transparent bg-transparent backdrop-blur-none'
          : 'border-t border-[rgba(255,197,90,0.18)] bg-[rgba(8,13,26,0.82)] backdrop-blur-md',
      )}
    >
      {/* ── Toolbar strip — merged from CanvasArea ── */}
      <div
        className={cn(
          'transition-opacity duration-300',
          isPresenting && !controlsVisible && 'opacity-0 pointer-events-none',
        )}
      >
        {toolbar}
      </div>
      {/* ── Interaction area — three-column layout ── */}
      <div className="flex-1 flex items-stretch min-h-0">
        {/* Center: Subtitle / interaction stage */}
        <div className="flex-1 relative mx-3 mb-2">
          {/* End flash banner (Issue 3) */}
          <AnimatePresence>
            {endFlashVisible && (
              <motion.div
                initial={{ opacity: 0, y: -10, scale: 0.9 }}
                animate={{
                  opacity: [0, 1, 1, 0],
                  y: [-10, 0, 0, -6],
                  scale: [0.9, 1, 1, 0.95],
                }}
                transition={{
                  duration: 1.8,
                  times: [0, 0.15, 0.7, 1],
                  ease: 'easeOut',
                }}
                className="absolute top-1 left-1/2 -translate-x-1/2 z-50 bg-gray-800/80 backdrop-blur-md text-white px-3.5 py-1.5 rounded-full text-xs font-medium pointer-events-none"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-gray-400 inline-block mr-1.5" />
                {endFlashSessionType === 'discussion'
                  ? t('roundtable.discussionEnded')
                  : t('roundtable.qaEnded')}
              </motion.div>
            )}
          </AnimatePresence>

          <div
            onClick={() => {
              if (isInputOpen || isVoiceOpen) {
                setIsInputOpen(false);
                setIsVoiceOpen(false);
                if (isRecording || isProcessing) cancelRecording();
              }
            }}
            className="relative w-full h-full flex flex-col justify-center px-6 overflow-hidden group transition-all duration-700 cursor-default"
          >
            {/* Text input box */}
            <AnimatePresence>
              {isInputOpen && (
                <motion.div
                  key="input-stage"
                  initial={{
                    opacity: 0,
                    scale: 0.95,
                    y: 15,
                    filter: 'blur(4px)',
                  }}
                  animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, scale: 0.95, y: 15, filter: 'blur(4px)' }}
                  onClick={(e) => e.stopPropagation()}
                  className="absolute inset-x-6 bottom-4 z-20 flex items-center justify-end"
                >
                  <div className="relative w-fit max-w-[85%] sm:max-w-[65%] min-w-[200px] sm:min-w-[300px] bg-white/90 dark:bg-gray-800/90 backdrop-blur-md p-2 pr-2 rounded-2xl rounded-br-none shadow-2xl border border-purple-200 dark:border-purple-700 flex items-end gap-2 ring-1 ring-purple-100/50 dark:ring-purple-800/50">
                    <div className="pl-4 flex-1 py-1 min-w-0">
                      <textarea
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                            e.preventDefault();
                            handleSendMessage();
                          }
                        }}
                        placeholder={t('roundtable.inputPlaceholder')}
                        autoFocus
                        rows={1}
                        className="w-full resize-none bg-transparent border-none focus:ring-0 focus:outline-none outline-none shadow-none ring-0 text-gray-700 dark:text-gray-200 text-sm placeholder:text-gray-400 dark:placeholder:text-gray-500 min-h-[40px] max-h-[120px]"
                        style={{ fieldSizing: 'content' } as Record<string, string>}
                      />
                    </div>
                    <button
                      onClick={handleSendMessage}
                      disabled={isSendCooldown}
                      className={cn(
                        'p-2.5 text-white rounded-xl transition shadow-md mb-0.5 shrink-0',
                        isSendCooldown
                          ? 'bg-gray-400 dark:bg-gray-600 cursor-not-allowed shadow-gray-200 dark:shadow-gray-900/50'
                          : 'bg-purple-600 hover:bg-purple-700 dark:bg-purple-500 dark:hover:bg-purple-600 shadow-purple-200 dark:shadow-purple-900/50',
                      )}
                    >
                      {isSendCooldown ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </motion.div>
              )}

              {/* Audio recording status */}
              {isVoiceOpen && (
                <motion.div
                  key="voice-stage"
                  initial={{
                    opacity: 0,
                    scale: 0.9,
                    x: 20,
                    filter: 'blur(4px)',
                  }}
                  animate={{ opacity: 1, scale: 1, x: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, scale: 0.9, x: 20, filter: 'blur(4px)' }}
                  onClick={(e) => e.stopPropagation()}
                  className="absolute right-4 top-1/2 -translate-y-1/2 z-30 flex items-center gap-4 pr-2 pointer-events-none"
                >
                  <div className="flex flex-col-reverse items-end gap-1 mr-[-10px] relative z-20">
                    <div className="flex items-center gap-0.5 h-8 px-2 py-1.5 bg-white/80 dark:bg-gray-800/80 backdrop-blur-md rounded-xl border border-purple-100 dark:border-purple-800 shadow-sm">
                      <VoiceWaveformBars barClassName="bg-gradient-to-t from-purple-500 to-indigo-600 dark:from-purple-400 dark:to-indigo-500" />
                    </div>
                    <motion.div
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="text-[10px] font-bold tracking-widest text-purple-600 dark:text-purple-400 uppercase bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm px-2 py-0.5 rounded-full shadow-sm border border-purple-100/50 dark:border-purple-800/50 mr-1"
                    >
                      {isProcessing ? t('roundtable.processing') : t('roundtable.listening')}
                    </motion.div>
                  </div>

                  <div
                    className="pointer-events-auto relative group cursor-pointer"
                    onClick={handleToggleVoice}
                  >
                    <div className="relative w-16 h-16 rounded-full bg-gradient-to-br from-purple-600 to-indigo-700 dark:from-purple-500 dark:to-indigo-600 shadow-[0_4px_20px_rgba(147,51,234,0.3)] flex items-center justify-center z-20 group-hover:scale-105 transition-transform duration-300 border border-white/20 dark:border-white/10">
                      <Mic className="w-6 h-6 text-white" />
                    </div>
                    <div className="absolute inset-0 rounded-full border-2 border-purple-500 dark:border-purple-400 opacity-40 animate-[ping_2s_ease-in-out_infinite] z-10" />
                    <div className="absolute inset-0 rounded-full border border-indigo-400 dark:border-indigo-300 opacity-20 animate-[ping_3s_ease-in-out_infinite_0.5s] z-10" />
                    <div className="absolute inset-0 bg-purple-600 dark:bg-purple-500 blur-2xl opacity-20 group-hover:opacity-40 transition-opacity z-0" />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Thinking indicator (Issue 5) — single spinner */}
            <AnimatePresence>
              {thinkingState?.stage === 'director' && !currentSpeech && !userMessage && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 flex items-center justify-center"
                >
                  <Loader2 className="w-6 h-6 text-[#ffc55a] animate-spin" />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Cue user: centered indicator when waiting for user input */}
            <AnimatePresence>
              {isCueUser && !bubbleRole && !thinkingState && !isInputOpen && !isVoiceOpen && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.85 }}
                  transition={{ duration: 0.35, ease: [0.21, 1, 0.36, 1] }}
                  className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 flex flex-col items-center gap-2.5"
                >
                  {/* Button with ripple effect */}
                  <div className="relative flex items-center justify-center">
                    {/* Soft background glow */}
                    <div
                      className={cn(
                        'absolute w-24 h-24 rounded-full blur-2xl',
                        asrEnabled
                          ? 'bg-amber-400/[0.08] dark:bg-amber-500/[0.06]'
                          : 'bg-purple-400/[0.08] dark:bg-purple-500/[0.06]',
                      )}
                    />

                    {/* Expanding ripple 1 */}
                    <motion.div
                      animate={{ scale: [1, 2.2], opacity: [0.25, 0] }}
                      transition={{
                        repeat: Infinity,
                        duration: 2.2,
                        ease: 'easeOut',
                      }}
                      className={cn(
                        'absolute w-11 h-11 rounded-full border',
                        asrEnabled
                          ? 'border-amber-400/50 dark:border-amber-500/35'
                          : 'border-purple-400/50 dark:border-purple-500/35',
                      )}
                    />
                    {/* Expanding ripple 2 */}
                    <motion.div
                      animate={{ scale: [1, 2.2], opacity: [0.25, 0] }}
                      transition={{
                        repeat: Infinity,
                        duration: 2.2,
                        ease: 'easeOut',
                        delay: 0.7,
                      }}
                      className={cn(
                        'absolute w-11 h-11 rounded-full border',
                        asrEnabled
                          ? 'border-amber-300/40 dark:border-amber-400/25'
                          : 'border-purple-300/40 dark:border-purple-400/25',
                      )}
                    />

                    {/* Action circle — voice (ASR on) or text input (ASR off) */}
                    <motion.button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (asrEnabled) handleToggleVoice();
                        else handleToggleInput();
                      }}
                      animate={{ scale: [1, 1.05, 1] }}
                      transition={{
                        repeat: Infinity,
                        duration: 2,
                        ease: 'easeInOut',
                      }}
                      className={cn(
                        'relative w-11 h-11 rounded-full flex items-center justify-center shadow-lg cursor-pointer hover:shadow-xl active:scale-95 z-10 bg-gradient-to-br',
                        asrEnabled
                          ? 'from-amber-400 to-orange-500 dark:from-amber-500 dark:to-orange-600 shadow-amber-400/30 dark:shadow-amber-600/20 hover:shadow-amber-400/40 dark:hover:shadow-amber-600/30'
                          : 'from-purple-400 to-indigo-500 dark:from-purple-500 dark:to-indigo-600 shadow-purple-400/30 dark:shadow-purple-600/20 hover:shadow-purple-400/40 dark:hover:shadow-purple-600/30',
                      )}
                    >
                      {asrEnabled ? (
                        <Mic className="w-[18px] h-[18px] text-white drop-shadow-sm" />
                      ) : (
                        <MessageSquare className="w-[18px] h-[18px] text-white drop-shadow-sm" />
                      )}
                    </motion.button>
                  </div>

                  {/* Visual indicator below button */}
                  {asrEnabled ? (
                    <div className="flex items-center justify-center gap-[3px] h-3">
                      {[0, 1, 2, 3, 4, 3, 2, 1, 0].map((intensity, i) => (
                        <motion.div
                          key={i}
                          animate={{
                            scaleY: [0.3, 0.5 + intensity * 0.15, 0.3],
                            opacity: [0.3, 0.7, 0.3],
                          }}
                          transition={{
                            repeat: Infinity,
                            duration: 0.8 + (i % 3) * 0.1,
                            delay: i * 0.08,
                            ease: 'easeInOut',
                          }}
                          className="w-[2.5px] h-full origin-center rounded-full bg-amber-400/70 dark:bg-amber-500/60"
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-[3px] h-3">
                      {[0, 1, 2, 3, 2, 1, 0].map((intensity, i) => (
                        <motion.div
                          key={i}
                          animate={{
                            scaleY: [0.3, 0.45 + intensity * 0.15, 0.3],
                            opacity: [0.25, 0.6, 0.25],
                          }}
                          transition={{
                            repeat: Infinity,
                            duration: 1.0 + (i % 3) * 0.15,
                            delay: i * 0.12,
                            ease: 'easeInOut',
                          }}
                          className="w-[2.5px] h-full origin-center rounded-full bg-purple-400/60 dark:bg-purple-500/50"
                        />
                      ))}
                    </div>
                  )}

                  {/* Label */}
                  <motion.span
                    animate={{ opacity: [0.5, 0.9, 0.5] }}
                    transition={{
                      repeat: Infinity,
                      duration: 2.5,
                      ease: 'easeInOut',
                    }}
                    className={cn(
                      'text-[10px] font-medium tracking-wider',
                      asrEnabled
                        ? 'text-amber-600/70 dark:text-amber-400/60'
                        : 'text-purple-600/70 dark:text-purple-400/60',
                    )}
                  >
                    {t('roundtable.yourTurn')}
                  </motion.span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Chat bubble */}
            <AnimatePresence mode="wait">
              {bubbleRole && (
                <motion.div
                  key={bubbleKey}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{
                    opacity: isInputOpen || isVoiceOpen ? 0.4 : 1,
                    y: 0,
                    filter: isInputOpen || isVoiceOpen ? 'blur(1px) grayscale(0.2)' : 'none',
                  }}
                  exit={{ opacity: 0, y: -8, transition: { duration: 0.12 } }}
                  transition={{ duration: 0.2, ease: [0.21, 1, 0.36, 1] }}
                  className="w-full flex items-center justify-center relative z-10"
                >
                  {/* Boxless, centered caption — two lines max, like video subtitles */}
                  <div ref={bubbleScrollRef} className="w-full max-w-[80%] text-center">
                    {isBubbleLoading ? (
                      <div className="flex justify-center py-1">
                        <Loader2 className="w-5 h-5 text-[#ffc55a] animate-spin" />
                      </div>
                    ) : (
                      <p
                        className="text-[17px] leading-snug text-[#fff4dc] line-clamp-2 whitespace-pre-wrap break-words [text-shadow:_0_2px_10px_rgba(0,0,0,0.85)]"
                        suppressHydrationWarning
                      >
                        {sourceText}
                        {isTopicPending && (
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 ml-1 align-middle" />
                        )}
                      </p>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Right: minimal interaction controls — avatars & roster removed */}
        <div
          className={cn(
            'shrink-0 flex flex-col items-center justify-center gap-2 pr-4 pl-2 transition-opacity duration-300',
            isPresenting && !controlsVisible && 'opacity-0 pointer-events-none',
          )}
        >
          {isSendCooldown ? (
            <Loader2 className="w-5 h-5 text-[#ffc55a] animate-spin" />
          ) : (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (asrEnabled) handleToggleVoice();
                }}
                disabled={!asrEnabled}
                aria-label={
                  asrEnabled ? t('roundtable.voiceInput') : t('roundtable.voiceInputDisabled')
                }
                className={cn(
                  'w-9 h-9 rounded-full border flex items-center justify-center transition-all active:scale-95 shadow-sm',
                  !asrEnabled
                    ? 'bg-[rgba(255,255,255,0.04)] text-[rgba(198,208,223,0.3)] border-[rgba(255,197,90,0.12)] cursor-not-allowed'
                    : isVoiceOpen
                      ? 'bg-[rgba(255,197,90,0.14)] border-[#ffc55a] text-[#ffc55a]'
                      : 'bg-[rgba(8,13,26,0.8)] border-[rgba(255,197,90,0.25)] text-[rgba(198,208,223,0.6)] hover:bg-[rgba(255,197,90,0.08)] hover:text-[#ffc55a] hover:border-[rgba(255,197,90,0.5)]',
                )}
              >
                {asrEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleInput();
                }}
                aria-label={t('roundtable.textInput')}
                className={cn(
                  'w-9 h-9 rounded-full border flex items-center justify-center transition-all active:scale-95 shadow-sm',
                  isInputOpen
                    ? 'bg-[rgba(255,197,90,0.14)] border-[#ffc55a] text-[#ffc55a]'
                    : 'bg-[rgba(8,13,26,0.8)] border-[rgba(255,197,90,0.25)] text-[rgba(198,208,223,0.6)] hover:bg-[rgba(255,197,90,0.08)] hover:text-[#ffc55a] hover:border-[rgba(255,197,90,0.5)]',
                )}
              >
                <MessageSquare className="w-4 h-4" />
              </button>
            </>
          )}
        </div>

      </div>
      {/* close interaction row */}
    </div>
  );
}
