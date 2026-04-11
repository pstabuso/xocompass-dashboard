export function pearsonR(xs, ys) {
  const n = xs.length;

  if (n < 2 || n !== ys.length) return 0;

  const meanX = xs.reduce((sum, value) => sum + value, 0) / n;
  const meanY = ys.reduce((sum, value) => sum + value, 0) / n;

  let numerator = 0;
  let dx = 0;
  let dy = 0;

  for (let i = 0; i < n; i++) {
    const ex = xs[i] - meanX;
    const ey = ys[i] - meanY;
    numerator += ex * ey;
    dx += ex * ex;
    dy += ey * ey;
  }

  const denominator = Math.sqrt(dx * dy);
  return denominator === 0 ? 0 : +(numerator / denominator).toFixed(3);
}
