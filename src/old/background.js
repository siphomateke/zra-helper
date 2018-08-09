browser.browserAction.onClicked.addListener(() => {
	console.log('Opening dashboard');
	browser.tabs.create({url: 'dashboard.html'});
});