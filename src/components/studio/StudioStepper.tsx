'use client';

import React from 'react';
import { Check, UploadCloud, Sliders, CreditCard } from 'lucide-react';

export type StudioStep = 1 | 2 | 3;

interface StudioStepperProps {
  currentStep: StudioStep;
  onStepClick: (step: StudioStep) => void;
  maxAccessibleStep: StudioStep;
  totalPages?: number;
  fileName?: string;
}

export function StudioStepper({
  currentStep,
  onStepClick,
  maxAccessibleStep,
  totalPages,
}: StudioStepperProps) {
  const steps = [
    {
      id: 1 as StudioStep,
      name: 'Upload',
      icon: UploadCloud,
      label: 'Document',
    },
    {
      id: 2 as StudioStep,
      name: 'Pages',
      icon: Sliders,
      label: totalPages ? `${totalPages} Page${totalPages > 1 ? 's' : ''}` : 'Inspector',
    },
    {
      id: 3 as StudioStep,
      name: 'Print & Pay',
      icon: CreditCard,
      label: 'Checkout',
    },
  ];

  return (
    <div className="w-full">
      <div className="p-1 rounded-2xl bg-slate-900/80 dark:bg-black/50 border border-slate-200/40 dark:border-white/10 shadow-lg backdrop-blur-xl flex items-center justify-between gap-1">
        {steps.map((step) => {
          const isActive = currentStep === step.id;
          const isCompleted = step.id < currentStep;
          const isClickable = step.id <= maxAccessibleStep;
          const Icon = step.icon;

          return (
            <button
              key={step.id}
              type="button"
              disabled={!isClickable}
              onClick={() => onStepClick(step.id)}
              className={`flex-1 py-2 px-2.5 sm:px-3 rounded-xl flex items-center justify-center gap-2 transition-all duration-200 text-xs font-semibold select-none ${
                isActive
                  ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-500/25'
                  : isCompleted
                  ? 'text-slate-300 hover:text-white hover:bg-white/5 cursor-pointer'
                  : isClickable
                  ? 'text-slate-400 hover:text-slate-200 hover:bg-white/5 cursor-pointer'
                  : 'text-slate-600 dark:text-slate-500 opacity-60 cursor-not-allowed'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 transition-transform ${
                  isActive
                    ? 'bg-white text-indigo-700 shadow-inner'
                    : isCompleted
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                    : 'bg-white/10 text-slate-400'
                }`}
              >
                {isCompleted ? <Check className="w-3 h-3 stroke-[3]" /> : <Icon className="w-3 h-3" />}
              </div>

              <div className="text-left hidden xs:block sm:block">
                <span className="block leading-none text-[11px] sm:text-xs">{step.name}</span>
                <span className={`block text-[9px] sm:text-[10px] leading-tight font-normal ${
                  isActive ? 'text-indigo-100' : 'text-slate-400'
                }`}>
                  {step.label}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
