import { PubSubService } from '@ohif/core';
import { EVENTS, IFileUploader, UploadRejection, UploadStatus } from './FileUploader';

export { EVENTS };

const JOB_POLL_INTERVAL_MS = 3000;
const JOB_POLL_TIMEOUT_MS = 20 * 60 * 1000; // 20 minutes

let nextFileId = 0;

export type VolumeUploadMetadata = {
  PatientName: string;
  PatientID: string;
  PatientBirthDate: string;
  PatientSex: string;
  StudyDate: string;
  AccessionNumber: string;
  StudyDescription: string;
  SeriesDescription: string;
  Modality: string;
};

type StartJobResponse = { job_id: string; status_url?: string };

/**
 * Uploads a NIfTI or NRRD file to the API's /volume_upload endpoint
 * (multipart, with XHR upload-progress events to match DicomFileUploader's
 * UX), then polls the returned job until the backend finishes converting it
 * to DICOM and STOWing it to dcm4chee. The backend dispatches on file
 * extension, so this class is format-agnostic.
 */
export default class VolumeFileUploader extends PubSubService implements IFileUploader {
  private _file: File;
  private _fileId: string;
  private _baseUrl: string;
  private _metadata: VolumeUploadMetadata;
  private _studyInstanceUID?: string;
  private _seriesNumber: number;
  private _loadPromise: Promise<void>;
  private _abortController = new AbortController();
  private _status: UploadStatus = UploadStatus.NotStarted;
  private _percentComplete = 0;
  private _statusLabel = '';

  constructor(
    file: File,
    baseUrl: string,
    metadata: VolumeUploadMetadata,
    studyInstanceUID: string | undefined,
    seriesNumber: number
  ) {
    super(EVENTS);
    this._file = file;
    this._fileId = `volume-${++nextFileId}-${file.name}`;
    this._baseUrl = baseUrl.replace(/\/+$/, '');
    this._metadata = metadata;
    this._studyInstanceUID = studyInstanceUID;
    this._seriesNumber = seriesNumber;
  }

  getFileId(): string {
    return this._fileId;
  }

  getFileName(): string {
    return this._file.name;
  }

  getFileSize(): number {
    return this._file.size;
  }

  getStatus(): UploadStatus {
    return this._status;
  }

  getPercentComplete(): number {
    return this._percentComplete;
  }

  getStatusLabel(): string {
    return this._statusLabel;
  }

  cancel(): void {
    this._abortController.abort();
  }

  async load(): Promise<void> {
    if (!this._loadPromise) {
      this._loadPromise = this._run();
    }
    return this._loadPromise;
  }

  private async _run(): Promise<void> {
    this._status = UploadStatus.InProgress;

    let job: StartJobResponse;
    try {
      job = await this._uploadFile();
    } catch (reason) {
      this._markRejected(reason);
      throw reason;
    }

    if (this._abortController.signal.aborted) {
      const rejection = new UploadRejection(UploadStatus.Cancelled, 'Cancelled');
      this._markRejected(rejection);
      throw rejection;
    }

    this._statusLabel = 'Converting to DICOM…';
    try {
      await this._pollJob(job);
    } catch (reason) {
      this._markRejected(reason);
      throw reason;
    }

    this._statusLabel = '';
    this._status = UploadStatus.Success;
  }

  private _uploadFile(): Promise<StartJobResponse> {
    return new Promise((resolve, reject) => {
      const formData = new FormData();
      formData.append('file', this._file, this._file.name);
      formData.append('metadata', JSON.stringify(this._metadata));
      if (this._studyInstanceUID) {
        formData.append('studyInstanceUID', this._studyInstanceUID);
      }
      formData.append('seriesNumber', String(this._seriesNumber));

      const request = new XMLHttpRequest();

      const abortCallback = () => request.abort();
      this._abortController.signal.addEventListener('abort', abortCallback);

      request.upload.addEventListener('progress', (evt: ProgressEvent) => {
        if (!evt.lengthComputable) {
          return;
        }
        this._percentComplete = Math.round((100 * evt.loaded) / evt.total);
        this._broadcastEvent(EVENTS.PROGRESS, {
          fileId: this._fileId,
          percentComplete: this._percentComplete,
        });
      });

      request.addEventListener('loadend', () => {
        this._abortController.signal.removeEventListener('abort', abortCallback);
      });

      request.addEventListener('timeout', () =>
        reject(new UploadRejection(UploadStatus.Failed, 'The request timed out.'))
      );
      request.addEventListener('abort', () =>
        reject(new UploadRejection(UploadStatus.Cancelled, 'Cancelled'))
      );
      request.addEventListener('error', () =>
        reject(new UploadRejection(UploadStatus.Failed, 'The upload failed.'))
      );
      request.addEventListener('load', () => {
        if (request.status < 200 || request.status >= 300) {
          reject(
            new UploadRejection(
              UploadStatus.Failed,
              `Upload failed (${request.status} ${request.statusText}).`
            )
          );
          return;
        }
        try {
          const body = JSON.parse(request.responseText);
          this._percentComplete = 100;
          this._broadcastEvent(EVENTS.PROGRESS, { fileId: this._fileId, percentComplete: 100 });
          resolve(body);
        } catch {
          reject(new UploadRejection(UploadStatus.Failed, 'Invalid response from server.'));
        }
      });

      request.open('POST', `${this._baseUrl}/volume_upload`);
      // The API is reached through the GUI's authenticated /api-proxy, which
      // is a cross-origin (same-site) call -- XHR drops cookies without this.
      request.withCredentials = true;
      request.send(formData);
    });
  }

  private async _pollJob(job: StartJobResponse): Promise<void> {
    // Joined by hand, not with `new URL()`: status_url is root-relative
    // ("/job_status/<id>") and `new URL()` resolves it against the origin,
    // discarding the "/api-proxy" path baseUrl now carries -- which would
    // poll a non-existent GUI route forever.
    const base = this._baseUrl.replace(/\/+$/, '');
    const statusUrl = job.status_url
      ? `${base}/${String(job.status_url).replace(/^\/+/, '')}`
      : `${base}/job_status/${job.job_id}`;

    const deadline = Date.now() + JOB_POLL_TIMEOUT_MS;

    while (Date.now() < deadline) {
      if (this._abortController.signal.aborted) {
        throw new UploadRejection(UploadStatus.Cancelled, 'Cancelled');
      }

      await new Promise(resolve => setTimeout(resolve, JOB_POLL_INTERVAL_MS));

      let response: Response;
      try {
        response = await fetch(statusUrl, {
          method: 'GET',
          mode: 'cors',
          credentials: 'include',
        });
      } catch {
        continue; // transient network hiccup, keep polling until the deadline
      }

      const body = await response.json().catch(() => ({}) as Record<string, string>);

      if (response.status === 404) {
        throw new UploadRejection(
          UploadStatus.Failed,
          body.error || 'Conversion job not found or expired.'
        );
      }
      if (!response.ok) {
        continue;
      }
      if (body.status === 'done') {
        return;
      }
      if (body.status === 'failed') {
        throw new UploadRejection(UploadStatus.Failed, body.error || 'Conversion failed.');
      }
      // pending / running -> keep polling
    }

    throw new UploadRejection(UploadStatus.Failed, 'Conversion timed out.');
  }

  private _markRejected(reason: unknown): void {
    if (this._status === UploadStatus.Failed || this._status === UploadStatus.Cancelled) {
      return;
    }
    this._status = reason instanceof UploadRejection ? reason.status : UploadStatus.Failed;
  }
}
