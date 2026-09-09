'use client';

import React from 'react';
import { Check } from 'lucide-react';

export type StudioStep = 1 | 2 | 3;

interface StudioStepperProps {
  currentStep: StudioStep;
  onStepClick: (step: StudioStep) => void;
  maxAccessibleStep: StudioStep;
  totalPages?: number;
}

export function StudioStepper({
  currentStep,
  onStepClick,
  maxAccessibleStep,
  totalPages,
}: StudioStepperProps) {
  const steps = [
    { id: 1 as StudioStep, title: 'Upload' },
    { id: 2 as StudioStep, title: totalPages ? `${totalPages} Pgs` : 'Customize' },
    { id: 3 as StudioStep, title: 'Checkout' },
  ];

  return (
    <div className="w-full">
      {/* shadcn/ui TabsList segmented container */}
      <div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs font-medium select-none">
        {steps.map((step) => {
          const isActive = currentStep === step.id;
          const isCompleted = step.id < currentStep;
          const isClickable = step.id <= maxAccessibleStep;

          return (
            <button
              key={step.id}
              type="button"
              disabled={!isClickable}
              onClick={() => onStepClick(step.id)}
              className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-md transition-all text-xs font-medium ${
                isActive
                  ? 'bg-white dark:bg-zinc-800 text-zinc-950 dark:text-zinc-50 shadow-xs'
                  : isCompleted
                  ? 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 cursor-pointer'
                  : isClickable
                  ? 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 cursor-pointer'
                  : 'text-zinc-400 dark:text-zinc-600 opacity-40 cursor-not-allowed'
              }`}
            >
              <span
                className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                  isActive
                    ? 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950'
                    : isCompleted
                    ? 'bg-emerald-500 text-white'
                    : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                }`}
              >
                {isCompleted ? <Check className="w-2.5 h-2.5 stroke-[3]" /> : step.id}
              </span>
              <span className="truncate">{step.title}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
