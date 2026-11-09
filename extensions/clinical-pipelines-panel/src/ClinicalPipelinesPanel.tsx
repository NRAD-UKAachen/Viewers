import React, { useState } from 'react';
import { useActiveViewportDisplaySets } from '@ohif/core';

// The Flask GUI (docker-context-gui) that hosts the full Clinical Pipelines /
// SPM-FSL Statistics forms -- this panel iframes it directly rather than
// re-implementing those forms as React components, so the panel and the
// standalone Flask pages stay a single source of truth.
//
// Derived from window.location rather than hardcoded: this is bundled at build
// time, so no environment variable can reach it, but the browser that loaded
// OHIF is already talking to the machine the portal runs on. The port is this
// deployment's fixed layout -- see PORT_PORTAL in the root .env.
// config/docker-nginx-dcm4chee.js computes the same value the same way.
const GUI_BASE_URL = `${window.location.protocol}//${window.location.hostname}:5005`;

const TABS = [
  { id: 'clinical-pipelines', label: 'Clinical Pipelines', path: '/fsl-clinical/' },
  { id: 'spm-fsl-statistics', label: 'SPM/FSL Statistics', path: '/spm-fsl/' },
] as const;

export default function ClinicalPipelinesPanel() {
  const [activeTabId, setActiveTabId] = useState<(typeof TABS)[number]['id']>(TABS[0].id);
  const displaySets = useActiveViewportDisplaySets();
  const studyInstanceUID = displaySets[0]?.StudyInstanceUID;

  const activeTab = TABS.find(tab => tab.id === activeTabId) ?? TABS[0];
  const params = new URLSearchParams({ embedded: '1' });
  if (studyInstanceUID) {
    params.set('studyInstanceUID', studyInstanceUID);
  }
  const src = `${GUI_BASE_URL}${activeTab.path}?${params.toString()}`;

  return (
    <div className="flex h-full flex-col">
      <div className="border-secondary-light flex shrink-0 border-b">
        {TABS.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTabId(tab.id)}
            className={`flex-1 px-2 py-2 text-sm ${
              tab.id === activeTabId
                ? 'bg-primary-dark text-white'
                : 'bg-secondary-dark text-secondary-light hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {!studyInstanceUID && (
        <div className="bg-secondary-dark px-2 py-1 text-xs text-yellow-500">
          No study loaded in the active viewport -- opening with a blank form.
        </div>
      )}
      <iframe
        // Remounts the iframe on tab switch so each tool gets a fresh load
        // instead of stacking history inside a single reused frame.
        key={activeTab.id}
        src={src}
        title={activeTab.label}
        className="h-full w-full flex-1 border-0"
      />
    </div>
  );
}
