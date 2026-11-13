import { Compass } from 'lucide-react';
import { useNavigate } from 'react-router';
import { Button, EmptyState, useDocumentTitle } from '@/ui';

/** Unknown address: says so in Spanish and offers the way back, inside the app frame. */
export function NotFoundPage() {
  const navigate = useNavigate();
  useDocumentTitle('Página no encontrada');
  return (
    <EmptyState
      icon={Compass}
      title="Página no encontrada"
      action={
        <Button variant="tinted" onClick={() => void navigate('/')}>
          Ir al Resumen
        </Button>
      }
    >
      Esta dirección no existe. Revisa el enlace o vuelve al Resumen.
    </EmptyState>
  );
}
