export function parseCsv(text) {
  const rows = [];
  let row = [], value = '', quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { value += '"'; i += 1; }
      else quoted = !quoted;
    } else if (!quoted && (char === ',' || char === '\n' || char === '\r')) {
      row.push(value); value = '';
      if (char !== ',') {
        rows.push(row); row = [];
        if (char === '\r' && text[i + 1] === '\n') i += 1;
      }
    } else value += char;
  }
  if (quoted) throw new Error('Unterminated CSV value.');
  if (value || row.length) { row.push(value); rows.push(row); }
  return rows;
}

export function extractCategories(rows) {
  const tree = Object.create(null);
  (rows[0] ?? []).forEach((header, column) => {
    const department = String(header).trim();
    if (!department || department.toUpperCase() === 'DPH') return;
    const categories = [...new Set(rows.slice(1).map((row) => String(row[column] ?? '').trim()).filter(Boolean))];
    if (!categories.length) return;
    if (Object.hasOwn(tree, department)) throw new Error(`Duplicate department: ${department}`);
    tree[department] = categories.map((value) => ({ value, label: value }));
  });
  return validateCategoryTree(tree);
}

export function validateCategoryTree(tree) {
  if (!tree || typeof tree !== 'object' || Array.isArray(tree) || !Object.keys(tree).length) {
    throw new Error('No departments found in rozpocty; existing categories were not changed.');
  }
  for (const [department, categories] of Object.entries(tree)) {
    if (!department.trim() || !Array.isArray(categories) || !categories.length || categories.some(
      (category) => typeof category.value !== 'string' || !category.value.trim() ||
        typeof category.label !== 'string' || !category.label.trim() || 'subcategories' in category,
    )) throw new Error(`Invalid categories for ${department}; update the Apps Script deployment.`);
  }
  return tree;
}
