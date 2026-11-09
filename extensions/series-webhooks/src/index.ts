import { id } from './id';
import getCommandsModule from './getCommandsModule';
import { SeriesWebhookEntry, SeriesWebhooksConfig, isSeriesWebhookGroup } from './types';

/**
 * Self-contained extension: appends its own entries to the StudyBrowser
 * thumbnail "..." menu (customizationService id `studyBrowser.thumbnailMenuItems`)
 * on every mode via onModeEnter, instead of editing the OHIF-owned
 * `extensions/default/src/customizations/studyBrowserCustomization.ts` file.
 * This avoids merge conflicts when pulling official OHIF updates.
 */
const THUMBNAIL_MENU_ITEMS = 'studyBrowser.thumbnailMenuItems';

// Converts the (possibly nested) config tree into the plain menu item shape
// that `ohif.menuContent` (extensions/default) already knows how to render,
// including one level of flyout submenus for groups.
const toMenuItems = (entries: SeriesWebhookEntry[]) =>
  entries.map(entry =>
    isSeriesWebhookGroup(entry)
      ? {
          id: entry.id,
          label: entry.label,
          iconName: entry.icon,
          items: toMenuItems(entry.items),
        }
      : {
          id: entry.id,
          label: entry.label,
          iconName: entry.icon,
          commands: 'sendSeriesWebhook',
          commandOptions: { functionId: entry.id },
        }
  );

const extension = {
  id,

  getCommandsModule,

  onModeEnter: ({ servicesManager, extensionManager }: withAppTypes) => {
    const { customizationService } = servicesManager.services;
    const config: SeriesWebhooksConfig = extensionManager.appConfig?.seriesWebhooks;
    const tree = config?.functions ?? [];

    if (!tree.length) {
      return;
    }

    customizationService.setCustomizations({
      [THUMBNAIL_MENU_ITEMS]: { $push: toMenuItems(tree) },
    });
  },
};

export default extension;
