export const serializeTabular = (cells: string[][]) =>
  cells.map((r) => r.join('\t')).join('\n');

export const parseTabular = (text: string) =>
  text
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.split('\t'));