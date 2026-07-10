interface OrderedItem {
  id: string;
  order: number;
}

export interface PendingPlaybackState {
  isCourseComplete: boolean;
  isGenerationFailed: boolean;
  canAdvanceToPendingSlot: boolean;
}

export function derivePendingPlaybackState(input: {
  outlines: OrderedItem[];
  scenes: OrderedItem[];
  generatingOutlines: OrderedItem[];
  failedOutlineIds: Iterable<string>;
  generationComplete: boolean;
}): PendingPlaybackState {
  const materializedOrders = new Set(input.scenes.map((scene) => scene.order));
  const allMaterialized =
    input.outlines.length > 0 &&
    input.outlines.every((outline) => materializedOrders.has(outline.order));
  const isCourseComplete =
    input.generationComplete || (allMaterialized && input.generatingOutlines.length === 0);
  const firstPending = input.generatingOutlines[0];
  const failedIds = new Set(input.failedOutlineIds);
  const isGenerationFailed = Boolean(firstPending && failedIds.has(firstPending.id));

  return {
    isCourseComplete,
    isGenerationFailed,
    canAdvanceToPendingSlot:
      input.generatingOutlines.length > 0 || isCourseComplete || isGenerationFailed,
  };
}
