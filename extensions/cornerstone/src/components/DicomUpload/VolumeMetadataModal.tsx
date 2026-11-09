import React, { ReactElement, useState } from 'react';
import PropTypes from 'prop-types';
import {
  Button,
  Input,
  Label,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@ohif/ui-next';
import { VolumeUploadMetadata } from '../../utils/VolumeFileUploader';

type VolumeMetadataModalProps = {
  files: File[];
  onCancel: () => void;
  onSubmit: (
    metadata: Omit<VolumeUploadMetadata, 'SeriesDescription'>,
    seriesDescriptions: string[]
  ) => void;
};

const MODALITY_OPTIONS = ['MR', 'CT', 'PT', 'OT'];

const todayAsDicomDate = (): string => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
};

const dicomDateToInputDate = (dicomDate: string): string =>
  /^\d{8}$/.test(dicomDate)
    ? `${dicomDate.slice(0, 4)}-${dicomDate.slice(4, 6)}-${dicomDate.slice(6, 8)}`
    : '';

const inputDateToDicomDate = (inputDate: string): string => inputDate.replace(/-/g, '');

const randomDigits = (length: number): string =>
  Array.from({ length }, () => Math.floor(Math.random() * 10)).join('');

const RANDOM_FIRST_NAMES = ['JOHN', 'JANE', 'ALEX', 'SAM', 'TAYLOR', 'JORDAN', 'CASEY', 'MORGAN'];
const RANDOM_LAST_NAMES = ['DOE', 'SMITH', 'MUELLER', 'SCHMIDT', 'FISCHER', 'WEBER', 'MEYER'];

const randomPatientName = (): string => {
  const first = RANDOM_FIRST_NAMES[Math.floor(Math.random() * RANDOM_FIRST_NAMES.length)];
  const last = RANDOM_LAST_NAMES[Math.floor(Math.random() * RANDOM_LAST_NAMES.length)];
  return `${last}^${first}`;
};

const stripExtension = (filename: string): string => filename.replace(/\.(nii(\.gz)?|nrrd)$/i, '');

/**
 * Collects the DICOM patient/study metadata a bare NIfTI/NRRD file has no
 * header for, before it's converted and uploaded. Shown by DicomUpload.tsx
 * when a dropped batch contains convertible volume files, ahead of the same
 * progress UI used for plain DICOM uploads.
 */
function VolumeMetadataModal({ files, onCancel, onSubmit }: VolumeMetadataModalProps): ReactElement {
  const [metadata, setMetadata] = useState<Omit<VolumeUploadMetadata, 'SeriesDescription'>>({
    PatientName: '',
    PatientID: '',
    PatientBirthDate: '',
    PatientSex: '',
    StudyDate: todayAsDicomDate(),
    AccessionNumber: '',
    StudyDescription: '',
    Modality: 'MR',
  });
  const [seriesDescriptions, setSeriesDescriptions] = useState<string[]>(
    files.map(file => stripExtension(file.name))
  );

  const setField =
    (field: keyof typeof metadata) =>
    (value: string): void =>
      setMetadata(prev => ({ ...prev, [field]: value }));

  const randomizePatientInfo = (): void => {
    setMetadata(prev => ({
      ...prev,
      PatientName: randomPatientName(),
      PatientID: randomDigits(8),
      PatientBirthDate: '19000101',
      PatientSex: ['M', 'F', 'O'][Math.floor(Math.random() * 3)],
      AccessionNumber: randomDigits(10),
    }));
  };

  const canSubmit = metadata.PatientName.trim() !== '' && metadata.PatientID.trim() !== '';

  return (
    <div className="flex max-h-[calc(100vh-300px)] min-h-[375px] flex-col gap-4 overflow-y-auto p-5">
      <div className="text-foreground text-base">
        {files.length > 1
          ? `Uploading ${files.length} files as separate series of one study.`
          : 'Uploading 1 file.'}
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="text-muted-foreground text-sm">
          Fill in patient/study details, or generate anonymized placeholder values.
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={randomizePatientInfo}
        >
          Generate random patient info
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Patient Name *</Label>
          <Input
            value={metadata.PatientName}
            placeholder="LastName^FirstName"
            onChange={e => setField('PatientName')(e.target.value)}
          />
        </div>
        <div>
          <Label>Patient ID *</Label>
          <Input
            value={metadata.PatientID}
            onChange={e => setField('PatientID')(e.target.value)}
          />
        </div>
        <div>
          <Label>Patient Birth Date</Label>
          <Input
            type="date"
            value={dicomDateToInputDate(metadata.PatientBirthDate)}
            onChange={e => setField('PatientBirthDate')(inputDateToDicomDate(e.target.value))}
          />
        </div>
        <div>
          <Label>Patient Sex</Label>
          <Select
            value={metadata.PatientSex || undefined}
            onValueChange={setField('PatientSex')}
          >
            <SelectTrigger>
              <SelectValue placeholder="Unspecified" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="M">M</SelectItem>
              <SelectItem value="F">F</SelectItem>
              <SelectItem value="O">O</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Study Date</Label>
          <Input
            type="date"
            value={dicomDateToInputDate(metadata.StudyDate)}
            onChange={e => setField('StudyDate')(inputDateToDicomDate(e.target.value))}
          />
        </div>
        <div>
          <Label>Accession Number</Label>
          <Input
            value={metadata.AccessionNumber}
            onChange={e => setField('AccessionNumber')(e.target.value)}
          />
        </div>
        <div>
          <Label>Modality</Label>
          <Select
            value={metadata.Modality}
            onValueChange={setField('Modality')}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MODALITY_OPTIONS.map(modality => (
                <SelectItem
                  key={modality}
                  value={modality}
                >
                  {modality}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Study Description</Label>
          <Input
            value={metadata.StudyDescription}
            placeholder="Uploaded study"
            onChange={e => setField('StudyDescription')(e.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>{files.length > 1 ? 'Series Descriptions' : 'Series Description'}</Label>
        {files.map((file, index) => (
          <div
            key={`${file.name}-${index}`}
            className="flex items-center gap-2"
          >
            <span className="text-muted-foreground w-48 shrink-0 overflow-hidden text-ellipsis whitespace-nowrap text-sm">
              {file.name}
            </span>
            <Input
              value={seriesDescriptions[index]}
              onChange={e =>
                setSeriesDescriptions(prev =>
                  prev.map((description, i) => (i === index ? e.target.value : description))
                )
              }
            />
          </div>
        ))}
      </div>

      <div className="mt-auto flex justify-end gap-2 pt-2">
        <Button
          variant="ghost"
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button
          variant="default"
          disabled={!canSubmit}
          onClick={() => onSubmit(metadata, seriesDescriptions)}
        >
          Upload
        </Button>
      </div>
    </div>
  );
}

VolumeMetadataModal.propTypes = {
  files: PropTypes.arrayOf(PropTypes.instanceOf(File)).isRequired,
  onCancel: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired,
};

export default VolumeMetadataModal;
