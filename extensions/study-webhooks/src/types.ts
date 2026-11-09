export type StudyWebhookFunction = {
  /** Used as the toolbar button id suffix, the command option, and the URL path segment. */
  id: string;
  label: string;
  tooltip?: string;
  icon?: string;
  /** Restricts this button to studies containing at least one of these modalities (e.g. ['MR']). */
  modalities?: string[];
  /**
   * When true, clicking this button opens a series-picker dialog instead of
   * firing the webhook immediately: the user chooses one "center" series and
   * one-or-more "moving" series from the active study, and the selection is
   * sent as a JSON body `{ centerSeriesUID, movingSeriesUIDs }` (see
   * sendStudyWebhook in getCommandsModule.ts).
   */
  requiresSeriesSelection?: boolean;
  /**
   * When true, clicking this button opens the LDCT parameter dialog instead
   * of firing the webhook immediately: the user picks one CT series of the
   * active study and the simulation parameters (dose factor, beta, GPU,
   * pipeline range), which are sent as a JSON body (see sendStudyWebhook in
   * getCommandsModule.ts, and POST /ldct/<studyInstanceUID> in the API).
   */
  requiresLdctParameters?: boolean;
  /**
   * When true, this entry is only offered when the patient of the active
   * study has more than one study carrying `modalities`[0] (defaulting to
   * 'MR') -- for pipelines that analyse several of a patient's studies
   * together and have nothing to do with only one, e.g. longitudinal
   * FastSurfer. The check is a study-level QIDO count (see
   * countPatientStudiesWithModality) and fails open: while it is still in
   * flight, or if it errors, the entry stays visible and the API reports the
   * real reason. Hiding is deliberately not the same as disabling -- an
   * entry that can never apply to this patient is noise in the menu.
   */
  requiresMultipleStudies?: boolean;
  /**
   * How long to keep polling this function's job before declaring it timed
   * out, in minutes. Defaults to DEFAULT_POLL_TIMEOUT_MINUTES -- raise it for
   * pipelines that legitimately run longer than that (LDCT simulation takes
   * 15-30 minutes), otherwise a job that is still healthy is reported to the
   * user as failed.
   */
  pollTimeoutMinutes?: number;
};

export type StudyWebhookGroup = {
  /** Used as the submenu's React key; not sent as a webhook request. */
  id: string;
  label: string;
  icon?: string;
  items: StudyWebhookEntry[];
};

export type StudyWebhookEntry = StudyWebhookFunction | StudyWebhookGroup;

export const isStudyWebhookGroup = (entry: StudyWebhookEntry): entry is StudyWebhookGroup =>
  Array.isArray((entry as StudyWebhookGroup).items);

export type StudyWebhooksConfig = {
  /** e.g. "http://server:port" - no trailing slash needed. */
  baseUrl: string;
  method?: 'GET' | 'POST';
  /** Flat entries and groups (with nested `items`) can be mixed at any level. */
  functions: StudyWebhookEntry[];
};
