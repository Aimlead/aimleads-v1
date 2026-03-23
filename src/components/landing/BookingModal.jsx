import { useState } from 'react';

export default function BookingModal({ open, onClose }) {
  const [submitted, setSubmitted] = useState(false);

  if (!open) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    setSubmitted(true);
    setTimeout(() => {
      setSubmitted(false);
      onClose();
    }, 2500);
  };

  return (
    <div
      className="modal-overlay"
      style={{ display: 'flex' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal">
        <button className="modal-close" onClick={onClose}>✕</button>

        {submitted ? (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>✅</div>
            <div className="modal-title">Demande reçue !</div>
            <p className="modal-sub">Nous vous recontactons sous 24h. À très vite !</p>
          </div>
        ) : (
          <>
            <div className="modal-title">Réservez votre audit offert</div>
            <p className="modal-sub">
              30 minutes pour identifier vos 3 priorités IA. Réponse sous 24h, sans engagement.
            </p>
            <form className="m-form" onSubmit={handleSubmit}>
              <div className="m-row">
                <input type="text" className="m-input" placeholder="Prénom &amp; Nom" required />
                <input type="text" className="m-input" placeholder="Votre entreprise" required />
              </div>
              <input type="email" className="m-input" placeholder="Email professionnel" required />
              <input type="text" className="m-input" placeholder="Taille de votre équipe commerciale" />
              <select className="m-select" defaultValue="">
                <option disabled value="">Je suis intéressé par…</option>
                <option>Conseil &amp; Formation Claude</option>
                <option>Lead-Scoreur SaaS</option>
                <option>BDR Automatisé</option>
                <option>Les 3 solutions</option>
              </select>
              <button className="m-submit" type="submit">
                Réserver mon audit gratuit →
              </button>
              <p className="m-note">Réponse garantie sous 24h · Aucun CB requis · Sans engagement</p>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
