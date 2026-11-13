import { addDays } from '@/domain/dates';
import { allocateFefo } from '@/domain/fefo';
import type { InventoryData, ISODate, Lot, Movement, Product } from '@/domain/types';
import seedJson from '../../../docs/seed/inventario-octubre.json';
import { DEFAULT_SETTINGS } from '../migrate';

// --- Shape of docs/seed/inventario-octubre.json -------------------------------------------------

interface SeedItem {
  nombre: string;
  reserva: number | string;
  uso: number | null;
  pruebas: number | null;
  pruebasPorCaja?: number | null;
}

interface SeedArea {
  id: string;
  nombre: string;
  pruebasPorCaja: number | null;
  items: SeedItem[];
}

interface SeedCard {
  numero: string;
  codigo: string;
  presentacion: string | null;
  minimo: number | null;
  maximo: number | null;
  consumoPromedio: number | null;
}

const seed = seedJson as unknown as {
  areas: SeedArea[];
  cardex: { procedencias: { codigo: number; nombre: string }[]; tarjetas: SeedCard[] };
};

// --- Deterministic randomness -------------------------------------------------------------------

/** mulberry32: tiny seeded PRNG so the demo data is identical on every run. */
function mulberry32(seedValue: number): () => number {
  let state = seedValue;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rng = () => number;

/** Integer in [min, max], both included. */
function int(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

// --- Catalog ------------------------------------------------------------------------------------

/** Cardex card (by card number) merged into each Química seca item. */
const CARD_FOR_ITEM: Record<string, string> = {
  Glucosa: 'LRC-02-24',
  Colesterol: 'LRC-03-24',
  Triglicéridos: 'LRC-04-23',
  'Ácido úrico': 'LRC-05-24',
  Creatinina: 'LRC-06-24',
  'Nitrógeno ureico': 'LRC-07-24', // "Urea" card, renumbered (the original repeats LRC-06-24)
  HDL: 'LRC-09-24',
};

/** Cardex cards without a line in the October inventory: created as new products, no stock. */
const EXTRA_PRODUCTS = [
  { name: 'Hemograma', areaId: 'hematologia', card: 'LRC-01-24' },
  { name: 'LDL', areaId: 'quimica-seca', card: 'LRC-10-24' },
  { name: 'VPH', areaId: 'pruebas-especiales', card: 'LRC-22-24' },
];

/** Products that get 90 days of issue history (so consumption and the ledger have content). */
const HISTORY_PRODUCTS = [
  'Glucosa',
  'Colesterol',
  'Triglicéridos',
  'Ácido úrico',
  'Creatinina',
  'Nitrógeno ureico',
  'HDL',
  'TGO',
  'TGP',
  'PCR',
];

const HISTORY_DAYS = 90;
const MAX_OVERRIDES = 3;
const EXPIRED_PRODUCTS = 4;
const CRITICAL_GUARANTEE = 6;

interface Reserve {
  count: number;
  unit: 'caja' | 'frasco' | 'bolsa' | null;
}

/** "3 FRASCOS" → 3 frasco, "1/2 CAJA" → 1 caja (a fraction counts as 1), 17 → 17. */
function parseReserve(reserva: number | string): Reserve {
  if (typeof reserva === 'number') return { count: reserva, unit: null };
  const unit = /frasco/i.test(reserva)
    ? 'frasco'
    : /bolsa/i.test(reserva)
      ? 'bolsa'
      : /caja/i.test(reserva)
        ? 'caja'
        : null;
  if (/^\s*\d+\s*\/\s*\d+/.test(reserva)) return { count: 1, unit };
  const match = /^\s*(\d+)/.exec(reserva);
  return { count: match ? Number(match[1]) : 0, unit };
}

interface Planned {
  product: Product;
  /** Units in the open presentation (one lot, far expiry). */
  open: number;
  /** Units in closed stock (1–3 lots). */
  reserve: number;
  /** Granularity of the reserve split (units per box when known). */
  step: number;
  price: number;
}

function planProducts(rng: Rng): Planned[] {
  const cards = new Map(seed.cardex.tarjetas.map((card) => [card.numero, card]));
  const planned: Planned[] = [];
  let counter = 0;

  const applyCard = (product: Product, card: SeedCard): void => {
    product.code = card.codigo;
    product.cardNumber = card.numero;
    if (card.presentacion) product.packaging = card.presentacion;
    if (card.minimo !== null) product.minStock = card.minimo;
    if (card.maximo !== null) product.maxStock = card.maximo;
    if (card.consumoPromedio !== null) product.avgMonthlyConsumption = card.consumoPromedio;
  };

  for (const area of seed.areas) {
    for (const item of area.items) {
      counter += 1;
      const perBox = 'pruebasPorCaja' in item ? item.pruebasPorCaja : area.pruebasPorCaja;
      const numericTotal = item.pruebas;
      const reserve = parseReserve(item.reserva);
      const isTest = numericTotal !== null || (perBox ?? null) !== null;

      const product: Product = {
        id: `p${String(counter).padStart(3, '0')}`,
        name: item.nombre,
        areaId: area.id,
        unit: isTest ? 'prueba' : (reserve.unit ?? 'unidad'),
      };
      if (isTest && perBox) {
        product.unitsPerPackage = perBox;
        product.packaging = 'Caja';
      }

      let open: number;
      let closed: number;
      if (numericTotal !== null) {
        // The PDF total is the truth, even when it does not match reserva × caja + uso.
        open = reserve.count === 0 ? numericTotal : Math.min(item.uso ?? 0, numericTotal);
        closed = numericTotal - open;
      } else {
        open = item.uso ?? 0;
        closed = reserve.count;
      }

      const cardNumber = area.id === 'quimica-seca' ? CARD_FOR_ITEM[item.nombre] : undefined;
      const card = cardNumber ? cards.get(cardNumber) : undefined;
      if (card) {
        applyCard(product, card);
      } else if (numericTotal !== null && numericTotal > 0) {
        // Manual estimate so the stock covers between 0.5 and 3.5 months (varied purchase states).
        const coverMonths = 0.5 + rng() * 3;
        product.avgMonthlyConsumption = Math.max(1, Math.round(numericTotal / coverMonths));
      }
      planned.push({
        product,
        open,
        reserve: closed,
        step: product.unitsPerPackage ?? 1,
        price: Math.round((0.25 + rng() * 7.75) * 100) / 100,
      });
    }
  }

  for (const extra of EXTRA_PRODUCTS) {
    counter += 1;
    const area = seed.areas.find((a) => a.id === extra.areaId)!;
    const product: Product = {
      id: `p${String(counter).padStart(3, '0')}`,
      name: extra.name,
      areaId: extra.areaId,
      unit: 'prueba',
    };
    if (area.pruebasPorCaja) product.unitsPerPackage = area.pruebasPorCaja;
    applyCard(product, cards.get(extra.card)!);
    planned.push({
      product,
      open: 0,
      reserve: 0,
      step: product.unitsPerPackage ?? 1,
      price: Math.round((0.25 + rng() * 7.75) * 100) / 100,
    });
  }
  return planned;
}

// --- Lots ---------------------------------------------------------------------------------------

/** Splits `total` into `parts` pieces in multiples of `step`; the remainder goes to the last. */
function splitQuantity(total: number, parts: number, step: number): number[] {
  const boxes = Math.floor(total / step);
  const remainder = total - boxes * step;
  const count = Math.max(1, Math.min(parts, boxes));
  const base = Math.floor(boxes / count);
  const pieces = Array.from({ length: count }, (_, i) =>
    i < boxes - base * count ? base + 1 : base,
  ).map((n) => n * step);
  pieces[pieces.length - 1]! += remainder;
  return pieces.filter((n) => n > 0);
}

interface LotSpec {
  lot: Lot;
  /** Balance today (what the PDF says). */
  balance: number;
  /** Units consumed by the generated issue history. */
  consumed: number;
}

function pickEvenly<T>(candidates: T[], count: number): Set<T> {
  const picked = new Set<T>();
  if (candidates.length === 0) return picked;
  const stride = Math.max(1, Math.floor(candidates.length / count));
  for (let i = 1; picked.size < count && i < candidates.length; i += stride) {
    picked.add(candidates[i]!);
  }
  return picked;
}

export function buildSeed(today: ISODate): InventoryData {
  const rng = mulberry32(42);
  const planned = planProducts(rng);

  // Products that will carry an already-expired lot: ≥ 2 closed boxes, spread over the list.
  const expiredCandidates = planned.filter((p) => p.reserve >= 2 * p.step && p.step > 1);
  const expiredProducts = pickEvenly(expiredCandidates, EXPIRED_PRODUCTS);

  const usedNumbers = new Set<string>();
  const lotNumber = (): string => {
    let value: string;
    do value = `LT${int(rng, 100000, 999999)}`;
    while (usedNumbers.has(value));
    usedNumbers.add(value);
    return value;
  };

  const lots: Lot[] = [];
  const movements: Movement[] = [];
  let lotCounter = 0;
  let movementCounter = 0;
  let criticalCount = 0;
  let overridesLeft = MAX_OVERRIDES;

  const sourceCode = (): number => (rng() < 0.6 ? 1 : int(rng, 1, 16));

  const addMovement = (movement: Omit<Movement, 'id' | 'createdAt'> & { time: string }): void => {
    movementCounter += 1;
    const { time, ...rest } = movement;
    movements.push({
      id: `m${String(movementCounter).padStart(5, '0')}`,
      createdAt: `${movement.date}T${time}.000Z`,
      ...rest,
    });
  };

  for (const plan of planned) {
    const { product } = plan;
    const hasHistory =
      HISTORY_PRODUCTS.includes(product.name) && product.areaId !== 'quimica-humeda';
    const isExpiredProduct = expiredProducts.has(plan);
    const specs: LotSpec[] = [];

    const newLot = (balance: number, expiresIn: number, receivedAgo: number): void => {
      lotCounter += 1;
      specs.push({
        balance,
        consumed: 0,
        lot: {
          id: `l${String(lotCounter).padStart(4, '0')}`,
          productId: product.id,
          lotNumber: lotNumber(),
          expiryDate: addDays(today, expiresIn),
          receivedDate: addDays(today, -receivedAgo),
          sourceCode: sourceCode(),
          unitPrice: plan.price,
        },
      });
    };
    // History products are received before the first issue; the rest are more recent.
    const receivedAgo = (): number => (hasHistory ? int(rng, 100, 150) : int(rng, 10, 200));

    if (plan.open > 0) newLot(plan.open, int(rng, 240, 550), receivedAgo());

    if (plan.reserve > 0) {
      const wanted = isExpiredProduct ? Math.max(2, int(rng, 1, 3)) : int(rng, 1, 3);
      const quantities = splitQuantity(plan.reserve, wanted, plan.step);
      const expiries = quantities.map(() => int(rng, 180, 600)).sort((a, b) => a - b);

      if (isExpiredProduct) {
        expiries[0] = -int(rng, 5, 60);
      } else if (rng() < 0.3) {
        criticalCount += 1;
        expiries[0] = criticalCount <= CRITICAL_GUARANTEE ? int(rng, 10, 29) : int(rng, 10, 80);
      }
      quantities.forEach((quantity, i) => newLot(quantity, expiries[i]!, receivedAgo()));
    }

    // 90 days of FEFO issues; the history is generated first so receipts can cover it exactly.
    if (hasHistory && specs.length > 0 && product.avgMonthlyConsumption) {
      const perDay = product.avgMonthlyConsumption / 30.4375;
      const events: { date: ISODate; quantity: number }[] = [];
      for (let ago = HISTORY_DAYS; ago >= 1; ago -= int(rng, 2, 5)) {
        const quantity = Math.max(1, Math.round(perDay * (0.7 + rng() * 0.6) * 3));
        events.push({ date: addDays(today, -ago), quantity });
      }
      const overrideAt = Math.floor(events.length / 2);

      events.forEach(({ date, quantity }, index) => {
        const alive = specs.filter((s) => s.lot.receivedDate <= date);
        const result = allocateFefo(
          alive.map((s) => ({ lot: s.lot, balance: Number.MAX_SAFE_INTEGER })),
          quantity,
          date,
        );
        if (!result.ok) return;

        let lotId = result.allocations[0]!.lotId;
        let reason: string | undefined;
        const usable = alive.filter((s) => s.lot.expiryDate >= date);
        if (index === overrideAt && overridesLeft > 0 && usable.length >= 2) {
          // Not the FEFO lot: the one that expires last (the "open" one in the equipment).
          lotId = usable[usable.length - 1]!.lot.id;
          if (lotId === result.allocations[0]!.lotId) lotId = usable[0]!.lot.id;
          if (lotId !== result.allocations[0]!.lotId) {
            overridesLeft -= 1;
            reason = 'Lote abierto en el equipo';
          }
        }
        specs.find((s) => s.lot.id === lotId)!.consumed += quantity;
        addMovement({
          type: 'issue',
          date,
          productId: product.id,
          lotId,
          quantity,
          unitPrice: plan.price,
          concept: 'Consumo diario',
          time: '12:00:00',
          ...(reason ? { fefoOverrideReason: reason } : {}),
        });
      });
    }

    for (const spec of specs) {
      lots.push(spec.lot);
      addMovement({
        type: 'receipt',
        date: spec.lot.receivedDate,
        productId: product.id,
        lotId: spec.lot.id,
        quantity: spec.balance + spec.consumed,
        unitPrice: plan.price,
        concept: 'Compra',
        ...(spec.lot.sourceCode !== undefined ? { sourceCode: spec.lot.sourceCode } : {}),
        time: '08:00:00',
      });
    }
  }

  return {
    version: 1,
    areas: seed.areas.map((area) => ({ id: area.id, name: area.nombre })),
    fundingSources: seed.cardex.procedencias.map((p) => ({ code: p.codigo, name: p.nombre })),
    products: planned.map((p) => p.product),
    lots,
    movements,
    settings: { ...DEFAULT_SETTINGS, labName: 'Laboratorio Clínico' },
  };
}
