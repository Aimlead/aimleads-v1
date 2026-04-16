import { useEffect, useId, useState } from 'react';
import { dataClient } from '@/services/dataClient';

export default function BookingModal({ open, onClose }) {
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

      setSubmissionNote("Votre demande a bien ete transmise. L'equipe AimLeads revient vers vous sous 24h ouvrées.");
      setSubmitted(true);
    } catch (submitError) {
      setError(submitError?.message || "Impossible d'envoyer la demande pour le moment. Reessayez dans quelques instants.");
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
        <button className="modal-close" type="button" onClick={onClose} aria-label="Fermer">✕</button>

        {submitted ? (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>✅</div>
            <div id={titleId} className="modal-title">Demande recue !</div>
            <p id={descriptionId} className="modal-sub">{submissionNote || "Votre demande a bien ete transmise."}</p>
            <button className="m-submit" type="button" onClick={onClose} style={{ marginTop: 16 }}>
              Fermer
            </button>
          </div>
        ) : (
          <>
            <div id={titleId} className="modal-title">Reservez votre audit offert</div>
            <p id={descriptionId} className="modal-sub">
              30 minutes pour identifier vos 3 priorites IA. Reponse sous 24h, sans engagement.
            </p>
            <form className="m-form" onSubmit={handleSubmit}>
              <div className="m-row">
                <input type="text" name="full_name" className="m-input" placeholder="Prenom &amp; Nom" required />
                <input type="text" name="company" className="m-input" placeholder="Votre entreprise" required />
              </div>
              <input type="email" name="email" className="m-input" placeholder="Email professionnel" required />
              <input type="text" name="team_size" className="m-input" placeholder="Taille de votre equipe commerciale" />
              <select name="interest" className="m-select" defaultValue="">
                <option disabled value="">Je suis interesse par…</option>
                <option>Conseil &amp; Formation Claude</option>
                <option>Lead-Scoreur SaaS</option>
                <option>BDR Automatise</option>
                <option>Les 3 solutions</option>
              </select>
              <textarea name="notes" className="m-input" placeholder="Contexte, objectif ou urgence (optionnel)" rows={3} />
              {error ? <p className="m-note" style={{ color: '#b91c1c' }}>{error}</p> : null}
              <button className="m-submit" type="submit" disabled={submitting}>
                {submitting ? 'Envoi en cours...' : 'Demander mon audit →'}
              </button>
              <p className="m-note">Confirmation directement dans l'app · Suivi manuel par l'equipe AimLeads</p>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
