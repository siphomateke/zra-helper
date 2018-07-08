console.log('generate report loaded');

function getError() {
    // Check if there is an error message on the page
    const errorTable = document.querySelector('#maincontainer>tbody>tr:nth-child(4)>td:nth-child(3)>form>div>table>tbody>tr>td>table');
    if (errorTable !== null) {
        const errorTableHeader = errorTable.querySelector('tbody>tr.tdborder>td');
        if (errorTableHeader !== null && errorTableHeader.innerText.includes('An Error has occurred')) {
            const error = errorTable.querySelector('tbody>tr:nth-child(2)>td');
            if (error !== null) {
                return 'From ZRA: "'+errorTableHeader.innerText.trim()+'. '+error.innerText+'"';
            }
        }
    }
    return 'tax_type_not_found';
}

browser.runtime.onMessage.addListener((message) => {
    return new Promise((resolve, reject) => {
        if (message.command === 'generateReport') {
            const optionValue = message.taxTypeId;
            const optionExists = document.querySelector(`#prm_TaxType>option[value="${optionValue}"]`) != null;
            let error = '';
            if (optionExists) {
                document.querySelector("#prm_TaxType").value = optionValue;
            } else {
                error = getError();
            }
            resolve({
                taxTypeId: message.taxTypeId,
                error,
            });
            if (optionExists) {
                document.querySelector("body>table>tbody>tr:nth-child(2)>td>table>tbody>tr>td>form>table>tbody>tr>td>table>tbody>tr:nth-child(2)>td>input:nth-child(1)").click();
            }
        }
    });
});