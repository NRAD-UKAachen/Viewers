export type SeriesWebhookFunction = {
  /** Used as the menu item id, the command option, and the URL path segment. */
  id: string;
  label: string;
  icon?: string;
  /** Restricts this item to series whose displaySet has one of these modalities (e.g. ['MR']). */
  modalities?: string[];
  /**
   * When true, the webhook response body is treated as a file and streamed to
   * the browser as a download (instead of the default fire-and-forget request).
   */
  download?: boolean;
};

export type SeriesWebhookGroup = {
  /** Used as the submenu's React key; not sent as a webhook request. */
  id: string;
  label: string;
  icon?: string;
  items: SeriesWebhookEntry[];
};

export type SeriesWebhookEntry = SeriesWebhookFunction | SeriesWebhookGroup;

export const isSeriesWebhookGroup = (entry: SeriesWebhookEntry): entry is SeriesWebhookGroup =>
  Array.isArray((entry as SeriesWebhookGroup).items);

export type SeriesWebhooksConfig = {
  /** e.g. "http://server:port" - no trailing slash needed. */
  baseUrl: string;
  method?: 'GET' | 'POST';
  /** Flat entries and groups (with nested `items`) can be mixed at any level. */
  functions: SeriesWebhookEntry[];
};
