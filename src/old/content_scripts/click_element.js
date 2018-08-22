import browser from 'webextension-polyfill';
import { errorToJson } from '../errors';
import { getElement } from './helpers/elements';

browser.runtime.onMessage.addListener((message) => {
    return new Promise((resolve, reject) => {
        if (message.command === 'click') {
            if (message.selector) {
                try { 
                    // This must be before resolve so we can send back any caught errors.
                    const element = getElement(message.selector, message.name);
                    resolve({});
                    element.click();
                } catch (error) {
                    resolve({error: errorToJson(error)});
                }
            } else {
                reject(new Error('A selector for an element to be clicked must be provided.'));
            }
        }
    });
});