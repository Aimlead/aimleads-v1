import React, { useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, BrainCircuit, MessageSquare, TrendingUp, Zap, Target, BarChart3, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import BrandLogo from '@/components/brand/BrandLogo';
import { ROUTES } from '@/constants/routes';
import { useAuth } from '@/lib/AuthContext';

/* ─── Animated floating shape ───────────────────────────────────────────── */
function GeoShape({ className, delay = 0 }) {
  return (
    <motion.div
      className={className}
      animate={{
        y: [0, -18, 0],
        rotate: [0, 8, -4, 0],
        opacity: [0.18, 0.28, 0.18],
      }}
      transition={{ duration: 7 + delay, repeat: Infinity, ease: 'easeInOut', delay }}
    />
  );
}

/* ─── Product card ───────────────────────────────────────────────────────── */
function ProductCard({ icon: Icon, label, title, description, color, delay }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, delay }}
      className="relative group rounded-2xl overflow-hidden border border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.07] transition-all duration-300 p-6"
    >
      {/* Glow on hover */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
        style={{ background: `radial-gradient(ellipse 60% 50% at 50% 0%, ${color}15 0%, transparent 70%)` }}
      />
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center mb-4 flex-shrink-0"
        style={{ background: `${color}20`, border: `1px solid ${color}30` }}
      >
        <Icon className="w-5 h-5" style={{ color }} />
      </div>
      <p className="text-[11px] font-semibold uppercase tracking-widest mb-2" style={{ color }}>
        {label}
      </p>
      <h3 className="text-lg font-heading font-700 text-white mb-2 leading-snug">{title}</h3>
      <p className="text-sm text-white/55 leading-relaxed">{description}</p>
    </motion.div>
  );
}

/* ─── Stat ───────────────────────────────────────────────────────────────── */
function Stat({ value, label }) {
  return (
    <div className="text-center">
      <p className="text-3xl font-heading font-bold text-white mb-1">{value}</p>
      <p className="text-sm text-white/45">{label}</p>
    </div>
  );
}

/* ─── Main component ─────────────────────────────────────────────────────── */
export default function Home() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoadingAuth, navigateToLogin } = useAuth();

  const handleCta = () => {
    if (isAuthenticated) {
      navigate(ROUTES.dashboard);
    } else {
      navigateToLogin();
    }
  };

  const products = [
    {
      icon: Target,
      label: 'Lead Scoring',
      title: 'Score chaque lead contre votre ICP en secondes.',
      description:
        "L'IA analyse l'industrie, la taille, le rôle, la géographie et les signaux contextuels — et génère un score d'adéquation actionnable.",
      color: '#3A8DFF',
      delay: 0.15,
    },
    {
      icon: BrainCircuit,
      label: 'AI Insights',
      title: "Détectez les signaux d'achat avant vos concurrents.",
      description:
        "Claude raisonne sur vos données pour inférer des signaux d'intent : croissance active, changement de rôle, besoin réglementaire, timing opportun…",
      color: '#5AD38C',
      delay: 0.25,
    },
    {
      icon: MessageSquare,
      label: 'Outreach',
      title: 'Des icebreakers hyper-personnalisés en un clic.',
      description:
        "Emails, messages LinkedIn et ouvertures d'appel rédigés par l'IA — adaptés au contexte exact de chaque prospect pour maximiser les réponses.",
      color: '#FF6F61',
      delay: 0.35,
    },
  ];

  return (
    <div
      className="min-h-screen overflow-x-hidden"
      style={{ background: '#030d1a', fontFamily: 'Outfit, system-ui, sans-serif' }}
    >
      {/* ── Ambient background ── */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div
          style={{
            position: 'absolute', inset: 0,
            background:
              'radial-gradient(ellipse 80% 60% at 20% 40%, rgba(58,141,255,.07) 0%, transparent 60%),' +
              'radial-gradient(ellipse 60% 50% at 80% 60%, rgba(90,211,140,.05) 0%, transparent 55%),' +
              'radial-gradient(ellipse 50% 40% at 50% 90%, rgba(0,31,77,.8) 0%, transparent 70%)',
          }}
        />
      </div>

      {/* ── Floating geometric shapes ── */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <GeoShape
          delay={0}
          className="absolute top-[15%] right-[12%] w-64 h-20 rounded-[50px] opacity-[0.18]"
          style={{ background: 'linear-gradient(135deg,#3A8DFF,#5AD38C)', transform: 'rotate(-20deg)' }}
        />
        <GeoShape
          delay={1.5}
          className="absolute top-[55%] left-[8%] w-48 h-14 rounded-[40px] opacity-[0.12]"
          style={{ background: 'linear-gradient(135deg,#5AD38C,#3A8DFF)', transform: 'rotate(12deg)' }}
        />
        <GeoShape
          delay={3}
          className="absolute top-[35%] left-[22%] w-32 h-32 rounded-3xl opacity-[0.08]"
          style={{ background: '#3A8DFF', transform: 'rotate(45deg)' }}
        />
        <GeoShape
          delay={2}
          className="absolute bottom-[20%] right-[20%] w-56 h-16 rounded-[40px] opacity-[0.10]"
          style={{ background: 'linear-gradient(135deg,#FF6F61,#3A8DFF)', transform: 'rotate(8deg)' }}
        />
      </div>

      {/* ── Header ── */}
      <header className="relative z-10">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="flex items-center justify-between h-20">
            <BrandLogo variant="full" tone="light" className="h-8 w-auto max-w-[180px]" />
            <nav className="hidden md:flex items-center gap-8">
              <a href="#produits" className="text-sm text-white/50 hover:text-white transition-colors">Produits</a>
              <Link to={ROUTES.pricing} className="text-sm text-white/50 hover:text-white transition-colors">Tarifs</Link>
            </nav>
            <div className="flex items-center gap-3">
              {!isLoadingAuth && (
                isAuthenticated ? (
                  <Link to={ROUTES.dashboard}>
                    <Button
                      className="gap-2 text-sm font-semibold"
                      style={{ background: '#3A8DFF', color: '#fff' }}
                    >
                      Dashboard
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </Link>
                ) : (
                  <>
                    <Button
                      variant="ghost"
                      onClick={navigateToLogin}
                      className="text-sm text-white/60 hover:text-white hover:bg-white/10"
                    >
                      Connexion
                    </Button>
                    <Button
                      onClick={handleCta}
                      className="gap-2 text-sm font-semibold"
                      style={{ background: '#3A8DFF', color: '#fff' }}
                    >
                      Démarrer
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </>
                )
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="relative z-10 flex items-center justify-center min-h-[88vh] px-6">
        <div className="max-w-3xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-8 text-sm font-medium"
              style={{ background: 'rgba(58,141,255,.10)', border: '1px solid rgba(58,141,255,.25)', color: '#3A8DFF' }}>
              <span className="w-2 h-2 rounded-full bg-brand-mint animate-pulse" />
              IA accessible aux PME &amp; ETI
            </div>

            <h1
              className="text-5xl sm:text-6xl lg:text-[72px] font-heading font-extrabold text-white leading-[1.08] tracking-tight mb-6"
              style={{ fontFamily: 'Bricolage Grotesque, system-ui, sans-serif' }}
            >
              L'IA qui travaille.<br />
              <span style={{ color: '#3A8DFF' }}>Pendant que vous scalez.</span>
            </h1>

            <p className="text-lg sm:text-xl text-white/55 mb-10 max-w-xl mx-auto leading-relaxed">
              AimLeads rend l'intelligence artificielle concrète et rentable — scoring ICP, signaux d'achat et outreach
              personnalisé, en quelques secondes par lead.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-4">
              <Button
                size="lg"
                onClick={handleCta}
                className="gap-2 text-base font-semibold px-8 py-6 rounded-xl shadow-lg"
                style={{ background: '#3A8DFF', color: '#fff', boxShadow: '0 8px 32px rgba(58,141,255,.35)' }}
              >
                Analyser mes leads
                <ArrowRight className="w-5 h-5" />
              </Button>
              <Link to={ROUTES.pricing}>
                <Button
                  variant="ghost"
                  size="lg"
                  className="gap-2 text-base font-medium px-8 py-6 rounded-xl text-white/60 hover:text-white hover:bg-white/10"
                >
                  Voir les tarifs
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Stats bar ── */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="relative z-10 py-12 border-y border-white/[0.06]"
      >
        <div className="max-w-4xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8">
          <Stat value="90%" label="de temps économisé par lead" />
          <Stat value="×3" label="taux de réponse outreach" />
          <Stat value="< 5s" label="analyse complète par lead" />
          <Stat value="100%" label="données dans votre workspace" />
        </div>
      </motion.section>

      {/* ── Products ── */}
      <section id="produits" className="relative z-10 py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-center mb-14"
          >
            <p className="text-xs font-bold uppercase tracking-[3px] text-brand-sky mb-4">La plateforme</p>
            <h2
              className="text-3xl sm:text-4xl font-heading font-bold text-white"
              style={{ fontFamily: 'Bricolage Grotesque, system-ui, sans-serif' }}
            >
              Tout ce dont votre équipe commerciale a besoin
            </h2>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-5">
            {products.map((p) => (
              <ProductCard key={p.label} {...p} />
            ))}
          </div>
        </div>
      </section>

      {/* ── Benefits ── */}
      <section className="relative z-10 py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="rounded-3xl p-10 md:p-14 border border-white/[0.07]"
            style={{ background: 'linear-gradient(135deg, rgba(0,31,77,.8) 0%, rgba(0,39,94,.6) 100%)' }}>
            <div className="grid md:grid-cols-2 gap-10 items-center">
              <div>
                <p className="text-xs font-bold uppercase tracking-[3px] text-brand-mint mb-4">Pourquoi AimLeads</p>
                <h2
                  className="text-3xl font-heading font-bold text-white mb-6"
                  style={{ fontFamily: 'Bricolage Grotesque, system-ui, sans-serif' }}
                >
                  Stop au travail manuel. Place à l'intelligence.
                </h2>
                <Button
                  onClick={handleCta}
                  className="gap-2 font-semibold"
                  style={{ background: '#3A8DFF', color: '#fff', boxShadow: '0 4px 20px rgba(58,141,255,.3)' }}
                >
                  Commencer gratuitement
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </div>

              <ul className="space-y-4">
                {[
                  { icon: Zap, text: 'Score ICP déterministe + enrichissement IA en < 5 secondes' },
                  { icon: Target, text: 'Profil ICP configurable : industrie, taille, rôle, géographie' },
                  { icon: BarChart3, text: 'Analytics, pipeline Kanban et rapports d\'export CSV' },
                  { icon: TrendingUp, text: 'Signaux d\'achat inférés sans accès internet : raisonnement pur' },
                ].map(({ icon: Icon, text }, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                      style={{ background: 'rgba(90,211,140,.15)' }}>
                      <Icon className="w-3.5 h-3.5 text-brand-mint" />
                    </div>
                    <span className="text-sm text-white/70 leading-relaxed">{text}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="relative z-10 py-24 px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.55 }}
          className="max-w-2xl mx-auto"
        >
          <h2
            className="text-4xl sm:text-5xl font-heading font-bold text-white mb-6"
            style={{ fontFamily: 'Bricolage Grotesque, system-ui, sans-serif' }}
          >
            Prêt à scorer vos leads<br />avec l'IA ?
          </h2>
          <p className="text-white/50 mb-8 text-lg">Configurez votre ICP et analysez votre premier lead en moins de 2 minutes.</p>
          <Button
            size="lg"
            onClick={handleCta}
            className="gap-2 text-base font-semibold px-10 py-6 rounded-xl"
            style={{ background: '#3A8DFF', color: '#fff', boxShadow: '0 8px 40px rgba(58,141,255,.4)' }}
          >
            Accéder à AimLeads
            <ArrowRight className="w-5 h-5" />
          </Button>
        </motion.div>
      </section>

      {/* ── Footer ── */}
      <footer className="relative z-10 border-t border-white/[0.06] py-8 px-6">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <BrandLogo variant="full" tone="light" className="h-6 w-auto opacity-60" />
          <p className="text-sm text-white/30">© {new Date().getFullYear()} AimLeads. Tous droits réservés.</p>
        </div>
      </footer>
    </div>
  );
}
