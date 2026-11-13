import { Minus, Plus } from 'lucide-react';
import { useNavigate } from 'react-router';
import { Button } from '@/ui';

/** The two primary actions, always visible in the toolbar: "+ Entrada" and "− Salida". */
export function PageActions({ productId }: { productId?: string }) {
  const navigate = useNavigate();
  const query = productId ? `?producto=${encodeURIComponent(productId)}` : '';
  return (
    <>
      <Button
        icon={Plus}
        title="Registrar entrada (N)"
        aria-keyshortcuts="N"
        onClick={() => void navigate(`/entrada${query}`)}
      >
        Entrada
      </Button>
      <Button
        icon={Minus}
        variant="tinted"
        title="Registrar salida (S)"
        aria-keyshortcuts="S"
        onClick={() => void navigate(`/salida${query}`)}
      >
        Salida
      </Button>
    </>
  );
}
