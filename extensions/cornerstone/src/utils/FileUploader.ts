// Shared contract for the upload modal, so it can drive a DicomFileUploader
// (raw DICOM -> STOW) and a NiftiFileUploader (NIfTI -> backend conversion ->
// STOW) through the same progress UI (DicomUploadProgress/Item).

export const EVENTS = {
  PROGRESS: 'event:FileUploader:progress',
};

export interface FileUploaderEvent {
  fileId: string | number;
}

export interface FileUploaderProgressEvent extends FileUploaderEvent {
  percentComplete: number;
}

export enum UploadStatus {
  NotStarted,
  InProgress,
  Success,
  Failed,
  Cancelled,
}

type CancelOrFailed = UploadStatus.Cancelled | UploadStatus.Failed;

export class UploadRejection {
  message: string;
  status: CancelOrFailed;

  constructor(status: CancelOrFailed, message: string) {
    this.message = message;
    this.status = status;
  }
}

export interface IFileUploader {
  getFileId(): string | number;
  getFileName(): string;
  getFileSize(): number;
  getStatus(): UploadStatus;
  getPercentComplete(): number;
  /** Short text for a phase that isn't reflected by percentComplete (e.g. server-side conversion). */
  getStatusLabel?(): string;
  cancel(): void;
  load(): Promise<void>;
  subscribe(eventName: string, callback: (...args: unknown[]) => void): { unsubscribe: () => void };
}
