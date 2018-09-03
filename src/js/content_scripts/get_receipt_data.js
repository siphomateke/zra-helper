import { errorToJson } from '../errors';
import { getElement, getElementFromDocument } from './helpers/elements';
import { parseTable } from './helpers/zra';

browser.runtime.onMessage.addListener(message => new Promise((resolve) => {
  if (message.command === 'getReceiptData') {
    try {
      let column = '';
      if (message.type === 'payment') {
        column = '4';
      } else if (message.type === 'return') {
        column = '3';
      }
      const mainTable = getElement('form>table>tbody>tr:nth-child(2)>td:nth-child(2)>table:nth-child(1)>tbody', 'main table');
      const infoTable = getElementFromDocument(mainTable, `tr:nth-child(5)>td:nth-child(${column})>table>tbody`, 'info table');
      const registrationDate = getElementFromDocument(infoTable, 'tr:nth-child(2)>td:nth-child(3)', 'registration date').innerText;
      const referenceNumber = getElementFromDocument(infoTable, 'tr:nth-child(3)>td:nth-child(3)', 'reference number').innerText;

      const data = {
        registrationDate,
        referenceNumber,
      };
      if (message.type === 'payment') {
        const rows = {
          prn: 4,
          paymentDate: 5,
          searchCode: 6,
          paymentType: 7,
        };
        for (const name of Object.keys(rows)) {
          data[name] = getElementFromDocument(infoTable, `tr:nth-child(${rows[name]})>td:nth-child(3)`, name).innerText;
        }

        const paymentTable = getElement('#pmt_dtl', 'payment table');
        const payments = parseTable({
          root: paymentTable,
          headers: [
            'taxType',
            'accountName',
            'liabilityType',
            'periodFrom',
            'periodTo',
            'chargeYear',
            'chargeQuater',
            'alternativeNumber',
            'amount',
          ],
          recordSelector: 'tbody>tr',
        });
        data.payments = payments;
      } else if (message.type === 'return') {
        const periodInfo = getElement('#ReturnHistoryForm>table>tbody>tr:nth-child(2)>td:nth-child(2)>table>tbody>tr:nth-child(11)>td:nth-child(4)').innerText;
        const periodDateMatches = periodInfo.match(/Period\s+:\s+(.+)\s+to\s+(.+)/);
        data.periodFrom = periodDateMatches[1];
        data.periodTo = periodDateMatches[2];
      }

      resolve(data);
    } catch (error) {
      resolve({ error: errorToJson(error) });
    }
  }
}));
