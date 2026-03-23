import { useNavigate } from 'react-router-dom';
import { ROUTES } from '@/constants/routes';

export default function LoginModal({ open, onClose, onShowMentions }) {
  const navigate = useNavigate();

  if (!open) return null;

  const goToLogin = () => {
    onClose();
    navigate(ROUTES.login);
  };

  return (
    <div
      className="modal-overlay"
      style={{ display: 'flex' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal" style={{ maxWidth: 420 }}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <div className="modal-title">Connexion à AimLeads</div>
        <p className="modal-sub">Accédez à votre espace scoring et pipeline.</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 24 }}>
          {/* SSO Google */}
          <button
            onClick={goToLogin}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '14px 20px', borderRadius: 12,
              border: '1.5px solid rgba(0,31,77,.12)',
              background: 'white', cursor: 'pointer',
              fontSize: 14, fontWeight: 500, color: '#333',
              transition: 'border-color .2s, box-shadow .2s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#3A8DFF'; e.currentTarget.style.boxShadow = '0 2px 12px rgba(58,141,255,.15)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(0,31,77,.12)'; e.currentTarget.style.boxShadow = 'none'; }}
          >
            <svg width="20" height="20" viewBox="0 0 48 48">
              <path fill="#4285F4" d="M47.5 24.6c0-1.6-.1-3.1-.4-4.6H24v8.7h13.2c-.6 3-2.3 5.5-4.9 7.2v6h7.9c4.6-4.2 7.3-10.5 7.3-17.3z"/>
              <path fill="#34A853" d="M24 48c6.5 0 12-2.1 16-5.8l-7.9-6c-2.2 1.5-5 2.3-8.1 2.3-6.2 0-11.5-4.2-13.4-9.8H2.5v6.2C6.5 42.5 14.7 48 24 48z"/>
              <path fill="#FBBC05" d="M10.6 28.7c-.5-1.5-.8-3-.8-4.7s.3-3.2.8-4.7v-6.2H2.5C.9 16.4 0 20.1 0 24s.9 7.6 2.5 10.9l8.1-6.2z"/>
              <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.5l6.8-6.8C35.9 2.3 30.5 0 24 0 14.7 0 6.5 5.5 2.5 13.1l8.1 6.2C12.5 13.7 17.8 9.5 24 9.5z"/>
            </svg>
            Continuer avec Google
          </button>

          {/* SSO Microsoft */}
          <button
            onClick={goToLogin}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '14px 20px', borderRadius: 12,
              border: '1.5px solid rgba(0,31,77,.12)',
              background: 'white', cursor: 'pointer',
              fontSize: 14, fontWeight: 500, color: '#333',
              transition: 'border-color .2s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#3A8DFF'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(0,31,77,.12)'; }}
          >
            <svg width="20" height="20" viewBox="0 0 21 21">
              <rect width="10" height="10" fill="#F25022"/>
              <rect x="11" width="10" height="10" fill="#7FBA00"/>
              <rect y="11" width="10" height="10" fill="#00A4EF"/>
              <rect x="11" y="11" width="10" height="10" fill="#FFB900"/>
            </svg>
            Continuer avec Microsoft
          </button>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: '#aaa', fontSize: 12, margin: '4px 0' }}>
            <div style={{ flex: 1, height: 1, background: 'rgba(0,31,77,.1)' }} />
            ou
            <div style={{ flex: 1, height: 1, background: 'rgba(0,31,77,.1)' }} />
          </div>

          {/* Email */}
          <button
            onClick={goToLogin}
            style={{
              padding: '14px 20px', borderRadius: 12,
              border: '1.5px solid rgba(0,31,77,.12)',
              background: 'white', cursor: 'pointer',
              fontSize: 14, fontWeight: 500, color: '#333',
              transition: 'border-color .2s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#3A8DFF'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(0,31,77,.12)'; }}
          >
            Continuer avec email →
          </button>
        </div>

        <p style={{ marginTop: 20, fontSize: 12, color: '#aaa', textAlign: 'center', lineHeight: 1.7 }}>
          En vous connectant, vous acceptez nos{' '}
          <button
            onClick={onShowMentions}
            style={{ color: '#3A8DFF', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 'inherit', textDecoration: 'underline' }}
          >CGU</button> et notre{' '}
          <button
            onClick={onShowMentions}
            style={{ color: '#3A8DFF', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 'inherit', textDecoration: 'underline' }}
          >politique de confidentialité</button>.
        </p>
      </div>
    </div>
  );
}
