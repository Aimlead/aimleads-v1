import React from 'react';
import { useTranslation } from 'react-i18next';
import { Filter } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LEAD_STATUS } from '@/constants/leads';

export default function StatusFilter({ value, onChange }) {
  const { t } = useTranslation();
  const statusOptions = [
    { value: 'all', label: t('leads.filters.status.all', { defaultValue: 'All' }) },
    { value: LEAD_STATUS.TO_ANALYZE, label: t('leads.filters.status.toAnalyze', { defaultValue: 'To Analyze' }) },
    { value: LEAD_STATUS.PROCESSING, label: t('leads.filters.status.processing', { defaultValue: 'Processing' }) },
    { value: LEAD_STATUS.QUALIFIED, label: t('leads.filters.status.qualified', { defaultValue: 'Qualified' }) },
    { value: LEAD_STATUS.REJECTED, label: t('leads.filters.status.rejected', { defaultValue: 'Rejected' }) },
    { value: LEAD_STATUS.ERROR, label: t('leads.filters.status.error', { defaultValue: 'Error' }) },
  ];

  return (
    <div className="flex items-center gap-3">
      <Filter className="w-4 h-4 text-slate-400" />
      <Tabs value={value} onValueChange={onChange} className="w-full overflow-x-auto">
        <TabsList className="bg-slate-100 w-max min-w-full justify-start">
          {statusOptions.map((option) => (
            <TabsTrigger key={option.value} value={option.value}>
              {option.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  );
}
