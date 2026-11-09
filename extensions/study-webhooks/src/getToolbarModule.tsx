import StudyWebhooksDropdown from './StudyWebhooksDropdown';

export default function getToolbarModule() {
  return [
    {
      name: 'studyWebhooks.groupedDropdown',
      defaultComponent: StudyWebhooksDropdown,
    },
  ];
}
