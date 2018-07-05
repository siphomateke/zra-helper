browser.runtime.onMessage.addListener((message) => {
	return new Promise((resolve, reject) => {
		if (message.command === "getTotals") {
			if (document.querySelector("#rprtDataTable>tbody>tr.rprtDataTableGrandTotalRow") != null) {
				const totals = [];
				for (let i = 5; i < 9; i++) {
					let cellValue = document.querySelector(`#rprtDataTable>tbody>tr.rprtDataTableGrandTotalRow>td:nth-child(${i})`).innerText;
					cellValue = cellValue.replace(/\n\n/g, '');
					totals.push(parseFloat(cellValue));
				}
				resolve({
					dataType: 'totals',
					totals: totals,
				});
			} else if (document.querySelector("#rsltTableHtml>table>tbody>tr:nth-child(2)>td>center.Label3") != null) {
				resolve({
					dataType: 'totals',
					totals: [0, 0, 0, 0],
				});
			} else {
				resolve({
					dataType: 'totals',
					totals: [],
				});
			}
		}
	});
});