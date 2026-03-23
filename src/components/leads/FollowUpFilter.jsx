import React from 'react';
import { UserCheck } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FOLLOW_UP_STATUS } from '@/constants/leads';

const FOLLOW_UP_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: FOLLOW_UP_STATUS.TO_CONTACT, label: 'To Contact' },
  { value: FOLLOW_UP_STATUS.CONTACTED, label: 'Contacted' },
  { value: FOLLOW_UP_STATUS.REPLY_PENDING, label: 'Pending' },
  { value: FOLLOW_UP_STATUS.CLOSED_WON, label: 'Won' },
  { value: FOLLOW_UP_STATUS.CLOSED_LOST, label: 'Lost' },
];

export default function FollowUpFilter({ value, onChange }) {
  return (
    <div className="flex items-center gap-3">
      <UserCheck className="w-4 h-4 text-slate-400" />
      <Tabs value={value} onValueChange={onChange} className="w-full overflow-x-auto">
        <TabsList className="bg-slate-100 w-max min-w-full justify-start">
          {FOLLOW_UP_OPTIONS.map((option) => (
            <TabsTrigger key={option.value} value={option.value}>
              {option.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  );
}
