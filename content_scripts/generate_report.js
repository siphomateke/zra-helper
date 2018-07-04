console.log('generate report');

browser.runtime.onMessage.addListener(async (message) => {
    console.log('message');
    if (message.command === 'generateReport') {
        const optionValue = '0'+message.taxTypeId;
        const optionExists = document.querySelector(`#prm_TaxType > option[value="${optionValue}"]`) != null;
        let error = false;
        if (optionExists) {
            document.querySelector("#prm_TaxType").value = optionValue;
        } else {
            error = true;
        }
        await browser.runtime.sendMessage({
            from: 'generate_report',
            error,
        });
        if (optionExists) {
            document.querySelector("body>table>tbody>tr:nth-child(2)>td>table>tbody>tr>td>form>table>tbody>tr>td>table>tbody>tr:nth-child(2)>td>input:nth-child(1)").click();
        }
    }
});