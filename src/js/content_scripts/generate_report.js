import {ZraError, TaxTypeNotFoundError, errorToJson} from '../errors.js';

/**
 * Gets error message from page if it exists
 * 
 * @return {Error|null}
 */
function getZraError() {
    const errorTable = document.querySelector('#maincontainer>tbody>tr:nth-child(4)>td:nth-child(3)>form>div>table>tbody>tr>td>table');
    if (errorTable !== null) {
        const errorTableHeader = errorTable.querySelector('tbody>tr.tdborder>td');
        if (errorTableHeader !== null && errorTableHeader.innerText.includes('An Error has occurred')) {
            const error = errorTable.querySelector('tbody>tr:nth-child(2)>td');
            if (error !== null) {
                return new ZraError(`${errorTableHeader.innerText.trim()}. ${error.innerText}`);
            }
        }
    }
    return null;
}

browser.runtime.onMessage.addListener((message) => {
    return new Promise((resolve, reject) => {
        if (message.command === 'generateReport') {
            const optionValue = message.taxTypeId;
            const optionExists = document.querySelector(`#prm_TaxType>option[value="${optionValue}"]`) != null;
            let error = null;
            if (optionExists) {
                document.querySelector("#prm_TaxType").value = optionValue;
            } else {
                let zraError = getZraError();
                if (zraError) {
                    error = zraError;
                } else {
                    error = new TaxTypeNotFoundError(`Tax type with id "${optionValue}" not found`);
                }
            }
            resolve({
                taxTypeId: message.taxTypeId,
                error: errorToJson(error),
            });
            if (optionExists) {
                document.querySelector("body>table>tbody>tr:nth-child(2)>td>table>tbody>tr>td>form>table>tbody>tr>td>table>tbody>tr:nth-child(2)>td>input:nth-child(1)").click();
            }
        }
    });
});