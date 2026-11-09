import { Types } from '@ohif/core';
import { getPatientStudies } from './getPatientSeriesOptions';

/**
 * How many of the active study's patient's studies could contain `modality`
 * (e.g. 'MR') -- what a longitudinal pipeline needs to know before offering
 * itself, since it has nothing to compare against below two.
 *
 * Counted off the study-level QIDO result's ModalitiesInStudy rather than by
 * querying each study's series, so this stays two requests no matter how long
 * the patient's history is. A study whose ModalitiesInStudy came back empty is
 * counted rather than dropped: some servers omit the tag, and the API's own
 * study picker (siena_functions._patient_studies) makes the same call, leaving
 * it to the per-study series matching to rule such a study out. Erring towards
 * offering a pipeline that then reports "no matching series" beats hiding one
 * that would have worked.
 */
export async function countPatientStudiesWithModality(
  extensionManager: Types.Extensions.ExtensionParams['extensionManager'],
  activeStudyInstanceUID: string,
  modality: string
): Promise<number> {
  const studies = await getPatientStudies(extensionManager, activeStudyInstanceUID);

  return studies.filter(study => {
    // OHIF's QIDO mapping joins ModalitiesInStudy into one string ("MR\\CT" ->
    // "MR, CT"), so match on the token rather than on equality.
    const modalities = String(study.modalities ?? '').toUpperCase();
    return !modalities || modalities.split(/[^A-Z]+/).includes(modality.toUpperCase());
  }).length;
}
