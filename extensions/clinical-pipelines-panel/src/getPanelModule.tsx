import React from 'react';
import { Types } from '@ohif/core';
import ClinicalPipelinesPanel from './ClinicalPipelinesPanel';

function getPanelModule(): Types.Panel[] {
  return [
    {
      name: 'clinicalPipelines',
      iconName: 'tab-linear',
      iconLabel: 'Clinical Pipelines',
      label: 'Clinical Pipelines',
      component: () => <ClinicalPipelinesPanel />,
    },
  ];
}

export default getPanelModule;
