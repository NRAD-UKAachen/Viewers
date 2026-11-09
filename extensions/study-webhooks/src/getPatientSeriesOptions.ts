import { Types } from '@ohif/core';
import { SeriesOption } from './SeriesSelectionModal';

/**
 * Mirrors extension-default's Panels/getStudiesForPatientByMRN.js, kept as a
 * local copy instead of taking a dependency on @ohif/extension-default for
 * one helper function.
 */
async function getStudiesForPatientByMRN(dataSource, qidoForStudyUID) {
  if (!qidoForStudyUID?.length) {
    return [];
  }

  const mrn = qidoForStudyUID[0].mrn;
  if (!mrn) {
    return qidoForStudyUID;
  }

  return dataSource.query.studies.search({ patientId: mrn, disableWildcard: true });
}

/**
 * Every study belonging to the active study's patient, de-duped and with the
 * active study first, via live QIDO queries -- not dependent on whatever has
 * (or hasn't) already been expanded in the Study List panel.
 *
 * Falls back to just the active study if the patient-wide lookup fails (e.g.
 * the server can't answer a patientId QIDO query), matching the resilience of
 * PanelStudyBrowser's own prior-studies fetch.
 */
export async function getPatientStudies(
  extensionManager: Types.Extensions.ExtensionParams['extensionManager'],
  activeStudyInstanceUID: string
) {
  const [dataSource] = extensionManager.getActiveDataSource();

  const qidoForActiveStudy = await dataSource.query.studies.search({
    studyInstanceUid: activeStudyInstanceUID,
  });

  let patientStudies = qidoForActiveStudy;
  try {
    const studiesForPatient = await getStudiesForPatientByMRN(dataSource, qidoForActiveStudy);
    if (studiesForPatient?.length) {
      patientStudies = studiesForPatient;
    }
  } catch (error) {
    console.warn('[study-webhooks] could not fetch prior studies for patient:', error);
  }

  // De-dupe (the active study can show up both from the direct
  // studyInstanceUid lookup and the patientId search) and put the active
  // study first.
  const studyByUID = new Map(patientStudies.map(study => [study.studyInstanceUid, study]));
  if (!studyByUID.has(activeStudyInstanceUID) && qidoForActiveStudy[0]) {
    studyByUID.set(activeStudyInstanceUID, qidoForActiveStudy[0]);
  }
  return Array.from(studyByUID.values()).sort((a, b) => {
    if (a.studyInstanceUid === activeStudyInstanceUID) return -1;
    if (b.studyInstanceUid === activeStudyInstanceUID) return 1;
    return 0;
  });
}

/**
 * Loads every series across all of the current patient's studies via live
 * QIDO queries -- not just the active study. This is what lets
 * co-registration pick a moving series from a prior study (e.g. an older PET)
 * even if that study was never opened in this session.
 */
export async function getPatientSeriesOptions(
  extensionManager: Types.Extensions.ExtensionParams['extensionManager'],
  activeStudyInstanceUID: string
): Promise<SeriesOption[]> {
  const [dataSource] = extensionManager.getActiveDataSource();
  const studies = await getPatientStudies(extensionManager, activeStudyInstanceUID);

  const seriesByStudy = await Promise.all(
    studies.map(async study => {
      const series = await dataSource.query.series
        .search(study.studyInstanceUid)
        .catch(error => {
          console.warn(
            `[study-webhooks] could not fetch series for study ${study.studyInstanceUid}:`,
            error
          );
          return [];
        });
      return { study, series };
    })
  );

  const options: SeriesOption[] = [];
  for (const { study, series } of seriesByStudy) {
    const isActiveStudy = study.studyInstanceUid === activeStudyInstanceUID;
    const studyLabel =
      [study.date, study.description].filter(Boolean).join(' · ') || study.studyInstanceUid;

    series
      .slice()
      .sort((a, b) => Number(a.seriesNumber ?? 0) - Number(b.seriesNumber ?? 0))
      .forEach(s => {
        options.push({
          studyInstanceUID: study.studyInstanceUid,
          seriesInstanceUID: s.seriesInstanceUid,
          isCenterEligible: isActiveStudy,
          modality: s.modality,
          studyLabel: isActiveStudy ? `${studyLabel} (current)` : studyLabel,
          label: [s.seriesNumber != null ? `#${s.seriesNumber}` : null, s.modality, s.description]
            .filter(Boolean)
            .join(' · '),
        });
      });
  }

  return options;
}
