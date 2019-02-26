browser.browserAction.onClicked.addListener(() => {
  browser.tabs.create({ url: 'app.html' });
});
