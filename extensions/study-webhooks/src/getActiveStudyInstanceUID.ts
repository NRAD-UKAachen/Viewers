import { Types } from '@ohif/core';

/**
 * Reads the StudyInstanceUID of the study loaded in the active viewport, or
 * undefined when there isn't one yet. Shared by the command module (to know
 * which study a webhook fires against) and the dropdown UI (to know which
 * study's series to offer, and whether the patient has more than one study).
 *
 * The empty-viewport case has to be handled here rather than left to the
 * caller: displaySetService.getDisplaySetByUID *throws* on a non-string UID
 * rather than returning undefined, so without the guard below every caller
 * that can run before the viewport has its display sets -- which is any
 * caller during a render, not just the click handlers this started out
 * serving -- takes down the whole viewer with a black screen.
 */
export const getActiveStudyInstanceUID = (
  servicesManager: Types.Extensions.ExtensionParams['servicesManager']
): string | undefined => {
  const { viewportGridService, displaySetService } = servicesManager.services;
  const activeViewportId = viewportGridService.getActiveViewportId();
  const { viewports } = viewportGridService.getState();
  const activeViewport = viewports.get(activeViewportId);
  const [displaySetInstanceUID] = activeViewport?.displaySetInstanceUIDs ?? [];
  if (typeof displaySetInstanceUID !== 'string') {
    return undefined;
  }

  const displaySet = displaySetService.getDisplaySetByUID(displaySetInstanceUID);
  return displaySet?.StudyInstanceUID;
};
