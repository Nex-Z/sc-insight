export function validateRule(body) {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const condition = typeof body.condition === 'string' ? body.condition.trim() : '';
  if (!name || name.length > 80 || !condition || condition.length > 200) return null;
  return {name,condition};
}
