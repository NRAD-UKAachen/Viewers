import React, { useCallback, useState } from 'react';
import { ReactElement } from 'react';
import Dropzone from 'react-dropzone';
import PropTypes from 'prop-types';
import classNames from 'classnames';
import { useSystem } from '@ohif/core';
import DicomFileUploader from '../../utils/DicomFileUploader';
import VolumeFileUploader from '../../utils/VolumeFileUploader';
import { IFileUploader } from '../../utils/FileUploader';
import type { VolumeUploadMetadata } from '../../utils/VolumeFileUploader';
import DicomUploadProgress from './DicomUploadProgress';
import VolumeMetadataModal from './VolumeMetadataModal';
import { Button } from '@ohif/ui-next';
// Removed dashed border CSS; using simple 1px solid border with muted foreground color

// Formats the backend can convert to DICOM (see API's VOLUME_CONVERTERS in
// routes.py) -- anything else is assumed to already be DICOM.
const isConvertibleVolumeFile = (file: File): boolean => /\.(nii(\.gz)?|nrrd)$/i.test(file.name);

type DicomUploadProps = {
  dataSource;
  onComplete: () => void;
  onStarted: () => void;
};

function DicomUpload({ dataSource, onComplete, onStarted }: DicomUploadProps): ReactElement {
  const { extensionManager } = useSystem();
  const baseClassNames =
    'min-h-[375px] flex flex-col bg-background select-none rounded-lg overflow-hidden';
  const [fileUploaderArr, setFileUploaderArr] = useState<IFileUploader[]>([]);
  const [pendingConversionFiles, setPendingConversionFiles] = useState<File[] | null>(null);

  const startDicomUploaders = useCallback((files: File[]) => {
    setFileUploaderArr(prev => [...prev, ...files.map(file => new DicomFileUploader(file, dataSource))]);
  }, []);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const convertibleFiles = acceptedFiles.filter(isConvertibleVolumeFile);
    const dicomFiles = acceptedFiles.filter(file => !isConvertibleVolumeFile(file));

    onStarted();

    if (dicomFiles.length) {
      startDicomUploaders(dicomFiles);
    }
    if (convertibleFiles.length) {
      // NIfTI/NRRD files carry no patient/study identifiers, so collect them
      // before starting any upload -- shown ahead of the same progress UI
      // used for plain DICOM uploads.
      setPendingConversionFiles(convertibleFiles);
    }
  }, []);

  const startVolumeUploaders = useCallback(
    (metadata: Omit<VolumeUploadMetadata, 'SeriesDescription'>, seriesDescriptions: string[]) => {
      const volumeUploadConfig = extensionManager.appConfig?.niftiUpload;
      const baseUrl = volumeUploadConfig?.baseUrl;
      const files = pendingConversionFiles ?? [];

      setPendingConversionFiles(null);

      if (!baseUrl) {
        console.warn('[DicomUpload] missing "niftiUpload.baseUrl" config; cannot upload NIfTI/NRRD files.');
        return;
      }

      const startUploaders = (studyInstanceUID?: string) => {
        setFileUploaderArr(prev => [
          ...prev,
          ...files.map(
            (file, index) =>
              new VolumeFileUploader(
                file,
                baseUrl,
                { ...metadata, SeriesDescription: seriesDescriptions[index] ?? file.name },
                studyInstanceUID,
                index + 1
              )
          ),
        ]);
      };

      if (files.length > 1) {
        // Multiple files in one batch must share a StudyInstanceUID to land
        // as separate series of the same study, rather than separate studies.
        fetch(`${baseUrl.replace(/\/+$/, '')}/new_study_uid`, { method: 'GET', mode: 'cors', credentials: 'include' })
          .then(response => response.json())
          .then(body => startUploaders(body.studyInstanceUID))
          .catch(() => startUploaders(undefined));
      } else {
        startUploaders(undefined);
      }
    },
    [pendingConversionFiles, extensionManager]
  );

  const getDropZoneComponent = (): ReactElement => {
    return (
      <Dropzone
        onDrop={acceptedFiles => {
          onDrop(acceptedFiles);
        }}
        noClick
      >
        {({ getRootProps }) => (
          <div
            {...getRootProps()}
            className="m-5 flex h-full flex-col items-center justify-center rounded-2xl border"
            style={{ borderColor: 'hsl(var(--muted-foreground) / 0.25)' }}
          >
            <div className="flex gap-2">
              <Dropzone
                onDrop={onDrop}
                noDrag
              >
                {({ getRootProps, getInputProps }) => (
                  <div {...getRootProps()}>
                    <Button
                      variant="default"
                      size="lg"
                      disabled={false}
                      onClick={() => {}}
                    >
                      {'Add files'}
                      <input
                        {...getInputProps()}
                        style={{ display: 'none' }}
                      />
                    </Button>
                  </div>
                )}
              </Dropzone>
              <Dropzone
                onDrop={onDrop}
                noDrag
              >
                {({ getRootProps, getInputProps }) => (
                  <div {...getRootProps()}>
                    <Button
                      variant="secondary"
                      size="lg"
                      disabled={false}
                      onClick={() => {}}
                    >
                      {'Add folder'}
                      <input
                        {...getInputProps()}
                        webkitdirectory="true"
                        mozdirectory="true"
                        style={{ display: 'none' }}
                      />
                    </Button>
                  </div>
                )}
              </Dropzone>
            </div>
            <div className="text-foreground pt-6 text-base">or drag images or folders here</div>
            <div className="text-muted-foreground pt-1 text-base">
              (DICOM, NIfTI, or NRRD files supported)
            </div>
          </div>
        )}
      </Dropzone>
    );
  };

  if (pendingConversionFiles) {
    return (
      <div className={classNames('h-[calc(100vh-300px)]', baseClassNames)}>
        <VolumeMetadataModal
          files={pendingConversionFiles}
          onCancel={() => setPendingConversionFiles(null)}
          onSubmit={startVolumeUploaders}
        />
      </div>
    );
  }

  return (
    <>
      {fileUploaderArr.length ? (
        <div className={classNames('h-[calc(100vh-300px)]', baseClassNames)}>
          <DicomUploadProgress
            fileUploaderArr={Array.from(fileUploaderArr)}
            onComplete={onComplete}
          />
        </div>
      ) : (
        <div className={classNames('h-[480px]', baseClassNames)}>{getDropZoneComponent()}</div>
      )}
    </>
  );
}

DicomUpload.propTypes = {
  dataSource: PropTypes.object.isRequired,
  onComplete: PropTypes.func.isRequired,
  onStarted: PropTypes.func.isRequired,
};

export default DicomUpload;
