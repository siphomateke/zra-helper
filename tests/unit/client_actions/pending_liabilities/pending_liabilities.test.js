import path from 'path';
import { csvOutputParser } from '@/backend/client_actions/pending_liabilities';
import { taxTypes } from '@/backend/constants';
import loadFileFromRootPath from '$tests/utils';

function loadFile(filePath) {
  return loadFileFromRootPath(path.join('./unit/client_actions/pending_liabilities', filePath));
}

function generateEmptyGrandTotal() {
  return {
    principal: '',
    interest: '',
    penalty: '',
    total: '',
  };
}

function generateZeroGrandTotal() {
  return {
    principal: '0.00',
    interest: '0.00',
    penalty: '0.00',
    total: '0.00',
  };
}

function generateGrandTotals() {
  const grandTotals = {};
  for (const taxTypeCode of Object.values(taxTypes)) {
    grandTotals[taxTypeCode] = generateEmptyGrandTotal();
  }
  return grandTotals;
}

test('csvOutputParser parses totals correctly', async () => {
  const file = await loadFile('./pending_liabilities_output.csv');
  const liabilities = csvOutputParser(file);
  expect(liabilities).toEqual([
    {
      client: 'John',
      totals: {
        ...generateGrandTotals(),
        ITX: {
          ...generateZeroGrandTotal(),
          penalty: '500.00',
          total: '500.00',
        },
        VAT: generateZeroGrandTotal(),
        PAYE: {
          ...generateZeroGrandTotal(),
          principal: '14.75',
          total: '14.75',
        },
      },
    },
    {
      client: 'Smith',
      totals: {
        ...generateGrandTotals(),
        ITX: {
          ...generateZeroGrandTotal(),
          penalty: '6,400.00',
          total: '6,400.00',
        },
      },
    },
    {
      client: 'David',
      totals: {
        ...generateGrandTotals(),
        ITX: generateZeroGrandTotal(),
        WHT: generateZeroGrandTotal(),
      },
    },
    {
      client: 'Doe',
      totals: {
        ...generateGrandTotals(),
        ITX: generateZeroGrandTotal(),
      },
    },
  ]);
});
