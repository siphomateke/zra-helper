browser.browserAction.onClicked.addListener(() => {
	console.log('Opening dashboard');
	browser.tabs.create({url: 'src/dashboard/dashboard.html'});
});