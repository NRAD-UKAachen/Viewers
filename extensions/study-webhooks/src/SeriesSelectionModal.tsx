import React, { useMemo, useState } from 'react';
import { Checkbox, FooterAction } from '@ohif/ui-next';

export interface SeriesOption {
  studyInstanceUID: string;
  seriesInstanceUID: string;
  /** Study-level label (date + description) shown as a group header. */
  studyLabel: string;
  /** Series-level label (number + modality + description). */
  label: string;
  /** e.g. 'CT' -- lets a dialog restrict itself to the series it can act on. */
  modality?: string;
  /**
   * Only series from the active study can be the "center" -- co-registering
   * always aligns other series onto the study currently open in the viewer.
   * Series from prior studies (e.g. an older PET) can only be "moving".
   */
  isCenterEligible: boolean;
}

export interface SeriesSelectionValue {
  studyInstanceUID: string;
  seriesInstanceUID: string;
}

interface SeriesSelectionModalProps {
  hide: () => void;
  series: SeriesOption[];
  onConfirm: (selection: {
    centerSeriesUID: string;
    movingSeries: SeriesSelectionValue[];
  }) => void;
}

const seriesKey = (s: { studyInstanceUID: string; seriesInstanceUID: string }) =>
  `${s.studyInstanceUID}:${s.seriesInstanceUID}`;

/**
 * Lets the user pick one "center" (fixed/reference) series from the active
 * study, and one-or-more "moving" series -- from the active study or any of
 * the patient's other studies -- to co-register onto it. A series can't be
 * both center and moving at once.
 */
export function SeriesSelectionModal({ hide, series, onConfirm }: SeriesSelectionModalProps) {
  const defaultCenter = series.find(s => s.isCenterEligible);
  const [centerKey, setCenterKey] = useState<string>(defaultCenter ? seriesKey(defaultCenter) : '');
  const [movingKeys, setMovingKeys] = useState<Set<string>>(new Set());

  const groups = useMemo(() => {
    const byStudy = new Map<string, { studyLabel: string; series: SeriesOption[] }>();
    for (const s of series) {
      if (!byStudy.has(s.studyInstanceUID)) {
        byStudy.set(s.studyInstanceUID, { studyLabel: s.studyLabel, series: [] });
      }
      byStudy.get(s.studyInstanceUID).series.push(s);
    }
    return Array.from(byStudy.values());
  }, [series]);

  const toggleMoving = (key: string, checked: boolean) => {
    setMovingKeys(prev => {
      const next = new Set(prev);
      if (checked) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  };

  const handleCenterChange = (key: string) => {
    setCenterKey(key);
    setMovingKeys(prev => {
      if (!prev.has(key)) {
        return prev;
      }
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  };

  const canConfirm = Boolean(centerKey) && movingKeys.size > 0;

  return (
    <div className="text-foreground text-[13px]">
      <p className="mb-3">
        Choose the fixed "center" series (from the current study) that other series will be
        aligned to, and one or more "moving" series -- from this study or a prior one -- to
        co-register onto it.
      </p>
      <div className="max-h-96 space-y-3 overflow-y-auto pr-2">
        <div className="text-foreground/60 flex gap-3 px-1.5 text-xs uppercase tracking-wide">
          <span className="w-12 shrink-0 text-center">Center</span>
          <span className="w-12 shrink-0 text-center">Moving</span>
          <span>Series</span>
        </div>
        {groups.map(group => (
          <div key={group.series[0] ? seriesKey(group.series[0]) : group.studyLabel}>
            <div className="text-foreground/80 border-b border-b-white/10 px-1.5 pb-1 text-xs font-semibold">
              {group.studyLabel}
            </div>
            <div className="space-y-1 pt-1">
              {group.series.map(s => {
                const key = seriesKey(s);
                return (
                  <label
                    key={key}
                    className="hover:bg-primary/10 flex items-center gap-3 rounded p-1.5"
                  >
                    <span className="flex w-12 shrink-0 justify-center">
                      {s.isCenterEligible && (
                        <input
                          type="radio"
                          name="center-series"
                          aria-label={`Use "${s.label}" as the center series`}
                          className="accent-primary h-4 w-4"
                          checked={centerKey === key}
                          onChange={() => handleCenterChange(key)}
                        />
                      )}
                    </span>
                    <span className="flex w-12 shrink-0 justify-center">
                      <Checkbox
                        aria-label={`Use "${s.label}" as a moving series`}
                        checked={movingKeys.has(key)}
                        disabled={centerKey === key}
                        onCheckedChange={checked => toggleMoving(key, checked === true)}
                      />
                    </span>
                    <span className="truncate">{s.label}</span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <FooterAction className="mt-4">
        <FooterAction.Right>
          <FooterAction.Secondary onClick={hide}>Cancel</FooterAction.Secondary>
          <FooterAction.Primary
            disabled={!canConfirm}
            onClick={() => {
              const center = series.find(s => seriesKey(s) === centerKey);
              const moving = series.filter(s => movingKeys.has(seriesKey(s)));
              onConfirm({
                centerSeriesUID: center.seriesInstanceUID,
                movingSeries: moving.map(s => ({
                  studyInstanceUID: s.studyInstanceUID,
                  seriesInstanceUID: s.seriesInstanceUID,
                })),
              });
              hide();
            }}
          >
            Start
          </FooterAction.Primary>
        </FooterAction.Right>
      </FooterAction>
    </div>
  );
}
