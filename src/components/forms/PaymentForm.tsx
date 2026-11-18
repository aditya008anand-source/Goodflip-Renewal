'use client';

import { useRef, useState, useTransition } from 'react';
import { recordPayment } from '@/app/(dashboard)/leads/[id]/actions';
import type { PaymentCategory } from '@/lib/types';

const DRUG_NAMES = ['Semaglutide', 'Mounjaro', 'Wegovy'] as const;
const CGM_TYPES = ['Libre', 'Libre2+', 'Goodflip'] as const;
const COACH_TYPES = ['Diet', 'Physio', 'CBT'] as const;

interface PlanDetails {
  planName: string;
  duration: string;
  diagnostics: { done: boolean | null; count: string };
  consultation: { done: boolean | null; count: string };
  coaches: string[];
  drug: { done: boolean | null; name: string; type: string };
  bca: { done: boolean | null; count: string };
  cgm: { done: boolean | null; types: string[]; sensorCount: string; transmitterCount: string };
}

const emptyPlanDetails: PlanDetails = {
  planName: '',
  duration: '',
  diagnostics: { done: null, count: '' },
  consultation: { done: null, count: '' },
  coaches: [],
  drug: { done: null, name: '', type: '' },
  bca: { done: null, count: '' },
  cgm: { done: null, types: [], sensorCount: '', transmitterCount: '' },
};

// Validates the Careplan plan-details form. Returns an error message, or
// null when everything mandatory is filled in. Every yes/no toggle must be
// answered either way; "Yes" then requires its own sub-fields.
function validatePlanDetails(d: PlanDetails): string | null {
  if (!d.planName.trim()) return 'Plan name is required.';
  if (!d.duration.trim()) return 'Duration is required.';
  if (d.diagnostics.done === null) return 'Please answer Diagnostics (Yes/No).';
  if (d.diagnostics.done && !d.diagnostics.count.trim()) return 'Diagnostics count is required.';
  if (d.consultation.done === null) return 'Please answer Dr. Consultation (Yes/No).';
  if (d.consultation.done && !d.consultation.count.trim()) return 'Dr. Consultation count is required.';
  if (d.coaches.length === 0) return 'Select at least one Coach type.';
  if (d.drug.done === null) return 'Please answer Drug (Yes/No).';
  if (d.drug.done) {
    if (!d.drug.name) return 'Drug name is required.';
    if (!d.drug.type.trim()) return 'Drug type is required.';
  }
  if (d.bca.done === null) return 'Please answer Device — BCA (Yes/No).';
  if (d.bca.done && !d.bca.count.trim()) return 'BCA count is required.';
  if (d.cgm.done === null) return 'Please answer Device — CGM (Yes/No).';
  if (d.cgm.done) {
    if (d.cgm.types.length === 0) return 'Select at least one CGM type.';
    if (d.cgm.types.includes('Goodflip') && !d.cgm.sensorCount.trim()) {
      return 'Goodflip Sensor Count is required.';
    }
  }
  return null;
}

function YesNoToggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean | null;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => onChange(true)}
          className={`px-2.5 py-1 text-xs rounded-md border ${
            value === true ? 'bg-brand-700 text-white border-brand-700' : 'border-slate-200 text-slate-600'
          }`}
        >
          Yes
        </button>
        <button
          type="button"
          onClick={() => onChange(false)}
          className={`px-2.5 py-1 text-xs rounded-md border ${
            value === false ? 'bg-slate-600 text-white border-slate-600' : 'border-slate-200 text-slate-600'
          }`}
        >
          No
        </button>
      </div>
    </div>
  );
}

export default function PaymentForm({
  leadId,
  categories,
}: {
  leadId: string;
  categories: PaymentCategory[];
}) {
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const [categoryId, setCategoryId] = useState('');
  const [planDetails, setPlanDetails] = useState<PlanDetails>(emptyPlanDetails);
  const [formError, setFormError] = useState<string | null>(null);

  const products = categories.filter((c) => c.kind === 'product');
  const services = categories.filter((c) => c.kind === 'service');
  const selectedCategory = categories.find((c) => c.id === categoryId);
  const isCareplan = selectedCategory?.target_group === 'careplan';

  function handleSubmit(formData: FormData) {
    setFormError(null);
    if (isCareplan) {
      const error = validatePlanDetails(planDetails);
      if (error) {
        setFormError(error);
        return;
      }
      formData.set('plan_details', JSON.stringify(planDetails));
    }
    startTransition(async () => {
      try {
        await recordPayment(leadId, formData);
        formRef.current?.reset();
        setCategoryId('');
        setPlanDetails(emptyPlanDetails);
      } catch (e: any) {
        setFormError(e.message);
      }
    });
  }

  return (
    <form ref={formRef} action={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Product / Service</label>
          <select
            name="category_id"
            required
            className="input"
            value={categoryId}
            onChange={(e) => {
              setCategoryId(e.target.value);
              setPlanDetails(emptyPlanDetails);
              setFormError(null);
            }}
          >
            <option value="" disabled>— Select —</option>
            {products.length > 0 && (
              <optgroup label="Product">
                {products.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </optgroup>
            )}
            {services.length > 0 && (
              <optgroup label="Service">
                {services.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </optgroup>
            )}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Amount (₹)</label>
          <input type="number" step="0.01" name="amount" required className="input" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Payment date</label>
          <input type="date" name="payment_date" required className="input" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Payment / Transaction ID</label>
          <input type="text" name="payment_ref" className="input" />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Payment screenshot</label>
        <input type="file" name="screenshot" accept="image/*" required className="input" />
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Remarks</label>
        <textarea name="remarks" rows={2} required className="input" />
      </div>

      {isCareplan && (
        <div className="border border-brand-700/30 bg-brand-700/5 rounded-lg p-3 space-y-3">
          <p className="text-xs font-semibold text-brand-700">
            Careplan plan details (required)
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Plan name</label>
              <input
                type="text"
                className="input"
                value={planDetails.planName}
                onChange={(e) => setPlanDetails((d) => ({ ...d, planName: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Duration</label>
              <input
                type="text"
                className="input"
                placeholder="e.g. 6 months"
                value={planDetails.duration}
                onChange={(e) => setPlanDetails((d) => ({ ...d, duration: e.target.value }))}
              />
            </div>
          </div>

          <YesNoToggle
            label="Diagnostics"
            value={planDetails.diagnostics.done}
            onChange={(v) =>
              setPlanDetails((d) => ({ ...d, diagnostics: { done: v, count: v ? d.diagnostics.count : '' } }))
            }
          />
          {planDetails.diagnostics.done && (
            <input
              type="number"
              className="input"
              placeholder="Diagnostics count"
              value={planDetails.diagnostics.count}
              onChange={(e) =>
                setPlanDetails((d) => ({ ...d, diagnostics: { ...d.diagnostics, count: e.target.value } }))
              }
            />
          )}

          <YesNoToggle
            label="Dr. Consultation"
            value={planDetails.consultation.done}
            onChange={(v) =>
              setPlanDetails((d) => ({ ...d, consultation: { done: v, count: v ? d.consultation.count : '' } }))
            }
          />
          {planDetails.consultation.done && (
            <input
              type="number"
              className="input"
              placeholder="Dr. Consultation count"
              value={planDetails.consultation.count}
              onChange={(e) =>
                setPlanDetails((d) => ({ ...d, consultation: { ...d.consultation, count: e.target.value } }))
              }
            />
          )}

          <div>
            <p className="text-xs font-medium text-slate-600 mb-1">Coaches (select all that apply)</p>
            <div className="flex gap-3 flex-wrap">
              {COACH_TYPES.map((c) => (
                <label key={c} className="flex items-center gap-1.5 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={planDetails.coaches.includes(c)}
                    onChange={(e) =>
                      setPlanDetails((d) => ({
                        ...d,
                        coaches: e.target.checked
                          ? [...d.coaches, c]
                          : d.coaches.filter((x) => x !== c),
                      }))
                    }
                  />
                  {c}
                </label>
              ))}
            </div>
          </div>

          <YesNoToggle
            label="Drug"
            value={planDetails.drug.done}
            onChange={(v) =>
              setPlanDetails((d) => ({ ...d, drug: { done: v, name: v ? d.drug.name : '', type: v ? d.drug.type : '' } }))
            }
          />
          {planDetails.drug.done && (
            <div className="space-y-2">
              <select
                className="input"
                value={planDetails.drug.name}
                onChange={(e) => setPlanDetails((d) => ({ ...d, drug: { ...d.drug, name: e.target.value } }))}
              >
                <option value="" disabled>— Select drug —</option>
                {DRUG_NAMES.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
              {planDetails.drug.name && (
                <input
                  type="text"
                  className="input"
                  placeholder="Drug type"
                  value={planDetails.drug.type}
                  onChange={(e) => setPlanDetails((d) => ({ ...d, drug: { ...d.drug, type: e.target.value } }))}
                />
              )}
            </div>
          )}

          <YesNoToggle
            label="Device — BCA"
            value={planDetails.bca.done}
            onChange={(v) => setPlanDetails((d) => ({ ...d, bca: { done: v, count: v ? d.bca.count : '' } }))}
          />
          {planDetails.bca.done && (
            <input
              type="number"
              className="input"
              placeholder="BCA count"
              value={planDetails.bca.count}
              onChange={(e) => setPlanDetails((d) => ({ ...d, bca: { ...d.bca, count: e.target.value } }))}
            />
          )}

          <YesNoToggle
            label="Device — CGM"
            value={planDetails.cgm.done}
            onChange={(v) =>
              setPlanDetails((d) => ({
                ...d,
                cgm: v
                  ? { ...d.cgm, done: v }
                  : { done: v, types: [], sensorCount: '', transmitterCount: '' },
              }))
            }
          />
          {planDetails.cgm.done && (
            <div className="space-y-2">
              <div className="flex gap-3 flex-wrap">
                {CGM_TYPES.map((t) => (
                  <label key={t} className="flex items-center gap-1.5 text-xs text-slate-700">
                    <input
                      type="checkbox"
                      checked={planDetails.cgm.types.includes(t)}
                      onChange={(e) =>
                        setPlanDetails((d) => ({
                          ...d,
                          cgm: {
                            ...d.cgm,
                            types: e.target.checked
                              ? [...d.cgm.types, t]
                              : d.cgm.types.filter((x) => x !== t),
                          },
                        }))
                      }
                    />
                    {t}
                  </label>
                ))}
              </div>
              {planDetails.cgm.types.includes('Goodflip') && (
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    className="input"
                    placeholder="Sensor count"
                    value={planDetails.cgm.sensorCount}
                    onChange={(e) =>
                      setPlanDetails((d) => ({ ...d, cgm: { ...d.cgm, sensorCount: e.target.value } }))
                    }
                  />
                  <input
                    type="number"
                    className="input"
                    placeholder="Transmitter count (optional)"
                    value={planDetails.cgm.transmitterCount}
                    onChange={(e) =>
                      setPlanDetails((d) => ({ ...d, cgm: { ...d.cgm, transmitterCount: e.target.value } }))
                    }
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {formError && <p className="text-xs text-red-600">{formError}</p>}

      <button type="submit" disabled={isPending} className="btn-primary">
        {isPending ? 'Saving…' : 'Record payment'}
      </button>
    </form>
  );
}
