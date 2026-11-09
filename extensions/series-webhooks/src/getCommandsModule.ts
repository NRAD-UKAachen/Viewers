import { Types } from '@ohif/core';
import {
  SeriesWebhookEntry,
  SeriesWebhookFunction,
  SeriesWebhooksConfig,
  isSeriesWebhookGroup,
} from './types';

/**
 * Extracts the filename from a `Content-Disposition` header, supporting both
 * the plain `filename="..."` and the RFC 5987 `filename*=UTF-8''...` forms.
 * Returns undefined when the header is missing or has no filename.
 */
const parseFilename = (contentDisposition: string | null): string | undefined => {
  if (!contentDisposition) {
    return undefined;
  }
  const utf8Match = contentDisposition.match(/filename\*=(?:UTF-8'')?([^;]+)/i);
  if (utf8Match) {
    try {
      return decodeURIComponent(utf8Match[1].trim().replace(/^"|"$/g, ''));
    } catch {
      // fall through to the plain filename form
    }
  }
  const plainMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
  return plainMatch ? plainMatch[1].trim() : undefined;
};

/**
 * Fetches `url`, reads the response body as a Blob, and triggers a browser
 * download via a temporary object URL. Buffers the whole file in memory, so it
 * is intended for a single series at a time. Rejects on non-OK responses so the
 * caller can surface the error.
 */
const downloadFile = async (
  url: string,
  method: string,
  fallbackName: string
): Promise<void> => {
  const response = await fetch(url, { method, mode: 'cors', credentials: 'include' });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  const blob = await response.blob();
  // Requires the server to expose the header via
  // `Access-Control-Expose-Headers: Content-Disposition` for cross-origin reads.
  const filename =
    parseFilename(response.headers.get('Content-Disposition')) ?? fallbackName;

  const objectUrl = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

const findFunction = (
  entries: SeriesWebhookEntry[] | undefined,
  functionId: string
): SeriesWebhookFunction | undefined => {
  for (const entry of entries ?? []) {
    if (isSeriesWebhookGroup(entry)) {
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
 * Reads the StudyInstanceUID/SeriesInstanceUID of the series whose thumbnail
 * "..." menu was clicked and fires
 * `${baseUrl}/${functionId}/${StudyInstanceUID}/${SeriesInstanceUID}` without
 * waiting for (or blocking the UI on) the response.
 */
const getCommandsModule = ({
  servicesManager,
  extensionManager,
}: Types.Extensions.ExtensionParams): Types.Extensions.CommandsModule => {
  const { displaySetService, uiNotificationService } = servicesManager.services;

  const actions = {
    sendSeriesWebhook: ({
      functionId,
      displaySetInstanceUID,
    }: {
      functionId: string;
      displaySetInstanceUID: string;
    }) => {
      const config: SeriesWebhooksConfig = extensionManager.appConfig?.seriesWebhooks;
      const fn = findFunction(config?.functions, functionId);

      if (!config?.baseUrl || !fn) {
        console.warn(`[series-webhooks] missing "seriesWebhooks" config for function "${functionId}"`);
        return;
      }

      const displaySet = displaySetService.getDisplaySetByUID(displaySetInstanceUID);
      const { StudyInstanceUID, SeriesInstanceUID, Modality } = displaySet ?? {};

      if (!StudyInstanceUID || !SeriesInstanceUID) {
        uiNotificationService?.show({
          title: fn.label,
          message: 'No series found for this thumbnail.',
          type: 'warning',
        });
        return;
      }

      if (fn.modalities?.length && !fn.modalities.includes(Modality)) {
        uiNotificationService?.show({
          title: fn.label,
          message: `Not supported for modality ${Modality}.`,
          type: 'warning',
        });
        return;
      }

      const url = `${config.baseUrl.replace(/\/+$/, '')}/${functionId}/${StudyInstanceUID}/${SeriesInstanceUID}`;
      const method = config.method ?? 'GET';

      if (fn.download) {
        // The response body is a file: pull it down and hand it to the browser.
        uiNotificationService?.show({
          title: fn.label,
          message: 'Preparing download…',
          type: 'info',
        });

        downloadFile(url, method, `${functionId}_${SeriesInstanceUID}`)
          .catch(error => {
            console.error(`[series-webhooks] "${functionId}" download failed:`, error);
            uiNotificationService?.show({
              title: fn.label,
              message: `Download failed: ${error.message}`,
              type: 'error',
            });
          });
        return;
      }

      // Fire-and-forget: intentionally not awaited so the menu click never blocks the UI.
      fetch(url, { method, mode: 'cors', credentials: 'include' })
        .then(response => {
          if (!response.ok) {
            throw new Error(`${response.status} ${response.statusText}`);
          }
        })
        .catch(error => {
          console.error(`[series-webhooks] "${functionId}" request failed:`, error);
          uiNotificationService?.show({
            title: fn.label,
            message: `Request failed: ${error.message}`,
            type: 'error',
          });
        });
    },
  };

  const definitions = {
    sendSeriesWebhook: {
      commandFn: actions.sendSeriesWebhook,
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
