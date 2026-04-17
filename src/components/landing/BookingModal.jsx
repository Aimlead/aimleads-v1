import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { dataClient } from '@/services/dataClient';

export default function BookingModal({ open, onClose }) {
  const { t } = useTranslation();
  const [submitted, setSubmitted] = useState(false);
  const [submissionNote, setSubmissionNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose?.();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    const formData = new FormData(e.currentTarget);
    const fullName = String(formData.get('full_name') || '').trim();
    const company = String(formData.get('company') || '').trim();
    const email = String(formData.get('email') || '').trim();
    const teamSize = String(formData.get('team_size') || '').trim();
    const interest = String(formData.get('interest') || '').trim();
    const notes = String(formData.get('notes') || '').trim();

    try {
      await dataClient.public.submitDemoRequest({
        full_name: fullName,
        company,
        email,
        team_size: teamSize,
        interest,
        notes,
        source: 'landing_booking_modal',
      });

      await dataClient.public.trackEvent({
        event: 'demo_request_submitted',
        path: typeof window !== 'undefined' ? window.location.pathname : '/booking',
        source: 'booking_modal',
        properties: {
          interest: interest || 'unspecified',
          company,
        },
      }).catch(() => {});

      setSubmissionNote(t('landing.bookingModal.successNote'));
      setSubmitted(true);
    } catch (submitError) {
      setError(submitError?.message || t('landing.bookingModal.errorFallback'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="modal-overlay"
      style={{ display: 'flex' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <button className="modal-close" type="button" onClick={onClose} aria-label={t('common.close')}>✕</button>

        {submitted ? (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>✅</div>
            <div id={titleId} className="modal-title">{t('landing.bookingModal.successTitle')}</div>
            <p id={descriptionId} className="modal-sub">{submissionNote || t('landing.bookingModal.successNote')}</p>
            <button className="m-submit" type="button" onClick={onClose} style={{ marginTop: 16 }}>
              {t('common.close')}
            </button>
          </div>
        ) : (
          <>
            <div id={titleId} className="modal-title">{t('landing.bookingModal.title')}</div>
            <p id={descriptionId} className="modal-sub">{t('landing.bookingModal.subtitle')}</p>
            <form className="m-form" onSubmit={handleSubmit}>
              <div className="m-row">
                <input type="text" name="full_name" className="m-input" placeholder={t('landing.bookingModal.placeholderName')} required />
                <input type="text" name="company" className="m-input" placeholder={t('landing.bookingModal.placeholderCompany')} required />
              </div>
              <input type="email" name="email" className="m-input" placeholder={t('landing.bookingModal.placeholderEmail')} required />
              <input type="text" name="team_size" className="m-input" placeholder={t('landing.bookingModal.placeholderTeamSize')} />
              <select name="interest" className="m-select" defaultValue="">
                <option disabled value="">{t('landing.bookingModal.selectInterestDefault')}</option>
                <option>{t('landing.bookingModal.interestConseil')}</option>
                <option>{t('landing.bookingModal.interestLeadScorer')}</option>
                <option>{t('landing.bookingModal.interestBdr')}</option>
                <option>{t('landing.bookingModal.interestAll')}</option>
              </select>
              <textarea name="notes" className="m-input" placeholder={t('landing.bookingModal.placeholderNotes')} rows={3} />
              {error ? <p className="m-note" style={{ color: '#b91c1c' }}>{error}</p> : null}
              <button className="m-submit" type="submit" disabled={submitting}>
                {submitting ? t('landing.bookingModal.submitting') : t('landing.bookingModal.submit')}
              </button>
              <p className="m-note">{t('landing.bookingModal.footer')}</p>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
