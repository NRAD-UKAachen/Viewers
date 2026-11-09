import React, { ReactElement, memo, useCallback, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import {
  EVENTS,
  FileUploaderProgressEvent,
  IFileUploader,
  UploadRejection,
  UploadStatus,
} from '../../utils/FileUploader';
import { Icons } from '@ohif/ui-next';

type DicomUploadProgressItemProps = {
  fileUploader: IFileUploader;
};

// eslint-disable-next-line react/display-name
const DicomUploadProgressItem = memo(
  ({ fileUploader }: DicomUploadProgressItemProps): ReactElement => {
    const [percentComplete, setPercentComplete] = useState(fileUploader.getPercentComplete());
    const [failedReason, setFailedReason] = useState('');
    const [status, setStatus] = useState(fileUploader.getStatus());
    const [statusLabel, setStatusLabel] = useState(fileUploader.getStatusLabel?.() ?? '');

    const isComplete = useCallback(() => {
      return (
        status === UploadStatus.Failed ||
        status === UploadStatus.Cancelled ||
        status === UploadStatus.Success
      );
    }, [status]);

    useEffect(() => {
      const progressSubscription = fileUploader.subscribe(
        EVENTS.PROGRESS,
        (progressEvent: FileUploaderProgressEvent) => {
          setPercentComplete(progressEvent.percentComplete);
          setStatusLabel(fileUploader.getStatusLabel?.() ?? '');
        }
      );

      fileUploader
        .load()
        .catch((reason: UploadRejection) => {
          setStatus(reason.status);
          setFailedReason(reason.message ?? '');
        })
        .finally(() => {
          setStatus(fileUploader.getStatus());
          setStatusLabel(fileUploader.getStatusLabel?.() ?? '');
        });

      return () => progressSubscription.unsubscribe();
    }, []);

    const cancelUpload = useCallback(() => {
      fileUploader.cancel();
    }, []);

    const getStatusIcon = (): ReactElement => {
      switch (fileUploader.getStatus()) {
        case UploadStatus.Success:
          return (
            <Icons.ByName
              name="status-tracked"
              className="text-highlight"
            />
          );
        case UploadStatus.InProgress:
          return <Icons.ByName name="icon-transferring" className="text-highlight" />;
        case UploadStatus.Failed:
          return <Icons.ByName name="icon-alert-small" className="text-destructive" />;
        case UploadStatus.Cancelled:
          return <Icons.ByName name="icon-alert-outline" className="text-highlight" />;
        default:
          return <></>;
      }
    };

    return (
      <div className="min-h-14 border-input flex w-full items-center overflow-hidden border-b p-2.5 text-lg">
        <div className="self-top flex w-0 shrink grow flex-col gap-1">
          <div className="flex gap-4">
            <div className="flex w-6 shrink-0 items-center justify-center">{getStatusIcon()}</div>
            <div className="text-foreground overflow-hidden text-ellipsis whitespace-nowrap">
              {fileUploader.getFileName()}
            </div>
            {statusLabel && (
              <div className="text-muted-foreground shrink-0 whitespace-nowrap text-sm">
                {statusLabel}
              </div>
            )}
          </div>
          {failedReason && <div className="pl-10">{failedReason}</div>}
        </div>
        <div className="flex w-24 items-center">
          {!isComplete() && (
            <>
              {fileUploader.getStatus() === UploadStatus.InProgress && (
                <div className="w-10 text-right">{percentComplete}%</div>
              )}
              <div className="ml-auto flex cursor-pointer">
                <Icons.Close
                  className="text-primary self-center"
                  onClick={cancelUpload}
                />
              </div>
            </>
          )}
        </div>
      </div>
    );
  }
);

DicomUploadProgressItem.propTypes = {
  fileUploader: PropTypes.object.isRequired,
};

export default DicomUploadProgressItem;
