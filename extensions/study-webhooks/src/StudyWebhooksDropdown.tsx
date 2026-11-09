import React from 'react';
import {
  Button,
  Icons,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@ohif/ui-next';
import { useToolbar, useSystem } from '@ohif/core';
import { StudyWebhookEntry, StudyWebhookFunction, isStudyWebhookGroup } from './types';
import { getActiveStudyInstanceUID } from './getActiveStudyInstanceUID';
import { SeriesSelectionModal } from './SeriesSelectionModal';
import { LDCTSimulationModal, LDCTSimulationParams } from './LDCTSimulationModal';
import { getPatientSeriesOptions } from './getPatientSeriesOptions';
import { countPatientStudiesWithModality } from './countPatientStudiesWithModality';

/** Modality a `requiresMultipleStudies` entry is counted against: its first
 * declared one, or MR when it declares none. */
const entryModality = (entry: StudyWebhookFunction) => entry.modalities?.[0] ?? 'MR';

const countKey = (studyInstanceUID: string, modality: string) =>
  `${studyInstanceUID}|${modality}`;

interface StudyWebhooksDropdownProps {
  id: string;
  icon?: string;
  label?: string;
  tooltip?: string;
  buttonSection: string;
  tree: StudyWebhookEntry[];
}

/**
 * Renders `tree` (which may contain arbitrarily nested groups) as a dropdown
 * with true flyout submenus. Each leaf entry's display props (icon, label,
 * disabled state, commands) are looked up from the flat button list that
 * `buttonSection` holds in the toolbarService, so evaluate/interaction logic
 * stays identical to a regular `ohif.toolButton`.
 */
export default function StudyWebhooksDropdown({
  icon,
  tooltip,
  buttonSection,
  tree,
}: StudyWebhooksDropdownProps) {
  const { onInteraction, toolbarButtons } = useToolbar({ buttonSection });
  const { servicesManager, commandsManager, extensionManager } = useSystem();

  // "<StudyInstanceUID>|<modality>" -> how many of that patient's studies
  // carry that modality. Cached because the toolbar stays mounted for the
  // whole session and the answer cannot change while a study is open.
  const [patientStudyCounts, setPatientStudyCounts] = React.useState<Record<string, number>>({});
  // Keys already requested, so a re-render or a second dropdown open does not
  // fire the same QIDO pair again. A failed lookup is removed so the next open
  // retries it.
  const requestedCounts = React.useRef<Set<string>>(new Set());

  // Every modality the tree's `requiresMultipleStudies` entries are counted
  // against -- normally just 'MR', but keyed per modality so two such entries
  // cannot silently share one another's count.
  const countedModalities = React.useMemo(() => {
    const modalities = new Set<string>();
    const walk = (entries: StudyWebhookEntry[]) => {
      for (const entry of entries) {
        if (isStudyWebhookGroup(entry)) {
          walk(entry.items);
        } else if (entry.requiresMultipleStudies) {
          modalities.add(entryModality(entry));
        }
      }
    };
    walk(tree);
    return modalities;
  }, [tree]);

  // The active study is held in state and refreshed from viewportGridService's
  // own events rather than read during render: a render-time read is not
  // reactive, so nothing would re-run once the viewport finally gets its
  // display sets, and the eager count below would only ever see the empty
  // viewport the toolbar first mounts against.
  const [activeStudyInstanceUID, setActiveStudyInstanceUID] = React.useState<string>();

  React.useEffect(() => {
    const { viewportGridService } = servicesManager.services;
    const sync = () => setActiveStudyInstanceUID(getActiveStudyInstanceUID(servicesManager));
    sync();

    const subscriptions = [
      viewportGridService.subscribe(viewportGridService.EVENTS.VIEWPORTS_READY, sync),
      viewportGridService.subscribe(viewportGridService.EVENTS.ACTIVE_VIEWPORT_ID_CHANGED, sync),
      viewportGridService.subscribe(viewportGridService.EVENTS.GRID_STATE_CHANGED, sync),
    ];
    return () => subscriptions.forEach(subscription => subscription.unsubscribe());
  }, [servicesManager]);

  // Run eagerly as soon as the active study is known, so the menu never has to
  // render an entry it is about to remove. The dropdown's own onOpenChange
  // calls this too: cached keys make a repeat call free, and a lookup that
  // failed drops its key, so re-opening the menu retries it.
  const ensurePatientStudyCounts = React.useCallback(() => {
    if (!activeStudyInstanceUID) {
      return;
    }
    for (const modality of countedModalities) {
      const key = countKey(activeStudyInstanceUID, modality);
      if (requestedCounts.current.has(key)) {
        continue;
      }
      requestedCounts.current.add(key);
      countPatientStudiesWithModality(extensionManager, activeStudyInstanceUID, modality)
        .then(count => setPatientStudyCounts(current => ({ ...current, [key]: count })))
        .catch(error => {
          // Fail open: leave the entry visible and let the API report why it
          // cannot run, rather than hiding a pipeline over a QIDO hiccup.
          console.warn("[study-webhooks] could not count the patient's studies:", error);
          requestedCounts.current.delete(key);
        });
    }
  }, [activeStudyInstanceUID, countedModalities, extensionManager]);

  React.useEffect(() => {
    ensurePatientStudyCounts();
  }, [ensurePatientStudyCounts]);

  if (!toolbarButtons?.length) {
    return null;
  }

  const buttonsById = new Map(toolbarButtons.map(button => [button.id, button.componentProps]));

  // Shared preamble for the entries that open a dialog instead of firing
  // immediately: resolve the active study and load every series across all of
  // the patient's studies (not just the active one -- e.g. so a prior PET can
  // be picked as a co-registration moving series). Returns undefined after
  // showing the appropriate toast if either step can't be done.
  const loadSeriesOptions = async (fn: StudyWebhookFunction) => {
    const { uiNotificationService } = servicesManager.services;
    const studyInstanceUID = getActiveStudyInstanceUID(servicesManager);

    if (!studyInstanceUID) {
      uiNotificationService?.show({
        title: fn.label,
        message: 'No active study to send.',
        type: 'warning',
      });
      return undefined;
    }

    try {
      return await getPatientSeriesOptions(extensionManager, studyInstanceUID);
    } catch (error) {
      console.error(`[study-webhooks] could not load series for "${fn.id}":`, error);
      uiNotificationService?.show({
        title: fn.label,
        message: `Could not load series: ${error instanceof Error ? error.message : error}`,
        type: 'error',
      });
      return undefined;
    }
  };

  // Used by entries with `requiresSeriesSelection` (e.g. co-registration):
  // instead of firing the webhook immediately, let the user pick a center +
  // moving series before running the command themselves.
  const openSeriesSelectionModal = async (fn: StudyWebhookFunction) => {
    const { uiModalService, uiNotificationService } = servicesManager.services;

    const seriesOptions = await loadSeriesOptions(fn);
    if (!seriesOptions) {
      return;
    }

    if (!seriesOptions.some(s => s.isCenterEligible)) {
      uiNotificationService?.show({
        title: fn.label,
        message: 'The active study has no series to use as the center series.',
        type: 'warning',
      });
      return;
    }

    if (seriesOptions.length < 2) {
      uiNotificationService?.show({
        title: fn.label,
        message: 'Need at least two series (across this study and any prior studies) to co-register.',
        type: 'warning',
      });
      return;
    }

    uiModalService.show({
      title: fn.label,
      content: SeriesSelectionModal,
      containerClassName: 'max-w-2xl',
      contentProps: {
        series: seriesOptions,
        onConfirm: ({
          centerSeriesUID,
          movingSeries,
        }: {
          centerSeriesUID: string;
          movingSeries: { studyInstanceUID: string; seriesInstanceUID: string }[];
        }) => {
          commandsManager.run('sendStudyWebhook', {
            functionId: fn.id,
            body: { centerSeriesUID, movingSeries },
          });
        },
      },
    });
  };

  // Used by entries with `requiresLdctParameters` (low-dose CT simulation):
  // the pipeline runs on one CT series of the *active* study and needs its
  // parameters up front, so offer only that study's CT series and collect the
  // rest of the settings before running the command.
  const openLdctSimulationModal = async (fn: StudyWebhookFunction) => {
    const { uiModalService, uiNotificationService } = servicesManager.services;

    const seriesOptions = await loadSeriesOptions(fn);
    if (!seriesOptions) {
      return;
    }

    // isCenterEligible marks series belonging to the active study -- results
    // are uploaded there, so a prior study's CT is not a valid source.
    const ctSeries = seriesOptions.filter(s => s.isCenterEligible && s.modality === 'CT');

    if (!ctSeries.length) {
      uiNotificationService?.show({
        title: fn.label,
        message: 'The active study has no CT series to simulate a low-dose acquisition of.',
        type: 'warning',
      });
      return;
    }

    uiModalService.show({
      title: fn.label,
      content: LDCTSimulationModal,
      containerClassName: 'max-w-2xl',
      contentProps: {
        series: ctSeries,
        onConfirm: (params: LDCTSimulationParams) => {
          commandsManager.run('sendStudyWebhook', { functionId: fn.id, body: params });
        },
      },
    });
  };

  const renderEntry = (entry: StudyWebhookEntry) => {
    if (isStudyWebhookGroup(entry)) {
      const children = entry.items.map(renderEntry).filter(Boolean);
      if (!children.length) {
        return null;
      }

      return (
        <DropdownMenuSub key={entry.id}>
          <DropdownMenuSubTrigger className="flex items-center space-x-2">
            {entry.icon && (
              <Icons.ByName
                name={entry.icon}
                className="h-6 w-6"
              />
            )}
            <span>{entry.label}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>{children}</DropdownMenuSubContent>
        </DropdownMenuSub>
      );
    }

    const buttonId = `StudyWebhook-${entry.id}`;
    const props = buttonsById.get(buttonId);

    if (!props || props.visible === false) {
      return null;
    }

    // Only hide once the count is known to be too low; an unresolved or
    // failed lookup leaves the entry in place (see requiresMultipleStudies).
    if (entry.requiresMultipleStudies && activeStudyInstanceUID) {
      const count = patientStudyCounts[countKey(activeStudyInstanceUID, entryModality(entry))];
      if (count !== undefined && count < 2) {
        return null;
      }
    }

    return (
      <DropdownMenuItem
        key={entry.id}
        className="flex items-center space-x-2"
        disabled={props.disabled}
        onSelect={() => {
          if (entry.requiresSeriesSelection) {
            openSeriesSelectionModal(entry);
          } else if (entry.requiresLdctParameters) {
            openLdctSimulationModal(entry);
          } else {
            onInteraction({ id: buttonSection, itemId: buttonId, commands: props.commands });
          }
        }}
      >
        {props.icon && (
          <Icons.ByName
            name={props.icon}
            className="h-6 w-6"
          />
        )}
        <span>{props.label || props.tooltip || entry.id}</span>
      </DropdownMenuItem>
    );
  };

  const items = tree.map(renderEntry).filter(Boolean);

  if (!items.length) {
    return null;
  }

  const trigger = (
    <Button
      variant="ghost"
      size="icon"
      className="text-foreground/80 hover:bg-background hover:text-highlight flex h-10 w-10 items-center justify-center gap-0.5 bg-transparent"
    >
      <Icons.ByName
        name={icon || 'external-link'}
        className="h-5 w-5"
      />
      <Icons.ByName
        name="chevron-down"
        className="h-3 w-3 opacity-70"
      />
    </Button>
  );

  // Both Tooltip and DropdownMenu are context-only Roots (no DOM output), so
  // they can wrap freely, but each Trigger's `asChild` clones props onto its
  // *immediate* child — that child must be another forwarding Trigger or the
  // actual DOM element, never a Root. So TooltipTrigger must sit directly on
  // top of DropdownMenuTrigger, which sits directly on top of the Button.
  const triggerElement = tooltip ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      </TooltipTrigger>
      <TooltipContent side="bottom">{tooltip}</TooltipContent>
    </Tooltip>
  ) : (
    <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
  );

  return (
    <DropdownMenu onOpenChange={open => open && ensurePatientStudyCounts()}>
      {triggerElement}
      <DropdownMenuContent
        side="bottom"
        align="start"
      >
        {items}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
