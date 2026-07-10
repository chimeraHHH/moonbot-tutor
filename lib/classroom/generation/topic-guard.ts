import type { SceneOutline } from '@/lib/types/generation';
import type { PPTElement } from '@openmaic/dsl';

const CHINESE_REQUEST_NOISE =
  /我想(?:要)?(?:学习|了解|知道)|想(?:要)?(?:学习|了解|知道)|希望(?:学习|了解)|请|麻烦|可以|能不能|给我|为我|讲一讲|讲讲|讲解|介绍|说明|一下|关于|有关|的故事|这个故事|课程|一堂课|(?:用|通过|以)动画(?:的?形式)?(?:来)?/g;
const ENGLISH_REQUEST_NOISE =
  /\b(please|could you|can you|tell me|teach me|explain|introduce|a lesson|about|the story of)\b/gi;

function normalize(value: string): string {
  return value.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
}

export function buildAuthoritativeTopicInstruction(topic: string): string {
  const boundedTopic = topic.replace(/\s+/g, ' ').trim().slice(0, 500);
  return [
    '# Authoritative course topic',
    `The course topic is the user-provided text ${JSON.stringify(boundedTopic)}.`,
    'Generate every outline for this topic only.',
    'Topics in schema examples or design guidelines are examples, not the requested course.',
    'Do not substitute any example topic.',
  ].join('\n');
}

export function extractTopicKeyword(topic: string): string {
  const withoutNoise = topic.replace(CHINESE_REQUEST_NOISE, '').replace(ENGLISH_REQUEST_NOISE, '');
  return normalize(withoutNoise) || normalize(topic);
}

function topicFragments(topic: string): string[] {
  const keyword = extractTopicKeyword(topic);
  if (!keyword) return [];
  if (/^[\p{Script=Han}]+$/u.test(keyword)) {
    if (keyword.length <= 4) return [keyword];
    const fragments = new Set<string>();
    for (let index = 0; index <= keyword.length - 4; index++) {
      fragments.add(keyword.slice(index, index + 4));
    }
    return [...fragments];
  }
  return keyword.split(/[^\p{L}\p{N}]+/u).filter((part) => part.length >= 3);
}

export function outlinesMatchTopic(
  topic: string,
  outlines: SceneOutline[],
  courseTitle?: string,
): boolean {
  const fragments = topicFragments(topic);
  if (fragments.length === 0) return false;
  const candidate = normalize(
    [
      courseTitle,
      ...outlines.flatMap((outline) => [outline.title, outline.description, ...outline.keyPoints]),
    ]
      .filter(Boolean)
      .join(' '),
  );
  return fragments.some((fragment) => candidate.includes(normalize(fragment)));
}

// The outline prompts contain one concrete, fully-populated JSON example for
// projectile motion. That example has previously leaked into model output, so
// keep a narrow server-side rejection for it. A general lexical-overlap gate is
// too aggressive: requests such as "make a PPT from the uploaded document"
// legitimately produce titles that do not repeat any words from the request.
const PROMPT_EXAMPLE_TOPICS = ['projectilemotion', '抛体运动'];

export function outlinesLookLikePromptExampleDrift(
  topic: string,
  outlines: SceneOutline[],
  courseTitle?: string,
): boolean {
  if (outlinesMatchTopic(topic, outlines, courseTitle)) return false;

  const normalizedTopic = normalize(topic);
  const candidate = normalize(
    [
      courseTitle,
      ...outlines.flatMap((outline) => [outline.title, outline.description, ...outline.keyPoints]),
    ]
      .filter(Boolean)
      .join(' '),
  );

  return PROMPT_EXAMPLE_TOPICS.some(
    (exampleTopic) => candidate.includes(exampleTopic) && !normalizedTopic.includes(exampleTopic),
  );
}

const PROMPT_LEAK_MARKERS = [
  'slide content design principles',
  'slide content philosophy',
  'on the slide',
  'off the slide',
  'what belongs on the slide',
  'what does not belong on the slide',
];

function elementText(element: PPTElement): string {
  const record = element as unknown as Record<string, unknown>;
  return [record.content, record.text, record.alt, record.name]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .replace(/<[^>]+>/g, ' ');
}

export function slideContentLooksLikePromptLeak(elements: PPTElement[]): boolean {
  const text = elements.map(elementText).join(' ').toLowerCase();
  return PROMPT_LEAK_MARKERS.filter((marker) => text.includes(marker)).length >= 2;
}

export function actionTextLooksLikeMissingContext(text: string): boolean {
  return /(?:i(?:'m| am) ready to generate).*(?:need|missing).*(?:slide|details)|i need the slide details first/i.test(
    text,
  );
}
