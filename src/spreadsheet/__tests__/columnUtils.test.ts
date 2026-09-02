import { columnToLetter, letterToColumn } from '../utils/columnUtils';

describe('columnUtils', () => {
  const pairs: Array<[number, string]> = [
    [0, 'A'],
    [25, 'Z'],
    [26, 'AA'],
    [51, 'AZ'],
    [52, 'BA'],
    [701, 'ZZ'],
    [702, 'AAA'],
    [16383, 'XFD'],
    [18277, 'ZZZ'],
  ];

  it.each(pairs)('maps index %i to %s and back', (index, letters) => {
    expect(columnToLetter(index)).toBe(letters);
    expect(letterToColumn(letters)).toBe(index);
  });

  it('round-trips every column up to three letters', () => {
    for (let i = 0; i < 18278; i++) {
      expect(letterToColumn(columnToLetter(i))).toBe(i);
    }
  });

  it('produces distinct, length-ordered letters', () => {
    expect(columnToLetter(25).length).toBe(1);
    expect(columnToLetter(26).length).toBe(2);
    expect(columnToLetter(701).length).toBe(2);
    expect(columnToLetter(702).length).toBe(3);
  });
});
