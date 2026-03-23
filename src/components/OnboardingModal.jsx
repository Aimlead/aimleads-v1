import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight, BarChart3, BookOpen, CheckCircle2, Sparkles, Target, Upload, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/constants/routes';

const STORAGE_KEY = 'aimleads:onboarding-done';

const STEPS = [
  {
    icon: Target,
    color: 'from-brand-sky to-brand-sky-2',
    title: 'Define your ICP',
    description: 'Set up your Ideal Customer Profile — industries, roles, company sizes and geography — to power AI-driven scoring.',
    action: { label: 'Configure ICP →', href: ROUTES.icp },
  },
  {
    icon: Upload,
    color: 'from-blue-500 to-sky-600',
    title: 'Import your leads',
    description: 'Upload a CSV with your prospects. AimLeads will score each lead against your ICP instantly.',
    action: { label: 'Go to Dashboard →', href: ROUTES.dashboard },
  },
  {
    icon: Sparkles,
    color: 'from-amber-500 to-orange-500',
    title: 'AI analysis & icebreakers',
    description: 'Click "Analyze" on any lead to get an AI score, intent signals, and personalized email/LinkedIn/call openers.',
    action: null,
  },
  {
    icon: BarChart3,
    color: 'from-emerald-500 to-teal-600',
    title: 'Track & iterate',
    description: 'Use the Pipeline, Analytics and Reports pages to track your outreach performance and refine your ICP over time.',
    action: { label: 'View Analytics →', href: ROUTES.analytics },
  },
];

export default function OnboardingModal() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    const done = localStorage.getItem(STORAGE_KEY);
    if (!done) {
      // Slight delay so the Dashboard renders first
      const t = setTimeout(() => setOpen(true), 800);
      return () => clearTimeout(t);
    }
  }, []);

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, '1');
    setOpen(false);
  };

  const handleAction = (action) => {
    if (action?.href) {
      dismiss();
      navigate(action.href);
    }
  };

  const current = STEPS[step];
  const Icon = current.icon;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-[90]"
            onClick={dismiss}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg z-[91] px-4"
          >
            <div className="bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-100">
              {/* Hero */}
              <div className={cn('relative h-36 bg-gradient-to-br flex items-center justify-center', current.color)}>
                <motion.div
                  key={step}
                  initial={{ scale: 0.7, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.25 }}
                  className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center"
                >
                  <Icon className="w-8 h-8 text-white" />
                </motion.div>

                {/* Close */}
                <button
                  onClick={dismiss}
                  className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>

                {/* Step dots */}
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
                  {STEPS.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setStep(i)}
                      className={cn(
                        'w-1.5 h-1.5 rounded-full transition-all duration-200',
                        i === step ? 'bg-white w-4' : 'bg-white/40'
                      )}
                    />
                  ))}
                </div>
              </div>

              {/* Content */}
              <div className="p-6">
                <motion.div
                  key={step}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    Step {step + 1} of {STEPS.length}
                  </p>
                  <h2 className="text-xl font-bold text-slate-900 mb-2">{current.title}</h2>
                  <p className="text-sm text-slate-500 leading-relaxed">{current.description}</p>
                </motion.div>

                <div className="flex items-center gap-3 mt-6">
                  {step < STEPS.length - 1 ? (
                    <>
                      <Button
                        className="flex-1 gap-2 rounded-xl"
                        onClick={() => setStep((s) => s + 1)}
                      >
                        Next
                        <ArrowRight className="w-4 h-4" />
                      </Button>
                      {current.action && (
                        <Button
                          variant="outline"
                          className="rounded-xl"
                          onClick={() => handleAction(current.action)}
                        >
                          {current.action.label}
                        </Button>
                      )}
                    </>
                  ) : (
                    <>
                      <Button className="flex-1 gap-2 rounded-xl" onClick={dismiss}>
                        <CheckCircle2 className="w-4 h-4" />
                        Get started!
                      </Button>
                      {current.action && (
                        <Button
                          variant="outline"
                          className="rounded-xl"
                          onClick={() => handleAction(current.action)}
                        >
                          {current.action.label}
                        </Button>
                      )}
                    </>
                  )}
                  <button
                    onClick={dismiss}
                    className="text-xs text-slate-400 hover:text-slate-600 transition-colors whitespace-nowrap"
                  >
                    Skip tour
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
