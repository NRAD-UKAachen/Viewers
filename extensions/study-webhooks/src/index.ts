import { id } from './id';
import getCommandsModule from './getCommandsModule';
import getToolbarModule from './getToolbarModule';
import { StudyWebhookEntry, StudyWebhooksConfig, isStudyWebhookGroup } from './types';

import { Icons } from '@ohif/ui-next';
import { BrainIcon } from './icons/BrainIcon';
import { SurfIcon } from './icons/SurfIcon';
import { HemiIcon } from './icons/HemiIcon';
import { TumorIcon } from './icons/TumorIcon';
import { VesselIcon } from './icons/VesselIcon';
import { BloodIcon } from './icons/BloodIcon';
import { RadiationIcon } from './icons/RadiationIcon';
import { ScrewIcon } from './icons/ScrewIcon';
import { FiberIcon } from './icons/FiberIcon';

Icons.addIcon('brain-icon', BrainIcon);
Icons.addIcon('surf-icon', SurfIcon);
Icons.addIcon('hemi-icon', HemiIcon);
Icons.addIcon('tumor-icon', TumorIcon);
Icons.addIcon('vessel-icon', VesselIcon);
Icons.addIcon('blood-icon', BloodIcon);
Icons.addIcon('radiation-icon', RadiationIcon);
Icons.addIcon('screw-icon', ScrewIcon);
Icons.addIcon('fiber-icon', FiberIcon);

/**
 * Self-contained extension: registers its own toolbar buttons into their own
 * dropdown section on every mode via onModeEnter, instead of requiring any
 * OHIF-owned mode file to be edited.
 */
const STUDY_WEBHOOKS_SECTION = 'StudyWebhooks';

// Walks the (possibly nested) config tree and collects the leaf functions,
// which are what actually get registered as toolbarService buttons/commands.
// Groups themselves are only used for rendering the dropdown's submenus.
const collectFunctions = (entries: StudyWebhookEntry[]) =>
  entries.flatMap(entry => (isStudyWebhookGroup(entry) ? collectFunctions(entry.items) : [entry]));

const extension = {
  id,

  getCommandsModule,
  getToolbarModule,

  onModeEnter: ({ servicesManager, extensionManager }: withAppTypes) => {
    const { toolbarService } = servicesManager.services;
    const config: StudyWebhooksConfig = extensionManager.appConfig?.studyWebhooks;
    const tree = config?.functions ?? [];
    const leaves = collectFunctions(tree);

    if (!leaves.length) {
      return;
    }

    // Custom dropdown trigger that renders `tree` with real flyout submenus
    // for groups (see StudyWebhooksDropdown.tsx / getToolbarModule.tsx),
    // instead of the flat list `ohif.toolButtonList` ("MoreTools") supports.
    const dropdownTrigger = {
      id: STUDY_WEBHOOKS_SECTION,
      uiType: 'studyWebhooks.groupedDropdown',
      props: {
        icon: 'external-link',
        label: 'Webhooks',
        tooltip: 'Pipelines',
        buttonSection: STUDY_WEBHOOKS_SECTION,
        tree,
      },
    };

    // Leaf buttons are still registered normally so evaluate/interaction
    // (disabled state, command execution) work exactly like any other tool.
    const buttons = leaves.map(fn => ({
      id: `StudyWebhook-${fn.id}`,
      uiType: 'ohif.toolButton',
      props: {
        icon: fn.icon ?? 'external-link',
        label: fn.label,
        tooltip: fn.tooltip ?? fn.label,
        commands: {
          commandName: 'sendStudyWebhook',
          commandOptions: { functionId: fn.id },
          context: 'VIEWER',
        },
        evaluate: fn.modalities?.length
          ? [
              'evaluate.action',
              { name: 'evaluate.modality.supported', supportedModalities: fn.modalities },
            ]
          : 'evaluate.action',
      },
    }));

    toolbarService.register([dropdownTrigger, ...buttons]);
    toolbarService.updateSection(
      STUDY_WEBHOOKS_SECTION,
      buttons.map(b => b.id)
    );
    toolbarService.updateSection(toolbarService.sections.primary, [STUDY_WEBHOOKS_SECTION]);
  },
};

export default extension;
