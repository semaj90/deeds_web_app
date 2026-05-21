#!/usr/bin/env node

function scalar(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return String(value)
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isFlatObject(value) {
  return value
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.values(value).every((v) => v === null || typeof v !== 'object');
}

function encodeTable(name, rows, indent) {
  if (!rows.length) return [`${indent}${name}: []`];
  const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))].sort();
  const lines = [`${indent}${name}[${keys.join(',')}]:`];
  for (const row of rows) {
    lines.push(`${indent}  ${keys.map((key) => scalar(row[key])).join('\t')}`);
  }
  return lines;
}

export function toToon(value, name = 'packet', depth = 0) {
  const indent = '  '.repeat(depth);
  if (Array.isArray(value)) {
    if (value.every(isFlatObject)) return encodeTable(name, value, indent).join('\n');
    const lines = [`${indent}${name}:`];
    value.forEach((item, index) => {
      if (item && typeof item === 'object') lines.push(toToon(item, `item_${index}`, depth + 1));
      else lines.push(`${indent}  - ${scalar(item)}`);
    });
    return lines.join('\n');
  }

  if (!value || typeof value !== 'object') {
    return `${indent}${name}: ${scalar(value)}`;
  }

  const lines = [`${indent}${name}:`];
  for (const key of Object.keys(value).sort()) {
    const child = value[key];
    if (Array.isArray(child) && child.every(isFlatObject)) {
      lines.push(toToon(child, key, depth + 1));
    } else if (child && typeof child === 'object') {
      lines.push(toToon(child, key, depth + 1));
    } else {
      lines.push(`${indent}  ${key}: ${scalar(child)}`);
    }
  }
  return lines.join('\n');
}
