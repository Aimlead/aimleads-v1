import React from 'react';
import { useTranslation } from 'react-i18next';
import { UserCheck } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FOLLOW_UP_STATUS } from '@/constants/leads';

export default function FollowUpFilter({ value, onChange }) {
  const { t } = useTranslation();
  const followUpOptions = [
    { value: 'all', label: t('leads.filters.followUp.all', { defaultValue: 'All' }) },
    { value: FOLLOW_UP_STATUS.TO_CONTACT, label: t('leads.filters.followUp.toContact', { defaultValue: 'To Contact' }) },
    { value: FOLLOW_UP_STATUS.CONTACTED, label: t('leads.filters.followUp.contacted', { defaultValue: 'Contacted' }) },
    { value: FOLLOW_UP_STATUS.REPLY_PENDING, label: t('leads.filters.followUp.pending', { defaultValue: 'Pending' }) },
    { value: FOLLOW_UP_STATUS.CLOSED_WON, label: t('leads.filters.followUp.won', { defaultValue: 'Won' }) },
    { value: FOLLOW_UP_STATUS.CLOSED_LOST, label: t('leads.filters.followUp.lost', { defaultValue: 'Lost' }) },
  ];

  return (
    <div className="flex items-center gap-3">
      <UserCheck className="w-4 h-4 text-slate-400" />
      <Tabs value={value} onValueChange={onChange} className="w-full overflow-x-auto">
        <TabsList className="bg-slate-100 w-max min-w-full justify-start">
          {followUpOptions.map((option) => (
            <TabsTrigger key={option.value} value={option.value}>
              {option.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  );
}
