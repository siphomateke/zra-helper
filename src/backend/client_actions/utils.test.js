import { getQuarterFromPeriodDates } from './utils';

test('getQuarterFromPeriodDates works', () => {
  const tests = [
    [['01/01/2015', '31/03/2015'], 1],
    [['01/04/2015', '30/06/2015'], 2],
    [['01/07/2015', '30/09/2015'], 3],
    [['01/10/2015', '31/12/2015'], 4],
    // TODO: Add more examples
  ];
  for (const [period, expectedQuarter] of tests) {
    const quarter = getQuarterFromPeriodDates(period[0], period[1]);
    expect(quarter).toBe(expectedQuarter);
  }
});

// TODO: Test other utils
