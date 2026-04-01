export function buildAblationForecast(isAblation) {
  const base = [
    { date: '04/01', actual: 18, tp: 19, np: 24 },
    { date: '04/02', actual: 22, tp: 21, np: 28 },
    { date: '04/03', actual: 15, tp: 16, np: 21 },
    { date: '04/04', actual: 31, tp: 29, np: 38 },
    { date: '04/05', actual: 27, tp: 26, np: 33 },
    { date: '04/06', actual: 19, tp: 20, np: 26 },
    { date: '04/07', actual: 42, tp: 40, np: 51 },
    { date: '04/08', actual: 35, tp: 34, np: 44 },
    { date: '04/09', actual: 24, tp: 25, np: 31 },
    { date: '04/10', actual: 28, tp: 27, np: 35 },
    { date: '04/11', actual: 33, tp: 31, np: 41 },
    { date: '04/12', actual: 17, tp: 18, np: 23 },
    { date: '04/13', actual: 39, tp: 37, np: 48 },
    { date: '04/14', actual: 45, tp: 43, np: 56 },
  ];

  return base.map((entry) => {
    const prediction = isAblation ? entry.tp : entry.np;

    return {
      date: entry.date,
      actual: entry.actual,
      prediction,
      residual: +(prediction - entry.actual).toFixed(2),
    };
  });
}
