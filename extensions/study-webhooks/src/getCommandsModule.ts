import { DicomMetadataStore, Types } from '@ohif/core';
import { StudyWebhookEntry, StudyWebhookFunction, StudyWebhooksConfig, isStudyWebhookGroup } from './types';
import { getActiveStudyInstanceUID } from './getActiveStudyInstanceUID';

// How often to poll the job-status endpoint, and how long to keep polling
// before giving up on a hung job. The timeout is a per-function default --
// see `pollTimeoutMinutes` in types.ts for pipelines that need longer.
const POLL_INTERVAL_MS = 4000;
const DEFAULT_POLL_TIMEOUT_MINUTES = 20;

// Backoff schedule for re-checking a study after a job reports "done".
// dcm4chee can return 200 on STOW before the new instance is actually
// visible to QIDO-RS, so the first refresh attempt can legitimately race it.
const REFRESH_RETRY_DELAYS_MS = [1000, 2000, 4000, 8000];

const delay = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

// DicomMetadataStore's public typings don't expose the shape of the study
// object getStudy() returns, so go through `unknown` to read `series`.
const getStudySeriesCount = (studyInstanceUID: string): number =>
  (DicomMetadataStore.getStudy(studyInstanceUID) as unknown as { series?: unknown[] })?.series
    ?.length ?? 0;

const findFunction = (
  entries: StudyWebhookEntry[] | undefined,
  functionId: string
): StudyWebhookFunction | undefined => {
  for (const entry of entries ?? []) {
    if (isStudyWebhookGroup(entry)) {
      const found = findFunction(entry.items, functionId);
      if (found) {
        return found;
      }
    } else if (entry.id === functionId) {
      return entry;
    }
  }
  return undefined;
};

/**
 * Reads the StudyInstanceUID of the study loaded in the active viewport and
 * fires `${baseUrl}/${functionId}/${StudyInstanceUID}` without waiting for
 * (or blocking the UI on) the response.
 */
const getCommandsModule = ({
  servicesManager,
  extensionManager,
}: Types.Extensions.ExtensionParams): Types.Extensions.CommandsModule => {
  const { uiNotificationService } = servicesManager.services;

  const showSuccess = (title: string, message: string) =>
    uiNotificationService?.show({ title, message, type: 'success', duration: 10000 });

  const showError = (title: string, message: string) =>
    uiNotificationService?.show({ title, message, type: 'error', duration: 10000 });

  /**
   * Soft-refreshes a study in place instead of asking the user to reload the
   * page: busts the cached study-metadata promise and re-queries QIDO/WADO,
   * which repopulates DicomMetadataStore and (via the INSTANCES_ADDED
   * listener that the mode route keeps subscribed for as long as the viewer
   * is open) rebuilds display sets automatically. No navigation happens, so
   * this can't disrupt the Keycloak session the way a page reload can.
   *
   * The data source's own promise cache is keyed as `${dataSourceName}:${uid}`,
   * but its invalidation function naively does a literal lookup on whatever
   * string it's given — so passing that composite key in is what actually
   * busts the right cache entry.
   *
   * Retries a few times (see REFRESH_RETRY_DELAYS_MS) because dcm4chee can
   * ack the STOW before the new series is visible via QIDO-RS. Success is
   * inferred from the study gaining a series it didn't have before; if that
   * never happens we report failure so the caller can fall back to asking
   * for a manual reload.
   */
  const refreshStudy = async (studyInstanceUID: string): Promise<boolean> => {
    const dataSource = extensionManager.getActiveDataSourceOrNull?.();
    if (!dataSource?.retrieve?.series?.metadata) {
      return false;
    }

    const dataSourceName = dataSource.getConfig?.()?.name;
    const seriesCountBefore = getStudySeriesCount(studyInstanceUID);

    for (let attempt = 0; attempt <= REFRESH_RETRY_DELAYS_MS.length; attempt++) {
      await delay(REFRESH_RETRY_DELAYS_MS[attempt] ?? REFRESH_RETRY_DELAYS_MS[0]);

      try {
        dataSource.deleteStudyMetadataPromise?.(`${dataSourceName}:${studyInstanceUID}`);
        await dataSource.retrieve.series.metadata({
          StudyInstanceUID: studyInstanceUID,
          madeInClient: false,
        });
      } catch (error) {
        console.warn(
          `[study-webhooks] refresh attempt ${attempt} failed for study ${studyInstanceUID}, retrying:`,
          error
        );
        continue;
      }

      const seriesCountAfter = getStudySeriesCount(studyInstanceUID);
      if (seriesCountAfter > seriesCountBefore) {
        return true;
      }
    }

    return false;
  };

  /**
   * Polls a background job's status endpoint until it reaches a terminal state
   * and drives the final toast off the result:
   *   done   → soft-refreshes the study, then a green success toast
   *   failed → red error toast (using the job's `error`)
   * A persistent 404 (unknown/expired job) or the safety timeout is also treated
   * as a failure. Transient network/5xx blips are tolerated and retried until the
   * deadline. Runs detached so it never blocks the UI.
   */
  const pollJobStatus = async (
    statusUrl: string,
    fn: StudyWebhookFunction,
    studyInstanceUID: string
  ): Promise<void> => {
    const timeoutMinutes = fn.pollTimeoutMinutes ?? DEFAULT_POLL_TIMEOUT_MINUTES;
    const deadline = Date.now() + timeoutMinutes * 60 * 1000;

    while (Date.now() < deadline) {
      await delay(POLL_INTERVAL_MS);

      let response: Response;
      try {
        response = await fetch(statusUrl, { method: 'GET', mode: 'cors', credentials: 'include' });
      } catch (error) {
        // Transient network hiccup — keep polling until the deadline.
        console.warn(`[study-webhooks] "${fn.id}" status poll failed, retrying:`, error);
        continue;
      }

      const body = await response.json().catch(() => ({} as Record<string, string>));

      if (response.status === 404) {
        // Unknown/expired job (e.g. server restarted mid-job) → failure.
        showError(`${fn.label} failed`, body.error || 'Job not found or expired.');
        return;
      }

      if (!response.ok) {
        // Other transient server error — retry until the deadline.
        console.warn(`[study-webhooks] "${fn.id}" status HTTP ${response.status}, retrying`);
        continue;
      }

      if (body.status === 'done') {
        const refreshed = await refreshStudy(studyInstanceUID);
        showSuccess(
          fn.label,
          refreshed
            ? `${body.message || 'Processing complete.'} Results have been loaded.`
            : `${body.message || 'Processing complete.'} ` +
                'Refresh the page with CTRL+Shift+R to see the results.'
        );
        return;
      }

      if (body.status === 'failed') {
        showError(`${fn.label} failed`, body.error || 'Processing failed.');
        return;
      }

      // pending / running → nothing new to show, keep polling.
    }

    showError(
      `${fn.label} timed out`,
      `The job is still running after ${timeoutMinutes} minutes. Please check back later.`
    );
  };

  const actions = {
    sendStudyWebhook: ({
      functionId,
      body,
    }: {
      functionId: string;
      /**
       * Extra payload for functions that need more than the StudyInstanceUID
       * (e.g. coreg's { centerSeriesUID, movingSeriesUIDs }, or ldct's series
       * + simulation parameters). When present, this is sent as a JSON POST
       * body regardless of the config's `method`, since a GET request can't
       * carry one.
       */
      body?: Record<string, unknown>;
    }) => {
      const config: StudyWebhooksConfig = extensionManager.appConfig?.studyWebhooks;
      const fn = findFunction(config?.functions, functionId);

      if (!config?.baseUrl || !fn) {
        console.warn(`[study-webhooks] missing "studyWebhooks" config for function "${functionId}"`);
        return;
      }

      const studyInstanceUID = getActiveStudyInstanceUID(servicesManager);
      if (!studyInstanceUID) {
        uiNotificationService?.show({
          title: fn.label,
          message: 'No active study to send.',
          type: 'warning',
        });
        return;
      }

      const url = `${config.baseUrl.replace(/\/+$/, '')}/${functionId}/${studyInstanceUID}`;
      const fetchOptions: RequestInit = body
        ? {
            method: 'POST',
            mode: 'cors', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }
        : { method: config.method ?? 'GET', mode: 'cors', credentials: 'include' };

      // Fire-and-forget: intentionally not awaited so the toolbar click never blocks the UI.
      fetch(url, fetchOptions)
        .then(async response => {
          if (!response.ok) {
            // The job never started — surface any error detail the API returned.
            const detail = await response.text().catch(() => '');
            throw new Error(
              `${response.status} ${response.statusText}${detail ? ` – ${detail}` : ''}`
            );
          }

          // Legacy synchronous endpoints still return 200 once the whole job is done.
          if (response.status !== 202) {
            const refreshed = await refreshStudy(studyInstanceUID);
            showSuccess(
              fn.label,
              refreshed
                ? 'Study processed successfully. Results have been loaded.'
                : 'Study sent to API for processing. This may take a few minutes. ' +
                    'Refresh the page with CTRL+Shift+R to see the results.'
            );
            return;
          }

          // New async model: 202 Accepted + job descriptor. Announce, then poll
          // the status endpoint for the real outcome (green/red toast comes from there).
          const job = await response.json().catch(() => ({} as Record<string, string>));

          uiNotificationService?.show({
            title: fn.label,
            message: job.message || 'Processing started…',
            type: 'info',
            duration: 6000,
          });

          // Prefer the server-provided status_url (a path); fall back to constructing it.
          //
          // Joined by hand rather than with `new URL()`: the API returns
          // status_url as a root-relative path ("/job_status/<id>"), and
          // `new URL()` resolves that against the *origin*, silently
          // dropping any path in baseUrl. Now that baseUrl carries the
          // "/api-proxy" prefix, that turned every poll into a 404 against
          // the GUI -- the job ran to completion but the viewer never
          // noticed, so no notification and no auto-refresh.
          const base = config.baseUrl.replace(/\/+$/, '');
          const statusUrl = job.status_url
            ? `${base}/${String(job.status_url).replace(/^\/+/, '')}`
            : `${base}/job_status/${job.job_id}`;

          await pollJobStatus(statusUrl, fn, studyInstanceUID);
        })
        .catch(error => {
          console.error(`[study-webhooks] "${functionId}" request failed:`, error);
          showError(`${fn.label} failed`, `Could not start processing: ${error.message}`);
        });
    },
  };

  const definitions = {
    sendStudyWebhook: {
      commandFn: actions.sendStudyWebhook,
      storeContexts: [],
      options: {},
    },
  };

  return {
    actions,
    definitions,
    defaultContext: 'VIEWER',
  };
};

export default getCommandsModule;
