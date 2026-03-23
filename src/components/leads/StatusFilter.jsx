import React from 'react';
import { Filter } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LEAD_STATUS } from '@/constants/leads';

const STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: LEAD_STATUS.TO_ANALYZE, label: 'To Analyze' },
  { value: LEAD_STATUS.PROCESSING, label: 'Processing' },
  { value: LEAD_STATUS.QUALIFIED, label: 'Qualified' },
  { value: LEAD_STATUS.REJECTED, label: 'Rejected' },
  { value: LEAD_STATUS.ERROR, label: 'Error' },
];

export default function StatusFilter({ value, onChange }) {
  return (
    <div className="flex items-center gap-3">
      <Filter className="w-4 h-4 text-slate-400" />
      <Tabs value={value} onValueChange={onChange} className="w-full overflow-x-auto">
        <TabsList className="bg-slate-100 w-max min-w-full justify-start">
          {STATUS_OPTIONS.map((option) => (
            <TabsTrigger key={option.value} value={option.value}>
              {option.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  );
}
