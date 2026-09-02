import {
  FormulaError,
  RangeValue,
  ScalarValue,
  Value,
  compareValues,
  dateToSerial,
  finite,
  isFormulaError,
  isRange,
  parseNumericText,
  toBoolean,
  toNumber,
  toScalar,
  toText,
  typeRank,
} from './values';

export interface FormulaFunctionInfo {
  readonly name: string;
  readonly signature: string;
  readonly description: string;
}

export interface FormulaFunction extends FormulaFunctionInfo {
  readonly minArgs: number;
  readonly maxArgs: number;
  readonly call: (args: readonly Value[]) => Value;
}

const VARIADIC = Number.POSITIVE_INFINITY;

const registry = new Map<string, FormulaFunction>();

const define = (
  name: string,
  signature: string,
  description: string,
  minArgs: number,
  maxArgs: number,
  call: (args: readonly Value[]) => Value
): void => {
  registry.set(name, { name, signature, description, minArgs, maxArgs, call });
};

const numberArg = (value: Value): number | FormulaError => toNumber(toScalar(value));

const textArg = (value: Value): string | FormulaError => {
  const scalar = toScalar(value);
  return isFormulaError(scalar) ? scalar : toText(scalar);
};

const booleanArg = (value: Value): boolean | FormulaError => toBoolean(toScalar(value));

const asRange = (value: Value): RangeValue =>
  isRange(value) ? value : { kind: 'range', rows: 1, cols: 1, values: [value] };

const cellNumber = (value: ScalarValue): number | null =>
  typeof value === 'number' ? value : value instanceof Date ? dateToSerial(value) : null;

// Cells contribute only genuine numbers (text and booleans in a range are
// skipped, as spreadsheets do); literal arguments are coerced
const collectNumbers = (args: readonly Value[]): number[] | FormulaError => {
  const out: number[] = [];
  for (const arg of args) {
    if (isRange(arg)) {
      for (const value of arg.values) {
        if (isFormulaError(value)) return value;
        const n = cellNumber(value);
        if (n !== null) out.push(n);
      }
    } else if (arg !== null) {
      const n = toNumber(arg);
      if (isFormulaError(n)) return n;
      out.push(n);
    }
  }
  return out;
};

const collectBooleans = (args: readonly Value[]): boolean[] | FormulaError => {
  const out: boolean[] = [];
  for (const arg of args) {
    if (isRange(arg)) {
      for (const value of arg.values) {
        if (isFormulaError(value)) return value;
        if (typeof value === 'boolean') out.push(value);
        else if (typeof value === 'number') out.push(value !== 0);
      }
    } else if (arg !== null) {
      const b = toBoolean(arg);
      if (isFormulaError(b)) return b;
      out.push(b);
    }
  }
  return out;
};

const sumOf = (nums: readonly number[]): number => nums.reduce((acc, n) => acc + n, 0);

const withNumbers = (args: readonly Value[], compute: (nums: number[]) => Value): Value => {
  const nums = collectNumbers(args);
  return isFormulaError(nums) ? nums : compute(nums);
};

const withNumber = (value: Value, compute: (n: number) => Value): Value => {
  const n = numberArg(value);
  return isFormulaError(n) ? n : compute(n);
};

const withText = (value: Value, compute: (text: string) => Value): Value => {
  const text = textArg(value);
  return isFormulaError(text) ? text : compute(text);
};

// Decimal shifting through exponent notation keeps ROUND(1.005, 2) at 1.01
// where multiplying by a power of ten would drift to 1.00
const shiftDecimal = (n: number, digits: number): number => {
  const [mantissa, exponent] = n.toExponential().split('e');
  return Number(`${mantissa}e${Number(exponent) + digits}`);
};

const roundWith = (round: (n: number) => number) => (n: number, digits: number): number => {
  const places = Math.trunc(digits);
  const magnitude = shiftDecimal(round(shiftDecimal(Math.abs(n), places)), -places);
  return n < 0 ? -magnitude : magnitude;
};

const roundHalfAway = roundWith(Math.round);
const roundUp = roundWith(Math.ceil);
const roundDown = roundWith(Math.floor);

const defineRounding = (name: string, description: string, round: (n: number, digits: number) => number): void => {
  define(name, `${name}(number, [digits])`, description, 1, 2, (args) =>
    withNumber(args[0], (n) => {
      const digits = args.length > 1 ? numberArg(args[1]) : 0;
      return isFormulaError(digits) ? digits : finite(round(n, digits));
    })
  );
};

const defineSubstring = (name: string, slice: (text: string, count: number) => string): void => {
  const description = `The ${name.toLowerCase()}most characters of a text value (default 1).`;
  define(name, `${name}(text, [num_chars])`, description, 1, 2, (args) =>
    withText(args[0], (text) => {
      const count = args.length > 1 ? numberArg(args[1]) : 1;
      if (isFormulaError(count)) return count;
      if (count < 0) return '#VALUE!';
      return slice(text, Math.trunc(count));
    })
  );
};

type CriteriaOperator = '=' | '<>' | '<' | '>' | '<=' | '>=';

interface Criterion {
  readonly op: CriteriaOperator;
  readonly operand: ScalarValue;
}

const CRITERIA_OPERATORS: readonly CriteriaOperator[] = ['<>', '<=', '>=', '=', '<', '>'];

const interpretOperand = (text: string): ScalarValue => {
  const n = parseNumericText(text);
  if (n !== null) return n;
  const upper = text.toUpperCase();
  if (upper === 'TRUE') return true;
  if (upper === 'FALSE') return false;
  return text;
};

const parseCriterion = (raw: ScalarValue): Criterion => {
  if (typeof raw !== 'string') return { op: '=', operand: raw };
  const prefix = CRITERIA_OPERATORS.find((op) => raw.startsWith(op));
  return {
    op: prefix ?? '=',
    operand: interpretOperand(prefix ? raw.slice(prefix.length) : raw),
  };
};

// Blank cells only ever match a blank criterion; cells of another type than
// the criterion only match "<>", which is how COUNTIF(range, ">5") skips text
const matchesCriterion = (cell: ScalarValue, { op, operand }: Criterion): boolean => {
  const blankOperand = operand === null || operand === '';
  if (cell === null) {
    return op === '<>' ? !blankOperand : op === '=' && blankOperand;
  }
  if (operand === null || operand === '') return op === '<>';
  if (typeRank(cell) !== typeRank(operand)) return op === '<>';
  const order = compareValues(cell, operand);
  switch (op) {
    case '=':
      return order === 0;
    case '<>':
      return order !== 0;
    case '<':
      return order < 0;
    case '>':
      return order > 0;
    case '<=':
      return order <= 0;
    case '>=':
      return order >= 0;
  }
};

// Pairs each matching cell with the cell at the same offset in the target
// range; positions the target does not cover count as empty
const conditionalTotal = (args: readonly Value[]): { sum: number; count: number } | FormulaError => {
  const range = asRange(args[0]);
  const criterion = toScalar(args[1]);
  if (isFormulaError(criterion)) return criterion;
  const test = parseCriterion(criterion);
  const target = args.length > 2 ? asRange(args[2]) : range;
  let sum = 0;
  let count = 0;
  range.values.forEach((cell, i) => {
    if (!matchesCriterion(cell, test)) return;
    const r = Math.floor(i / range.cols);
    const c = i % range.cols;
    const paired = r < target.rows && c < target.cols ? target.values[r * target.cols + c] : null;
    const n = cellNumber(paired);
    if (n !== null) {
      sum += n;
      count++;
    }
  });
  return { sum, count };
};

const concatenate = (args: readonly Value[]): Value => {
  let out = '';
  for (const arg of args) {
    const items = isRange(arg) ? arg.values : [arg];
    for (const value of items) {
      if (isFormulaError(value)) return value;
      out += toText(value);
    }
  }
  return out;
};

define('SUM', 'SUM(value1, [value2, ...])', 'Adds all numbers in the arguments.', 1, VARIADIC, (args) =>
  withNumbers(args, (nums) => finite(sumOf(nums)))
);

define(
  'AVERAGE',
  'AVERAGE(value1, [value2, ...])',
  'Mean of the numbers in the arguments; #DIV/0! when there are none.',
  1,
  VARIADIC,
  (args) => withNumbers(args, (nums) => (nums.length === 0 ? '#DIV/0!' : finite(sumOf(nums) / nums.length)))
);

define(
  'COUNT',
  'COUNT(value1, [value2, ...])',
  'Number of numeric values in the arguments; text and errors are ignored.',
  1,
  VARIADIC,
  (args) => {
    let count = 0;
    for (const arg of args) {
      if (isRange(arg)) {
        for (const value of arg.values) {
          if (cellNumber(value) !== null) count++;
        }
      } else if (arg !== null && !isFormulaError(arg)) {
        if (typeof arg !== 'string' || parseNumericText(arg) !== null) count++;
      }
    }
    return count;
  }
);

define('COUNTA', 'COUNTA(value1, [value2, ...])', 'Number of non-empty values in the arguments.', 1, VARIADIC, (args) =>
  args.reduce<number>((count, arg) => count + (isRange(arg) ? arg.values : [arg]).filter((v) => v !== null).length, 0)
);

define('MIN', 'MIN(value1, [value2, ...])', 'Smallest number in the arguments; 0 when none.', 1, VARIADIC, (args) =>
  withNumbers(args, (nums) => (nums.length === 0 ? 0 : nums.reduce((a, b) => Math.min(a, b))))
);

define('MAX', 'MAX(value1, [value2, ...])', 'Largest number in the arguments; 0 when none.', 1, VARIADIC, (args) =>
  withNumbers(args, (nums) => (nums.length === 0 ? 0 : nums.reduce((a, b) => Math.max(a, b))))
);

define(
  'IF',
  'IF(condition, value_if_true, [value_if_false])',
  'Returns one value when the condition is true and another when it is false.',
  2,
  3,
  (args) => {
    const condition = booleanArg(args[0]);
    if (isFormulaError(condition)) return condition;
    if (condition) return args[1];
    return args.length > 2 ? args[2] : false;
  }
);

define('IFERROR', 'IFERROR(value, value_if_error)', 'The value, or the fallback when it is an error.', 2, 2, (args) => {
  const probe = isRange(args[0]) && args[0].values.length !== 1 ? null : toScalar(args[0]);
  return isFormulaError(probe) ? args[1] : args[0];
});

define('AND', 'AND(logical1, [logical2, ...])', 'TRUE when every argument is true.', 1, VARIADIC, (args) => {
  const values = collectBooleans(args);
  if (isFormulaError(values)) return values;
  return values.length === 0 ? '#VALUE!' : values.every(Boolean);
});

define('OR', 'OR(logical1, [logical2, ...])', 'TRUE when any argument is true.', 1, VARIADIC, (args) => {
  const values = collectBooleans(args);
  if (isFormulaError(values)) return values;
  return values.length === 0 ? '#VALUE!' : values.some(Boolean);
});

define('NOT', 'NOT(logical)', 'Reverses a logical value.', 1, 1, (args) => {
  const value = booleanArg(args[0]);
  return isFormulaError(value) ? value : !value;
});

const JOIN_DESCRIPTION = 'Joins the text form of the arguments, expanding ranges.';
define('CONCAT', 'CONCAT(text1, [text2, ...])', JOIN_DESCRIPTION, 1, VARIADIC, concatenate);
define('CONCATENATE', 'CONCATENATE(text1, [text2, ...])', JOIN_DESCRIPTION, 1, VARIADIC, concatenate);

define('LEN', 'LEN(text)', 'Number of characters in a text value.', 1, 1, (args) =>
  withText(args[0], (text) => text.length)
);

define('UPPER', 'UPPER(text)', 'Converts text to upper case.', 1, 1, (args) =>
  withText(args[0], (text) => text.toUpperCase())
);

define('LOWER', 'LOWER(text)', 'Converts text to lower case.', 1, 1, (args) =>
  withText(args[0], (text) => text.toLowerCase())
);

define('TRIM', 'TRIM(text)', 'Removes leading, trailing and repeated spaces.', 1, 1, (args) =>
  withText(args[0], (text) => text.replace(/ +/g, ' ').trim())
);

defineSubstring('LEFT', (text, count) => text.slice(0, count));
defineSubstring('RIGHT', (text, count) => (count === 0 ? '' : text.slice(-count)));

define('MID', 'MID(text, start, num_chars)', 'Characters from a 1-based start position.', 3, 3, (args) =>
  withText(args[0], (text) => {
    const start = numberArg(args[1]);
    if (isFormulaError(start)) return start;
    const count = numberArg(args[2]);
    if (isFormulaError(count)) return count;
    if (start < 1 || count < 0) return '#VALUE!';
    const from = Math.trunc(start) - 1;
    return text.slice(from, from + Math.trunc(count));
  })
);

defineRounding('ROUND', 'Rounds to a number of digits, halves away from zero.', roundHalfAway);
defineRounding('ROUNDUP', 'Rounds away from zero to a number of digits.', roundUp);
defineRounding('ROUNDDOWN', 'Rounds toward zero to a number of digits.', roundDown);

define('INT', 'INT(number)', 'Rounds down to the nearest integer.', 1, 1, (args) =>
  withNumber(args[0], (n) => Math.floor(n))
);

define('ABS', 'ABS(number)', 'Absolute value.', 1, 1, (args) => withNumber(args[0], (n) => Math.abs(n)));

define('MOD', 'MOD(number, divisor)', 'Remainder after division, with the sign of the divisor.', 2, 2, (args) =>
  withNumber(args[0], (n) =>
    withNumber(args[1], (divisor) => (divisor === 0 ? '#DIV/0!' : finite(n - divisor * Math.floor(n / divisor))))
  )
);

define('POWER', 'POWER(base, exponent)', 'Raises a number to a power.', 2, 2, (args) =>
  withNumber(args[0], (base) => withNumber(args[1], (exponent) => finite(Math.pow(base, exponent))))
);

define('SQRT', 'SQRT(number)', 'Positive square root; #NUM! for negative input.', 1, 1, (args) =>
  withNumber(args[0], (n) => (n < 0 ? '#NUM!' : Math.sqrt(n)))
);

define('PI', 'PI()', 'The constant pi.', 0, 0, () => Math.PI);

define(
  'SUMIF',
  'SUMIF(range, criteria, [sum_range])',
  'Adds the cells meeting a criterion such as ">5", "<>x" or a plain value.',
  2,
  3,
  (args) => {
    const total = conditionalTotal(args);
    return isFormulaError(total) ? total : finite(total.sum);
  }
);

define(
  'COUNTIF',
  'COUNTIF(range, criteria)',
  'Counts the cells meeting a criterion such as ">5", "<>x" or a plain value.',
  2,
  2,
  (args) => {
    const criterion = toScalar(args[1]);
    if (isFormulaError(criterion)) return criterion;
    const test = parseCriterion(criterion);
    return asRange(args[0]).values.filter((cell) => matchesCriterion(cell, test)).length;
  }
);

define(
  'AVERAGEIF',
  'AVERAGEIF(range, criteria, [average_range])',
  'Mean of the cells meeting a criterion; #DIV/0! when none do.',
  2,
  3,
  (args) => {
    const total = conditionalTotal(args);
    if (isFormulaError(total)) return total;
    return total.count === 0 ? '#DIV/0!' : finite(total.sum / total.count);
  }
);

define('ISBLANK', 'ISBLANK(value)', 'TRUE when the value is an empty cell.', 1, 1, (args) =>
  toScalar(args[0]) === null
);

define('ISNUMBER', 'ISNUMBER(value)', 'TRUE when the value is a number or a date.', 1, 1, (args) => {
  const value = toScalar(args[0]);
  return typeof value === 'number' || value instanceof Date;
});

define('ISTEXT', 'ISTEXT(value)', 'TRUE when the value is text.', 1, 1, (args) => {
  const value = toScalar(args[0]);
  return typeof value === 'string' && !isFormulaError(value);
});

define('TODAY', 'TODAY()', "Today's date at local midnight.", 0, 0, () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
});

define('NOW', 'NOW()', 'The current date and time.', 0, 0, () => new Date());

export function getFunction(name: string): FormulaFunction | undefined {
  return registry.get(name.toUpperCase());
}

export const FORMULA_FUNCTIONS: readonly FormulaFunctionInfo[] = Array.from(
  registry.values(),
  ({ name, signature, description }) => ({ name, signature, description })
);
