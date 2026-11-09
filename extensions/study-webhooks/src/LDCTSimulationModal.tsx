import React, { useState } from 'react';
import { Checkbox, FooterAction, Input, Label } from '@ohif/ui-next';
import { SeriesOption } from './SeriesSelectionModal';

/**
 * The LDCT pipeline's steps, in execution order, as the service names them
 * (STEPS in LDCT_Alsaihati's ldct/blueprint.py). Offered as the "start at" /
 * "stop after" range so a run can be resumed or cut short -- note that the
 * simulated series only reaches dcm4chee if step8_4 runs, which is what the
 * default (start at step0, stop after nothing) does.
 */
const STEP_OPTIONS = [
  { value: 'step0', label: 'step0 - DICOM to NumPy' },
  { value: 'step1', label: 'step1 - GNI preprocessing' },
  { value: 'step2', label: 'step2 - NPS computation' },
  { value: 'step3', label: 'step3 - Forward projection' },
  { value: 'step4', label: 'step4 - Add noise' },
  { value: 'step5', label: 'step5 - Back projection' },
  { value: 'step6_1', label: 'step6_1 - NPS noise image' },
  { value: 'step6_2', label: 'step6_2 - Filter noise' },
  { value: 'step7_1', label: 'step7_1 - Noise GNI' },
  { value: 'step7_2', label: 'step7_2 - Scale noise' },
  { value: 'step8_1', label: 'step8_1 - Save NumPy' },
  { value: 'step8_2', label: 'step8_2 - Save NIfTI' },
  { value: 'step8_3', label: 'step8_3 - Save DICOM series' },
  { value: 'step8_4', label: 'step8_4 - Upload to DICOMweb' },
];

const DEFAULTS = {
  f: 0.25,
  beta: 0.5,
  useGpu: true,
  gpuIndex: 0,
  numpyFilename: 'ldct_sim.npy',
  niftiFilename: 'ldct_sim.nii.gz',
  startAt: 'step0',
  stopAfter: '',
  outputSeriesDescription: 'LDCT Simulation - Alsaihati Method',
};

export interface LDCTSimulationParams {
  seriesInstanceUID: string;
  f: number;
  beta: number;
  use_gpu: boolean;
  gpu_index: number;
  ldct_numpy_filename: string;
  ldct_nifti_filename: string;
  start_at: string;
  stop_after: string;
  output_series_description: string;
}

interface LDCTSimulationModalProps {
  hide: () => void;
  /** CT series of the active study -- one of these is simulated. */
  series: SeriesOption[];
  onConfirm: (params: LDCTSimulationParams) => void;
}

// Native <select> styled to match ui-next's Input. Used instead of ui-next's
// Radix Select because that one portals its listbox out of the dialog, which
// puts it behind the modal overlay.
const selectClassName =
  'border-input text-foreground bg-background hover:bg-primary/10 focus-visible:ring-ring ' +
  'flex h-7 w-full rounded border px-2 py-1 text-base shadow-sm transition-colors ' +
  'focus-visible:outline-none focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-50';

/**
 * Collects everything POST /ldct/<studyInstanceUID> needs: which CT series of
 * the active study to simulate a low-dose acquisition of, and the pipeline's
 * parameters. Only the dose factor, output series name and GPU toggle are
 * shown by default -- the rest keep the service's own defaults unless the
 * "Optional settings" section is opened.
 */
export function LDCTSimulationModal({ hide, series, onConfirm }: LDCTSimulationModalProps) {
  const [seriesInstanceUID, setSeriesInstanceUID] = useState(
    series[0]?.seriesInstanceUID ?? ''
  );
  const [f, setF] = useState(String(DEFAULTS.f));
  const [beta, setBeta] = useState(String(DEFAULTS.beta));
  const [useGpu, setUseGpu] = useState(DEFAULTS.useGpu);
  const [gpuIndex, setGpuIndex] = useState(String(DEFAULTS.gpuIndex));
  const [numpyFilename, setNumpyFilename] = useState(DEFAULTS.numpyFilename);
  const [niftiFilename, setNiftiFilename] = useState(DEFAULTS.niftiFilename);
  const [startAt, setStartAt] = useState(DEFAULTS.startAt);
  const [stopAfter, setStopAfter] = useState(DEFAULTS.stopAfter);
  const [outputSeriesDescription, setOutputSeriesDescription] = useState(
    DEFAULTS.outputSeriesDescription
  );
  const [showOptional, setShowOptional] = useState(false);

  // Kept as strings while typing so the fields can be cleared and retyped;
  // parsed (and range-checked) here, which is also what gates the Start button.
  const parsedF = parseFloat(f);
  const parsedBeta = parseFloat(beta);
  const parsedGpuIndex = parseInt(gpuIndex, 10);
  const canConfirm =
    Boolean(seriesInstanceUID) &&
    parsedF > 0 &&
    parsedF <= 1 &&
    parsedBeta >= 0 &&
    (!useGpu || parsedGpuIndex >= 0);

  const handleConfirm = () => {
    onConfirm({
      seriesInstanceUID,
      f: parsedF,
      beta: parsedBeta,
      use_gpu: useGpu,
      gpu_index: useGpu ? parsedGpuIndex : 0,
      ldct_numpy_filename: numpyFilename,
      ldct_nifti_filename: niftiFilename,
      start_at: startAt,
      stop_after: stopAfter,
      output_series_description: outputSeriesDescription,
    });
    hide();
  };

  return (
    <div className="text-foreground text-[13px]">
      <p className="mb-3">
        Simulates a reduced-dose acquisition of a full-dose CT series (Alsaihati method) and
        uploads the result as a new series in this study. The pipeline runs on the GPU and
        typically takes 15-30 minutes.
      </p>

      <div className="max-h-96 space-y-4 overflow-y-auto pr-2">
        <div className="space-y-1">
          <Label>CT series to simulate</Label>
          <select
            className={selectClassName}
            value={seriesInstanceUID}
            onChange={e => setSeriesInstanceUID(e.target.value)}
          >
            {series.map(s => (
              <option
                key={s.seriesInstanceUID}
                value={s.seriesInstanceUID}
              >
                {s.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <Label>Dose factor (f)</Label>
          <Input
            type="number"
            value={f}
            onChange={e => setF(e.target.value)}
            min={0.01}
            max={1}
            step={0.01}
          />
          <p className="text-foreground/60 text-xs">0.25 simulates 25% of the original dose.</p>
        </div>

        <div className="space-y-1">
          <Label>Output series description</Label>
          <Input
            type="text"
            value={outputSeriesDescription}
            onChange={e => setOutputSeriesDescription(e.target.value)}
          />
          <p className="text-foreground/60 text-xs">
            Series name the simulated DICOM series is uploaded under.
          </p>
        </div>

        <label className="flex items-center gap-3">
          <Checkbox
            checked={useGpu}
            onCheckedChange={checked => setUseGpu(checked === true)}
          />
          <span>Use GPU acceleration</span>
        </label>

        <div>
          <button
            type="button"
            onClick={() => setShowOptional(!showOptional)}
            className="hover:text-primary-light flex items-center gap-2 font-medium"
          >
            <span className={`transition-transform ${showOptional ? 'rotate-90' : ''}`}>›</span>
            Optional settings
          </button>

          {showOptional && (
            <div className="mt-3 space-y-4 border-l-2 border-white/10 pl-4">
              <div className="space-y-1">
                <Label>Beta (β)</Label>
                <Input
                  type="number"
                  value={beta}
                  onChange={e => setBeta(e.target.value)}
                  min={0}
                  max={1}
                  step={0.1}
                />
                <p className="text-foreground/60 text-xs">Dose-noise relationship.</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Start at step</Label>
                  <select
                    className={selectClassName}
                    value={startAt}
                    onChange={e => setStartAt(e.target.value)}
                  >
                    {STEP_OPTIONS.map(option => (
                      <option
                        key={option.value}
                        value={option.value}
                      >
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <Label>Stop after step</Label>
                  <select
                    className={selectClassName}
                    value={stopAfter}
                    onChange={e => setStopAfter(e.target.value)}
                  >
                    <option value="">Run all steps</option>
                    {STEP_OPTIONS.map(option => (
                      <option
                        key={option.value}
                        value={option.value}
                      >
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>NumPy filename</Label>
                  <Input
                    type="text"
                    value={numpyFilename}
                    onChange={e => setNumpyFilename(e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <Label>NIfTI filename</Label>
                  <Input
                    type="text"
                    value={niftiFilename}
                    onChange={e => setNiftiFilename(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label>GPU index</Label>
                <Input
                  type="number"
                  value={gpuIndex}
                  onChange={e => setGpuIndex(e.target.value)}
                  min={0}
                  disabled={!useGpu}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      <FooterAction className="mt-4">
        <FooterAction.Right>
          <FooterAction.Secondary onClick={hide}>Cancel</FooterAction.Secondary>
          <FooterAction.Primary
            disabled={!canConfirm}
            onClick={handleConfirm}
          >
            Start simulation
          </FooterAction.Primary>
        </FooterAction.Right>
      </FooterAction>
    </div>
  );
}
