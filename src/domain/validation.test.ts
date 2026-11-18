import {
  findExistingLot,
  isValid,
  LIMITS,
  MAX_ADJUSTMENT_REASON,
  normalizeLotNumber,
  validateAdjustment,
  validateAreaName,
  validateFundingSourceCode,
  validateFundingSourceName,
  validateIssue,
  validateProduct,
  validateReceipt,
  validateSettings,
  type IssueContext,
  type IssueForm,
  type ReceiptContext,
  type ReceiptForm,
} from './validation';
import type { Lot } from './types';

const TODAY = '2026-11-13';

const existingLot: Lot = {
  id: 'l1',
  productId: 'p1',
  lotNumber: 'LT123456',
  expiryDate: '2027-06-30',
  receivedDate: '2026-05-01',
};

const receiptContext: ReceiptContext = {
  today: TODAY,
  lots: [existingLot],
  fundingSources: [
    { code: 1, name: 'GOES' },
    { code: 16, name: 'Otros' },
    { code: LIMITS.maxSourceCode, name: 'Tope' },
  ],
  settings: { criticalDays: 30 },
  productExists: true,
};

function receipt(overrides: Partial<ReceiptForm> = {}): ReceiptForm {
  return {
    productId: 'p1',
    date: TODAY,
    lotNumber: 'lt999999',
    expiryDate: '2027-09-01',
    quantity: 48,
    ...overrides,
  };
}

describe('normalizeLotNumber / findExistingLot', () => {
  it('trims and upper-cases', () => {
    expect(normalizeLotNumber('  lt12ab ')).toBe('LT12AB');
  });

  it('finds a lot by product and normalized number', () => {
    expect(findExistingLot([existingLot], 'p1', ' lt123456 ')).toBe(existingLot);
    expect(findExistingLot([existingLot], 'p2', 'LT123456')).toBeUndefined();
    expect(findExistingLot([existingLot], 'p1', 'LT000000')).toBeUndefined();
  });
});

describe('validateReceipt', () => {
  it('accepts a complete, valid form with no messages', () => {
    const result = validateReceipt(receipt(), receiptContext);
    expect(result).toEqual({ errors: {}, warnings: {} });
    expect(isValid(result)).toBe(true);
  });

  it('requires a product that exists', () => {
    expect(
      validateReceipt(receipt({ productId: '' }), receiptContext).errors.productId,
    ).toBeTruthy();
    expect(
      validateReceipt(receipt(), { ...receiptContext, productExists: false }).errors.productId,
    ).toBeTruthy();
  });

  it('requires a lot number (blank counts as missing) and enforces LIMITS.shortText', () => {
    expect(validateReceipt(receipt({ lotNumber: '   ' }), receiptContext).errors.lotNumber).toBe(
      'Ingresa el número de lote.',
    );
    expect(
      validateReceipt(receipt({ lotNumber: `  ${'a'.repeat(LIMITS.shortText)}  ` }), receiptContext)
        .errors.lotNumber,
    ).toBeUndefined();
    expect(
      validateReceipt(receipt({ lotNumber: 'a'.repeat(LIMITS.shortText + 1) }), receiptContext)
        .errors.lotNumber,
    ).toBe(`El número de lote no puede superar ${LIMITS.shortText} caracteres.`);
  });

  describe('expiry date', () => {
    it('is required and must be a real date', () => {
      expect(
        validateReceipt(receipt({ expiryDate: '' }), receiptContext).errors.expiryDate,
      ).toBeTruthy();
      expect(
        validateReceipt(receipt({ expiryDate: '2027-02-30' }), receiptContext).errors.expiryDate,
      ).toBeTruthy();
    });

    it('is an error when the lot already expired', () => {
      const result = validateReceipt(receipt({ expiryDate: '2026-11-12' }), receiptContext);
      expect(result.errors.expiryDate).toMatch(/ya venció/);
    });

    it('must be after the receipt date (a lot expiring the day it arrives is rejected)', () => {
      const result = validateReceipt(receipt({ date: TODAY, expiryDate: TODAY }), receiptContext);
      expect(result.errors.expiryDate).toMatch(/posterior a la fecha de entrada/);
    });

    it('warns (without blocking) when it expires within the critical days', () => {
      const soon = validateReceipt(receipt({ expiryDate: '2026-12-13' }), receiptContext);
      expect(isValid(soon)).toBe(true);
      expect(soon.warnings.expiryDate).toBe('Este lote vence en 30 días.');

      const later = validateReceipt(receipt({ expiryDate: '2026-12-14' }), receiptContext);
      expect(later.warnings.expiryDate).toBeUndefined();
    });

    it('uses the configured critical days and singular "día"', () => {
      const result = validateReceipt(receipt({ expiryDate: '2026-11-14' }), receiptContext);
      expect(result.warnings.expiryDate).toBe('Este lote vence en 1 día.');
      const custom = validateReceipt(receipt({ expiryDate: '2027-01-01' }), {
        ...receiptContext,
        settings: { criticalDays: 60 },
      });
      expect(custom.warnings.expiryDate).toMatch(/vence en 49 días/);
    });
  });

  describe('existing lot', () => {
    it('accepts the same lot number with the same expiry (the receipt adds to it)', () => {
      const result = validateReceipt(
        receipt({ lotNumber: ' lt123456', expiryDate: '2027-06-30' }),
        receiptContext,
      );
      expect(result).toEqual({ errors: {}, warnings: {} });
    });

    it('rejects the same lot number with a different expiry', () => {
      const result = validateReceipt(
        receipt({ lotNumber: 'lt123456', expiryDate: '2027-07-01' }),
        receiptContext,
      );
      expect(result.errors.expiryDate).toBe('El lote LT123456 ya existe con vencimiento distinto.');
    });

    it('allows the same lot number on a different product', () => {
      const result = validateReceipt(
        receipt({ productId: 'p2', lotNumber: 'LT123456', expiryDate: '2027-07-01' }),
        receiptContext,
      );
      expect(isValid(result)).toBe(true);
    });
  });

  describe('quantity', () => {
    it.each([0, -5, 1.5, Number.NaN, null])('rejects %s', (quantity) => {
      expect(validateReceipt(receipt({ quantity }), receiptContext).errors.quantity).toBeTruthy();
    });

    it('accepts positive integers up to LIMITS.maxNumber and rejects past it', () => {
      expect(
        validateReceipt(receipt({ quantity: 1 }), receiptContext).errors.quantity,
      ).toBeUndefined();
      expect(
        validateReceipt(receipt({ quantity: LIMITS.maxNumber }), receiptContext).errors.quantity,
      ).toBeUndefined();
      expect(
        validateReceipt(receipt({ quantity: LIMITS.maxNumber + 1 }), receiptContext).errors
          .quantity,
      ).toBe('La cantidad no puede superar 1,000,000,000.');
    });
  });

  describe('optional fields', () => {
    it('concept: up to LIMITS.longText is fine, past it is rejected', () => {
      expect(
        validateReceipt(receipt({ concept: 'x'.repeat(LIMITS.longText) }), receiptContext).errors
          .concept,
      ).toBeUndefined();
      expect(
        validateReceipt(receipt({ concept: 'x'.repeat(LIMITS.longText + 1) }), receiptContext)
          .errors.concept,
      ).toBe(`El concepto no puede superar ${LIMITS.longText} caracteres.`);
    });

    it('price: empty or 0..LIMITS.maxNumber is fine, negative or past maxNumber is not', () => {
      expect(
        validateReceipt(receipt({ unitPrice: null }), receiptContext).errors.unitPrice,
      ).toBeUndefined();
      expect(
        validateReceipt(receipt({ unitPrice: 0 }), receiptContext).errors.unitPrice,
      ).toBeUndefined();
      expect(
        validateReceipt(receipt({ unitPrice: 2.35 }), receiptContext).errors.unitPrice,
      ).toBeUndefined();
      expect(
        validateReceipt(receipt({ unitPrice: LIMITS.maxNumber }), receiptContext).errors.unitPrice,
      ).toBeUndefined();
      expect(
        validateReceipt(receipt({ unitPrice: -1 }), receiptContext).errors.unitPrice,
      ).toBeTruthy();
      expect(
        validateReceipt(receipt({ unitPrice: LIMITS.maxNumber + 1 }), receiptContext).errors
          .unitPrice,
      ).toBe('El precio no puede superar 1,000,000,000.');
    });

    it('source: empty or an existing code in 0..999_999 is fine; unknown or out-of-range codes are rejected', () => {
      expect(
        validateReceipt(receipt({ sourceCode: null }), receiptContext).errors.sourceCode,
      ).toBeUndefined();
      expect(
        validateReceipt(receipt({ sourceCode: 1 }), receiptContext).errors
          .sourceCode,
      ).toBeUndefined();
      expect(
        validateReceipt(receipt({ sourceCode: 16 }), receiptContext).errors.sourceCode,
      ).toBeUndefined();
      expect(
        validateReceipt(receipt({ sourceCode: LIMITS.maxSourceCode }), receiptContext).errors
          .sourceCode,
      ).toBeUndefined();
      // Valid number in range, but absent from context.fundingSources:
      expect(validateReceipt(receipt({ sourceCode: 17 }), receiptContext).errors.sourceCode).toBe(
        'Elige una procedencia válida.',
      );
      // Out of range, even if a corrupt entry were in context.fundingSources:
      const withOutOfRange = {
        ...receiptContext,
        fundingSources: [
          ...receiptContext.fundingSources,
          { code: -1, name: 'Negativa' },
          { code: LIMITS.maxSourceCode + 1, name: 'Exceso' },
        ],
      };
      expect(validateReceipt(receipt({ sourceCode: -1 }), withOutOfRange).errors.sourceCode).toBe(
        'Elige una procedencia válida.',
      );
      expect(
        validateReceipt(receipt({ sourceCode: LIMITS.maxSourceCode + 1 }), withOutOfRange).errors
          .sourceCode,
      ).toBe('Elige una procedencia válida.');
      expect(validateReceipt(receipt({ sourceCode: 2.5 }), receiptContext).errors.sourceCode).toBe(
        'Elige una procedencia válida.',
      );
    });
  });

  it('rejects an invalid or future receipt date', () => {
    expect(validateReceipt(receipt({ date: '' }), receiptContext).errors.date).toBeTruthy();
    expect(validateReceipt(receipt({ date: '2026-11-14' }), receiptContext).errors.date).toBe(
      'La fecha no puede ser futura.',
    );
  });

  it('reports every problem at once', () => {
    const result = validateReceipt(
      receipt({ productId: '', lotNumber: '', expiryDate: '', quantity: 0 }),
      receiptContext,
    );
    expect(Object.keys(result.errors).sort()).toEqual([
      'expiryDate',
      'lotNumber',
      'productId',
      'quantity',
    ]);
  });
});

const issueContext: IssueContext = {
  today: TODAY,
  productExists: true,
  unit: 'prueba',
  usableBalance: 20,
  firstFefoLot: { id: 'soon', lotNumber: 'LT004512', expiryDate: '2026-11-22' },
};

function issue(overrides: Partial<IssueForm> = {}): IssueForm {
  return { productId: 'p1', date: TODAY, quantity: 10, ...overrides };
}

describe('validateIssue', () => {
  it('accepts a valid FEFO issue with no messages', () => {
    expect(validateIssue(issue(), issueContext)).toEqual({ errors: {}, warnings: {} });
  });

  it('requires a product that exists', () => {
    expect(validateIssue(issue({ productId: '' }), issueContext).errors.productId).toBeTruthy();
    expect(
      validateIssue(issue(), { ...issueContext, productExists: false }).errors.productId,
    ).toBeTruthy();
  });

  it.each([0, -1, 2.5, Number.NaN, null])('rejects quantity %s', (quantity) => {
    expect(validateIssue(issue({ quantity }), issueContext).errors.quantity).toBeTruthy();
  });

  it('allows exactly the usable balance and rejects one more', () => {
    expect(validateIssue(issue({ quantity: 20 }), issueContext).errors.quantity).toBeUndefined();
    expect(validateIssue(issue({ quantity: 21 }), issueContext).errors.quantity).toBe(
      'Solo hay 20 pruebas disponibles (no vencidas).',
    );
  });

  it('pluralizes the unit and agrees the adjective in the message', () => {
    const one = validateIssue(issue({ quantity: 2 }), { ...issueContext, usableBalance: 1 });
    expect(one.errors.quantity).toBe('Solo hay 1 prueba disponible (no vencida).');
    const units = validateIssue(issue({ quantity: 9 }), {
      ...issueContext,
      unit: 'unidad',
      usableBalance: 4,
    });
    expect(units.errors.quantity).toBe('Solo hay 4 unidades disponibles (no vencidas).');
  });

  it('rejects an issue date in the future or invalid', () => {
    expect(validateIssue(issue({ date: '2026-11-14' }), issueContext).errors.date).toBe(
      'La fecha no puede ser futura.',
    );
    expect(validateIssue(issue({ date: 'x' }), issueContext).errors.date).toBeTruthy();
    expect(validateIssue(issue({ date: '2026-11-01' }), issueContext).errors.date).toBeUndefined();
  });

  describe('manual lot choice', () => {
    const far = { id: 'far', lotNumber: 'LT118930', expiryDate: '2027-06-01', balance: 15 };

    it('the FEFO lot chosen by hand needs no reason and no warning', () => {
      const result = validateIssue(issue({ lotId: 'soon' }), {
        ...issueContext,
        selectedLot: { id: 'soon', lotNumber: 'LT004512', expiryDate: '2026-11-22', balance: 12 },
      });
      expect(result).toEqual({ errors: {}, warnings: {} });
    });

    it('another lot warns and requires a reason', () => {
      const result = validateIssue(issue({ lotId: 'far' }), { ...issueContext, selectedLot: far });
      expect(result.warnings.lotId).toBe('Hay un lote que vence antes (LT004512, 9 días).');
      expect(result.errors.fefoOverrideReason).toBe('Indica el motivo de usar otro lote.');
    });

    it('accepts the override once there is a reason (blank does not count)', () => {
      const withReason = validateIssue(
        issue({ lotId: 'far', fefoOverrideReason: 'Lote abierto en el equipo' }),
        { ...issueContext, selectedLot: far },
      );
      expect(isValid(withReason)).toBe(true);
      expect(withReason.warnings.lotId).toBeTruthy();

      const blank = validateIssue(issue({ lotId: 'far', fefoOverrideReason: '   ' }), {
        ...issueContext,
        selectedLot: far,
      });
      expect(blank.errors.fefoOverrideReason).toBeTruthy();
    });

    it('rejects an expired or empty lot', () => {
      const expired = validateIssue(issue({ lotId: 'far' }), {
        ...issueContext,
        selectedLot: { ...far, expiryDate: '2026-11-12' },
      });
      expect(expired.errors.lotId).toBe('El lote LT118930 está vencido.');

      const empty = validateIssue(issue({ lotId: 'far' }), {
        ...issueContext,
        selectedLot: { ...far, balance: 0 },
      });
      expect(empty.errors.lotId).toBe('El lote LT118930 no tiene saldo.');
    });

    it('limits the quantity to the chosen lot balance', () => {
      const result = validateIssue(issue({ lotId: 'far', quantity: 16 }), {
        ...issueContext,
        selectedLot: far,
      });
      expect(result.errors.quantity).toBe('Solo hay 15 pruebas en el lote LT118930.');
    });

    it('rejects a lot id that does not match the selected lot', () => {
      const result = validateIssue(issue({ lotId: 'ghost' }), {
        ...issueContext,
        selectedLot: far,
      });
      expect(result.errors.lotId).toBe('Elige un lote válido.');
    });

    it('expiring-today FEFO lot is described as "hoy"', () => {
      const result = validateIssue(issue({ lotId: 'far' }), {
        ...issueContext,
        firstFefoLot: { id: 'soon', lotNumber: 'LT004512', expiryDate: TODAY },
        selectedLot: far,
      });
      expect(result.warnings.lotId).toBe('Hay un lote que vence antes (LT004512, hoy).');
    });

    it('enforces LIMITS.longText on fefoOverrideReason', () => {
      expect(
        validateIssue(issue({ lotId: 'far', fefoOverrideReason: 'x'.repeat(LIMITS.longText) }), {
          ...issueContext,
          selectedLot: far,
        }).errors.fefoOverrideReason,
      ).toBeUndefined();
      expect(
        validateIssue(
          issue({ lotId: 'far', fefoOverrideReason: 'x'.repeat(LIMITS.longText + 1) }),
          { ...issueContext, selectedLot: far },
        ).errors.fefoOverrideReason,
      ).toBe(`El motivo no puede superar ${LIMITS.longText} caracteres.`);
    });
  });

  it('enforces LIMITS.maxNumber on quantity and LIMITS.longText on concept', () => {
    const hugeStock = { ...issueContext, usableBalance: LIMITS.maxNumber * 2 };
    expect(validateIssue(issue({ quantity: LIMITS.maxNumber }), hugeStock).errors.quantity).toBe(
      undefined,
    );
    expect(
      validateIssue(issue({ quantity: LIMITS.maxNumber + 1 }), hugeStock).errors.quantity,
    ).toBe('La cantidad no puede superar 1,000,000,000.');
    expect(
      validateIssue(issue({ concept: 'x'.repeat(LIMITS.longText) }), issueContext).errors.concept,
    ).toBeUndefined();
    expect(
      validateIssue(issue({ concept: 'x'.repeat(LIMITS.longText + 1) }), issueContext).errors
        .concept,
    ).toBe(`El concepto no puede superar ${LIMITS.longText} caracteres.`);
  });
});

describe('validateAdjustment, validateProduct, catalog and settings limits', () => {
  it('enforces LIMITS.maxNumber and MAX_ADJUSTMENT_REASON on adjustments', () => {
    expect(validateAdjustment(LIMITS.maxNumber, 'x'.repeat(MAX_ADJUSTMENT_REASON), 0)).toEqual({});
    expect(validateAdjustment(-LIMITS.maxNumber, 'Conteo', LIMITS.maxNumber)).toEqual({});
    expect(validateAdjustment(LIMITS.maxNumber + 1, 'Conteo', 0).quantity).toBe(
      'La cantidad no puede superar 1,000,000,000.',
    );
    expect(
      validateAdjustment(-(LIMITS.maxNumber + 1), 'Conteo', LIMITS.maxNumber * 2).quantity,
    ).toBe('La cantidad no puede superar 1,000,000,000.');
    expect(validateAdjustment(1, 'x'.repeat(MAX_ADJUSTMENT_REASON + 1), 0).reason).toBe(
      `El motivo no puede superar ${MAX_ADJUSTMENT_REASON} caracteres.`,
    );
  });

  it('enforces shortText, longText and maxNumber on every product field', () => {
    const ctx = { areas: [{ id: 'a1', name: 'Química' }], products: [] };
    expect(
      validateProduct(
        {
          id: 'i'.repeat(LIMITS.shortText),
          name: 'n'.repeat(LIMITS.longText),
          areaId: 'a1',
          unit: 'u'.repeat(LIMITS.shortText),
          code: 'c'.repeat(LIMITS.shortText),
          cardNumber: 'k'.repeat(LIMITS.shortText),
          packaging: 'p'.repeat(LIMITS.shortText),
          unitsPerPackage: LIMITS.maxNumber,
          minStock: LIMITS.maxNumber,
          maxStock: LIMITS.maxNumber,
          avgMonthlyConsumption: LIMITS.maxNumber,
        },
        ctx,
      ),
    ).toEqual({});

    const over = validateProduct(
      {
        id: 'i'.repeat(LIMITS.shortText + 1),
        name: 'n'.repeat(LIMITS.longText + 1),
        areaId: 'a1',
        unit: 'u'.repeat(LIMITS.shortText + 1),
        code: 'c'.repeat(LIMITS.shortText + 1),
        cardNumber: 'k'.repeat(LIMITS.shortText + 1),
        packaging: 'p'.repeat(LIMITS.shortText + 1),
        unitsPerPackage: LIMITS.maxNumber + 1,
        minStock: LIMITS.maxNumber + 1,
        maxStock: LIMITS.maxNumber + 1,
        avgMonthlyConsumption: LIMITS.maxNumber + 1,
      },
      ctx,
    );
    expect(Object.keys(over).sort()).toEqual([
      'avgMonthlyConsumption',
      'cardNumber',
      'code',
      'id',
      'maxStock',
      'minStock',
      'name',
      'packaging',
      'unit',
      'unitsPerPackage',
    ]);
  });

  it('enforces longText and sourceCode bounds on areas, funding sources and settings', () => {
    expect(validateAreaName([], 'a'.repeat(LIMITS.longText))).toBeUndefined();
    expect(validateAreaName([], 'a'.repeat(LIMITS.longText + 1))).toMatch(/1000 caracteres/);

    expect(validateFundingSourceName([], 's'.repeat(LIMITS.longText))).toBeUndefined();
    expect(validateFundingSourceName([], 's'.repeat(LIMITS.longText + 1))).toMatch(
      /1000 caracteres/,
    );

    expect(validateFundingSourceCode([], LIMITS.minSourceCode)).toBeUndefined();
    expect(validateFundingSourceCode([], LIMITS.maxSourceCode)).toBeUndefined();
    expect(validateFundingSourceCode([], LIMITS.minSourceCode - 1)).toMatch(/entre 0 y 999999/);
    expect(validateFundingSourceCode([], LIMITS.maxSourceCode + 1)).toMatch(/entre 0 y 999999/);

    expect(
      validateSettings({
        labName: 'l'.repeat(LIMITS.longText),
        criticalDays: LIMITS.maxSettingDays - 1,
        warningDays: LIMITS.maxSettingDays,
        defaultMinMonths: LIMITS.maxSettingMonths,
        defaultMaxMonths: LIMITS.maxSettingMonths,
      }),
    ).toEqual({});
    const badSettings = validateSettings({
      labName: 'l'.repeat(LIMITS.longText + 1),
      criticalDays: LIMITS.maxSettingDays + 1,
      warningDays: LIMITS.maxSettingDays + 1,
      defaultMinMonths: LIMITS.maxSettingMonths + 1,
      defaultMaxMonths: LIMITS.maxSettingMonths + 1,
    });
    expect(Object.keys(badSettings).sort()).toEqual([
      'criticalDays',
      'defaultMaxMonths',
      'defaultMinMonths',
      'labName',
      'warningDays',
    ]);
  });
});
