/** @type {AppTypes.Config} */

// This file is baked into the image at build time (see the recipe's dockerfile:
// APP_CONFIG=config/docker-nginx-dcm4chee.js, then `pnpm run build` copies it
// into dist/app-config.js), so a compose environment variable cannot reach it
// as ${...} interpolation the way a compose file can.
//
// OHIF's own origin needs no configuration at all: the browser loaded this
// page from it, so window.location.origin is right by construction -- on
// localhost, on a lab server, behind TLS, on any port.
var OHIF_BASE_URL = window.location.origin;

// The portal is a DIFFERENT origin on a different port, and nothing the
// browser knows can tell us which. It is substituted into dist/app-config.js
// at container start by the recipe's /docker-entrypoint.d/40-interact-ports.sh,
// from PORT_PORTAL in the root .env.
//
// Do not hardcode a port here again. This used to read ':5005' -- the default
// PORT_PORTAL -- which silently pointed at the wrong deployment on any host
// running more than one stack: OHIF on stack B posted uploads to stack A's
// portal, where the browser then blocked them for having the wrong CORS
// origin. The failure looked like a CORS bug in the upload code.
var INTERACT_PORTAL_PORT = '__INTERACT_PORT_PORTAL__';
if (!/^[0-9]+$/.test(INTERACT_PORTAL_PORT)) {
  // Unsubstituted: the image is running without that entrypoint script, or
  // without PORT_PORTAL in the environment. Fall back to the documented
  // default from .env.example, and say so -- a single-stack localhost install
  // keeps working, and anything else has one obvious line in the console.
  console.warn(
    '[InterACT] PORT_PORTAL was not substituted into app-config.js; ' +
      'falling back to the default 5005. If the portal is on another port, ' +
      'set PORT_PORTAL in the root .env and recreate the OHIF container.'
  );
  INTERACT_PORTAL_PORT = '5005';
}

var INTERACT_SCHEME = window.location.protocol;   // 'http:' or 'https:'
var INTERACT_HOST = window.location.hostname;
var PORTAL_BASE_URL =
  INTERACT_SCHEME + '//' + INTERACT_HOST + ':' + INTERACT_PORTAL_PORT;
var API_PROXY_BASE_URL = PORTAL_BASE_URL + '/api-proxy';

window.config = {
  routerBasename: null,
  showStudyList: true,
  extensions: [],
  modes: [],
  // below flag is for performance reasons, but it might not work for all servers
  showWarningMessageForCrossOrigin: true,
  showCPUFallbackMessage: true,
  showLoadingIndicator: true,
  strictZSpacingForVolumeViewport: true,
  customizationService: [
    '@ohif/extension-default.customizationModule.theme',
  ],
  // Everyone lands on the Aachen colour scheme; the Appearance modal
  // (gear -> Appearance) still lets an individual switch away, and that choice
  // is remembered in their own browser.
  defaultTheme: 'aachen',
  defaultDataSourceName: 'dicomweb',
  dataSources: [
    {
      namespace: '@ohif/extension-default.dataSourcesModule.dicomweb',
      sourceName: 'dicomweb',
      configuration: {
        friendlyName: 'Dcm4chee Server',
        name: 'Dcm4chee',
        wadoUriRoot: '/dcm4chee-arc/aets/DCM4CHEE/wado',
        qidoRoot: '/dcm4chee-arc/aets/DCM4CHEE/rs',
        wadoRoot: '/dcm4chee-arc/aets/DCM4CHEE/rs',
        qidoSupportsIncludeField: false,
        supportsWildcard: true,
        imageRendering: 'wadors',
        thumbnailRendering: 'wadors',
        dicomUploadEnabled: true,
        omitQuotationForMultipartRequest: true,
      },
    },
  ],
  // Backs the NIfTI branch of the "Upload" button (extensions/cornerstone's
  // DicomUpload -> NiftiFileUploader): converts an uploaded .nii/.nii.gz to
  // DICOM and STOWs it to dcm4chee. Same API process as studyWebhooks/seriesWebhooks.
  niftiUpload: {
    baseUrl: API_PROXY_BASE_URL,
  },
  studyWebhooks: {
  baseUrl: API_PROXY_BASE_URL,
  method: 'GET',
  functions: [
    {
      id: 'dementia', label: 'Dementia & Epilepsy', icon: 'hemi-icon',
      items: [
        { id: 'fastsurfer/seg', label: 'FastSurfer Segmentation', icon: 'surf-icon', modalities: ['MR'] },
        // Segmentation plus the full surface pipeline: about 33 minutes per
        // study, well past the default 20-minute poll timeout.
        { id: 'fastsurfer/full', label: 'FastSurfer Full Reconstruction', icon: 'surf-icon',
          modalities: ['MR'], pollTimeoutMinutes: 60 },
        // SynthSeg, for the T1s FastSurfer is weakest on: thick-slice,
        // anisotropic or otherwise low-resolution clinical series, which its
        // networks are trained across on purpose. Segmentation + volumetry
        // only (no cortical thickness -- there is no surface stage), but it
        // returns in a couple of minutes and carries its own QC scores, so
        // the default poll timeout is fine. 'robust' is the sturdier model
        // for genuinely poor scans; see SYNTHSEG_MODES in
        // API/app/synthseg_functions.py.
        //
        // Both buttons run on whichever of the study's T1 and T2 exist, since
        // SynthSeg is contrast-agnostic. With both, that yields two SEGs (each
        // attached to its own series) and two sets of tables, not a fused
        // result; with either one alone, a complete result on that one. So
        // there is no separate "T1+T2" button to choose: it is decided per
        // study by what the study actually contains.
        { id: 'synthseg/standard', label: 'SynthSeg Segmentation (low-resolution T1/T2)', icon: 'brain-icon', modalities: ['MR'] },
        { id: 'synthseg/robust', label: 'SynthSeg Segmentation (robust, poor-quality scans)', icon: 'brain-icon', modalities: ['MR'] },
        // Its own button rather than a third FastSurfer mode: this one is not
        // a segmentation of the open study but a joint analysis of several of
        // the patient's, so it only appears when there is more than one MR
        // study to compare (requiresMultipleStudies). It builds an unbiased
        // person-specific template from the timepoints and initialises each
        // one's segmentation and surfaces from it, which costs a full
        // FastSurfer run per timepoint on top of the template's -- hours, not
        // the default 20-minute poll timeout, and capped at four timepoints
        // by the API (MAX_TIMEPOINTS in fastsurfer_long_functions.py).
        { id: 'fastsurfer_long', label: 'FastSurfer Longitudinal (multi-timepoint)', icon: 'surf-icon',
          modalities: ['MR'], requiresMultipleStudies: true, pollTimeoutMinutes: 480 },
        { id: 'totalsegmentator/brain_structures', label: 'CT Brain Segmentation', icon: 'brain-icon', modalities: ['CT'] },
        { id: 'hippocampus', label: 'Hippocampus Segmentation (FSL FIRST)', icon: 'brain-icon', modalities: ['MR'] },
        // One button, two analyses: the backend queries the patient's other
        // studies and runs longitudinal SIENA against the temporally
        // furthest one carrying the same sequence, falling back to
        // single-timepoint SIENAX when there is no such study. SIENA runs
        // BET, FLIRT and FAST twice over plus a self-calibration pass, so
        // it needs well beyond the default 20-minute poll timeout.
        { id: 'siena', label: 'Brain Atrophy (FSL SIENA / SIENAX)', icon: 'brain-icon',
          modalities: ['MR'], pollTimeoutMinutes: 120 },
      ],
    },
    { id: 'tumor', label: 'Tumor', icon: 'brain-icon',
      items: [
        { id: 'tumorseg/goat', label: 'BRATS general segmentation', icon: 'brain-icon', modalities: ['MR'] },
        { id: 'tumorsegspec', label: 'BRATS specific segmentation', icon: 'brain-icon', modalities: ['MR'],
          items: [
            { id: 'tumorseg/gliomaprepost', label: 'Glioma Pre & Post Treatment', icon: 'tumor-icon', modalities: ['MR'] },
            { id: 'tumorseg/gliomapre', label: 'Glioma Pre-Treatment', icon: 'tumor-icon', modalities: ['MR'] },
            { id: 'tumorseg/meningioma', label: 'Meningioma', icon: 'tumor-icon', modalities: ['MR'] },
            { id: 'tumorseg/metastases', label: 'Metastases', icon: 'tumor-icon', modalities: ['MR'] },
            { id: 'tumorseg/pediatric', label: 'Pediatric', icon: 'tumor-icon', modalities: ['MR'] },
          ]
         },

      ],
    },
    {
      id: 'diffusion', label: 'Diffusion (DTI)', icon: 'fiber-icon',
      items: [
        // Both run FSL on the study's raw DTI series and upload their results
        // back into it. The tensor stage takes 10-15 minutes; tractography
        // adds bedpostx + XTRACT on top and needs about an hour, hence the
        // raised poll timeouts -- the default 20 minutes would report a
        // perfectly healthy run as failed. Tractography runs the tensor stage
        // itself if the study has not had it, so the order does not matter.
        { id: 'dti/tensor', label: 'DTI Tensor (FA, MD, Colour FA)', icon: 'fiber-icon',
          modalities: ['MR'], pollTimeoutMinutes: 45 },
        { id: 'dti/tractography', label: 'DTI Tractography (XTRACT, 42 tracts)', icon: 'fiber-icon',
          modalities: ['MR'], pollTimeoutMinutes: 150 },
      ],
    },
    { id: 'totalsegmentator/brain_aneurysm', label: 'Aneurysm Segmentation', icon: 'vessel-icon', modalities:['MR']},
    { id: 'totalsegmentator/cerebral_bleed', label: 'Hemorrhage Segmentation', icon: 'blood-icon', modalities:['CT']},
    {
      id: 'research', label: 'Research Tools', icon: 'icon-search',
      items: [
        { id: 'ldct', label: 'Low Dose CT Simulation', icon: 'radiation-icon', modalities: ['CT'],
          requiresLdctParameters: true, pollTimeoutMinutes: 60 },
        { id: 'coreg', label: 'Co-Registration', icon: 'external-link', modalities: ['MR', 'CT'], requiresSeriesSelection: true },
        { id: 'fsl_register_qc', label: 'FSL: Register to MNI + QC', icon: 'brain-icon', modalities: ['MR'] },
      ],
    },
  ],
},
  // Adds entries to the StudyBrowser thumbnail "..." menu (alongside "Tag
  // Browser" / "Add as Layer"), scoped to the single series that was
  // clicked. Fill in real functions as needed; see
  // extensions/series-webhooks for the config shape.
  seriesWebhooks: {
    baseUrl: API_PROXY_BASE_URL,
    method: 'GET',
    functions: [
      { id: 'download_series', label: 'Download as DICOM', icon: 'Download', download: true },
      { id: 'download_series_nifti', label: 'Download as NIfTI', icon: 'Download', download: true },
    ],
  },

};

// Session guard: oauth2-proxy/Keycloak (see keycloak-dev/ and
// .recipes/Nginx-Dcm4chee/) log the user out server-side after 30 minutes
// idle (ssoSessionIdleTimeout), but the OHIF SPA has no idea that happened -
// QIDO/WADO calls just start failing while the study list/viewer keeps
// rendering whatever it last loaded. This makes that visible instead of
// silent, and sends the user back to Keycloak's login page (skip-provider-
// button=true on oauth2-proxy takes them straight there) with a same-origin
// `rd` redirect so they land back on the exact viewer/study URL they had
// open once they sign back in - oauth2-proxy restores `rd` after its own
// callback, so nothing here needs to remember the URL itself.
//
// This page is normally not top-level: the Flask portal (docker-context-gui,
// base.html) embeds OHIF in an iframe. Keycloak's login page refuses to
// render inside ANY iframe that isn't same-origin with Keycloak itself
// (frame-ancestors 'self' / X-Frame-Options: SAMEORIGIN), so navigating
// window.location here would just leave the iframe blank instead of showing
// a login page. window.top.location.assign breaks out of the portal's frame
// so the whole tab shows the login, same as if the iframe weren't there.
(function () {
  // Absolute, not relative: redirectToLogin() below navigates window.top,
  // which - when this is running inside the portal's iframe - is a document
  // on the portal's own origin (:5005). A relative '/oauth2/sign_in' would
  // resolve against THAT origin instead of oauth2-proxy's, 404ing on the
  // portal rather than reaching Keycloak.
  var oauth2Origin = OHIF_BASE_URL;
  var oauth2SignInUrl = oauth2Origin + '/oauth2/sign_in';
  // Relative is correct here: this fetch always runs from OHIF's own iframe
  // context (window/document), never from window.top, so it's genuinely
  // same-origin with oauth2-proxy already.
  var oauth2AuthCheckUrl = '/oauth2/auth';
  // Where the portal (docker-context-gui) lands the "OHIF Viewer" sidebar
  // tab. Only used when this page is framed by that portal (see
  // redirectToLogin). The path is /viewer/ohif, NOT /ohif: viewer_bp is
  // registered with url_prefix="/viewer" in the portal's app/__init__.py, so
  // the bare '/ohif' this used to build 404'd on every session-expiry
  // redirect. base.html builds the same link with url_for('viewer.ohif').
  var portalOhifUrl = PORTAL_BASE_URL + '/viewer/ohif';
  // Throttled, not a plain interval: an unthrottled background poll would
  // itself refresh the token on every tick and defeat the idle timeout for
  // as long as the tab stays open. Gating on real user input (mouse/key/
  // touch) means the check - and any resulting token refresh - only ever
  // happens in response to the user actually being active, same as any
  // other request they'd make.
  var minCheckIntervalMs = 30000;
  var lastCheckAt = 0;
  var checkInFlight = false;

  function returnToUrl() {
    return window.location.pathname + window.location.search + window.location.hash;
  }

  function redirectToLogin() {
    var inIframe = window.top !== window.self;
    // Framed by the portal: come back to ITS OHIF page (full sidebar/chrome)
    // rather than to bare OHIF, carrying the exact path so base.html can
    // rebuild the same view instead of resetting to the worklist (see the
    // OHIF_IFRAME_SRC / ohif_path handling in base.html). oauth2-proxy only
    // accepts an rd outside its own origin because of --whitelist-domain on
    // its container (see docker-compose.yml) - without that flag this would
    // silently fall back to "/".
    var rdTarget = inIframe
      ? portalOhifUrl + '?ohif_path=' + encodeURIComponent(returnToUrl())
      : returnToUrl();
    var target = oauth2SignInUrl + '?rd=' + encodeURIComponent(rdTarget);
    try {
      window.top.location.assign(target);
    } catch (e) {
      // Cross-origin top window some browsers refuse to touch from a
      // deeply nested/sandboxed frame - fall back to navigating self
      // rather than doing nothing.
      window.location.assign(target);
    }
  }

  // Confirms session state against oauth2-proxy's own auth-check endpoint
  // (same-origin, answers 202/401 with no ambiguity) before redirecting.
  // This is the sole trigger for a redirect - see the two call sites below -
  // rather than guessing from a QIDO/WADO call's error shape, because
  // oauth2-proxy does not actually return a clean 401 to those calls (see
  // next comment), and a generic network hiccup must not be treated as an
  // expired session on its own.
  function verifyThenRedirect() {
    var now = Date.now();
    if (checkInFlight || now - lastCheckAt < minCheckIntervalMs) {
      return;
    }
    checkInFlight = true;
    lastCheckAt = now;
    fetch(oauth2AuthCheckUrl, { credentials: 'include' })
      .then(function (response) {
        checkInFlight = false;
        if (response.status === 401) {
          redirectToLogin();
        }
      })
      .catch(function () {
        checkInFlight = false;
      });
  }

  // Wired into dicomweb-client's errorInterceptor (see appInit.js /
  // DicomWebDataSource/index.ts), which runs for every QIDO/WADO call. This
  // fires on ANY such failure, not just 401/403: oauth2-proxy only answers
  // with a clean 401 when it recognizes a request as an API call (Accept:
  // application/json), and dicomweb-client sends `Accept:
  // application/dicom+json`, which oauth2-proxy does not treat as JSON -
  // instead it 302s to Keycloak like a browser navigation, which the
  // browser's XHR then reports as a bare network error (status 0). Since
  // the status here isn't a reliable signal either way, every failure is
  // routed through the same-origin check above instead.
  window.config.httpErrorHandler = function () {
    verifyThenRedirect();
  };

  ['mousemove', 'keydown', 'mousedown', 'touchstart', 'wheel'].forEach(function (eventName) {
    window.addEventListener(eventName, verifyThenRedirect, { passive: true });
  });
})();
