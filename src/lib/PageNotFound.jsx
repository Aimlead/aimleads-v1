import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ROUTES } from '@/constants/routes';

export default function PageNotFound() {
  const location = useLocation();

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-950">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="space-y-2">
          <h1 className="text-7xl font-light text-slate-600">404</h1>
          <div className="h-0.5 w-16 bg-slate-700 mx-auto" />
        </div>
        <div className="space-y-3">
          <h2 className="text-2xl font-medium text-slate-100">Page introuvable</h2>
          <p className="text-slate-400">La page <span className="font-mono text-slate-300 text-sm bg-slate-800 px-2 py-0.5 rounded">{location.pathname}</span> n&apos;existe pas.</p>
        </div>
        <div className="pt-6">
          <Button asChild variant="outline" className="border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-slate-100">
            <Link to={ROUTES.home}>Retour à l&apos;accueil</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
