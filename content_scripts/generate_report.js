console.log('generate report loaded');

browser.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
    if (message.command === 'generateReport') {
        // FIXME: Handle numbers being greater than 9
        const optionValue = '0'+message.taxTypeId;
        const optionExists = document.querySelector(`#prm_TaxType > option[value="${optionValue}"]`) != null;
        let error = '';
        if (optionExists) {
            document.querySelector("#prm_TaxType").value = optionValue;
        } else {
            error = 'Tax type not found';
        }
        // Note: if this ever has to be asynchronous, the listener must return true
        sendResponse({
            taxTypeId: message.taxTypeId,
            error,
        });
        if (optionExists) {
            document.querySelector("body>table>tbody>tr:nth-child(2)>td>table>tbody>tr>td>form>table>tbody>tr>td>table>tbody>tr:nth-child(2)>td>input:nth-child(1)").click();
        }
    }
});