import { id } from './id';
import getPanelModule from './getPanelModule';

/**
 * Self-contained extension: adds its own panel to the right panel rail on
 * every mode via onModeEnter, instead of requiring any OHIF-owned mode file
 * to be edited (mirrors the study-webhooks extension's approach). The
 * panelService clears dynamically-added panels on mode exit, so re-entering
 * a mode doesn't duplicate the tab.
 */

/**
 * Clinical Pipelines / SPM-FSL Statistics panel temporarily hidden.
 *
 * To restore later:
 * 1. Uncomment PANEL_ID below.
 * 2. Uncomment the onModeEnter block inside `extension`.
 */
//const PANEL_ID = `${id}.panelModule.clinicalPipelines`;

const extension = {
  id,

  getPanelModule,
  /*
  onModeEnter: ({ servicesManager }: withAppTypes) => {
    const { panelService } = servicesManager.services;
    panelService.addPanel(panelService.PanelPosition.Right, PANEL_ID, {});
  },
  */
};

export default extension;
