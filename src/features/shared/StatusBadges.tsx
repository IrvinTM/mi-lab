import {
  CircleCheck,
  CircleHelp,
  CircleX,
  Clock,
  PackagePlus,
  PackageX,
  ShoppingCart,
  TriangleAlert,
} from 'lucide-react';
import type { ExpiryStatus } from '@/domain/expiry';
import type { ReorderResult } from '@/domain/reorder';
import type { ISODate } from '@/domain/types';
import { formatExpiry, formatPackageCount, formatQuantity } from '@/lib/format';
import { Badge, type BadgeTone } from '@/ui';

/** Status → tone, icon and text (PLAN §8.2). Color is never the only indicator. */
const EXPIRY_TONE: Record<ExpiryStatus, { tone: BadgeTone; icon: typeof CircleX }> = {
  expired: { tone: 'red', icon: CircleX },
  critical: { tone: 'orange', icon: TriangleAlert },
  warning: { tone: 'yellow', icon: Clock },
  ok: { tone: 'green', icon: CircleCheck },
};

export function ExpiryBadge({
  status,
  daysLeft,
  expiryDate,
}: {
  status: ExpiryStatus;
  daysLeft: number;
  expiryDate: ISODate;
}) {
  const { tone, icon } = EXPIRY_TONE[status];
  return (
    <Badge tone={tone} icon={icon}>
      {formatExpiry(status, daysLeft, expiryDate)}
    </Badge>
  );
}

/** "Comprar 3 cajas" / "Agotado" / "Sobre el máximo" / "Configura el consumo" / "Stock suficiente". */
export function ReorderBadge({ reorder, unit }: { reorder: ReorderResult; unit: string }) {
  switch (reorder.status) {
    case 'out':
      return (
        <Badge tone="red" icon={PackageX}>
          Agotado
        </Badge>
      );
    case 'reorder':
      return (
        <Badge tone="red" icon={ShoppingCart}>
          {reorderText(reorder, unit)}
        </Badge>
      );
    case 'excess':
      return (
        <Badge tone="teal" icon={PackagePlus}>
          Sobre el máximo
        </Badge>
      );
    case 'unknown':
      return (
        <Badge tone="gray" icon={CircleHelp}>
          Configura el consumo
        </Badge>
      );
    case 'ok':
      return (
        <Badge tone="green" icon={CircleCheck}>
          Stock suficiente
        </Badge>
      );
  }
}

function reorderText(reorder: ReorderResult, unit: string): string {
  if (reorder.suggestedPackages) return `Comprar ${formatPackageCount(reorder.suggestedPackages)}`;
  if (reorder.suggestedQty) return `Comprar ${formatQuantity(reorder.suggestedQty, unit)}`;
  return 'Comprar';
}
