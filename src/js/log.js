import $ from 'jquery';
import moment from 'moment';
import config from './config';
import { ExtendedError } from './errors';

export class Log {
  constructor() {
    this.logLines = [];
    this.logWrapperEl = $('#log-wrapper');
    this.logElementWrapper = $('.log');
    this.logElement = this.logElementWrapper.find('.log-inner');

    this.errors = [];
  }

  setCategory(category) {
    this.category = category;
  }

  log(value, type) {
    this.logLines.push(value);
    if (this.logLines.length > 0) {
      this.logWrapperEl.removeClass('hidden');
    }

    const timestamp = moment().format('DD/MM/YY HH:mm:ss.SS');

    const text = `${this.category}: ${value}`;
    const classes = ['line'];
    let icon = '';
    switch (type) {
      case 'error':
        classes.push('error');
        icon = 'exclamation-circle';
        console.error(text);
        break;
      case 'warning':
        classes.push('warning');
        icon = 'exclamation-triangle';
        console.warn(text);
        break;
      case 'info':
        classes.push('info');
        icon = 'info-circle';
        console.info(text);
        break;
      default:
        console.log(text);
        break;
    }
    let output = `<span class="cell timestamp">${timestamp}</span>`;
    output += '<span class="cell icon">';
    if (icon) {
      output += `<i class="fas fa-${icon}" aria-hidden="true"></i>`;
    }
    output += '</span>';
    output += `<span class="cell category"><span class="tag">${this.category}</span></span>`;
    output += `<span class="cell content">${value}</span>`;
    output = `<span class="${classes.join(' ')}">${output}</span>`;

    // Output log and keep scroll at bottom if already scrolled to bottom
    const scrollEl = this.logElementWrapper;
    const isScrolledToBottom = scrollEl[0].scrollHeight - scrollEl[0].clientHeight <= scrollEl[0].scrollTop + 1;
    this.logElement.append(output);
    if (isScrolledToBottom) {
      scrollEl.scrollTop(scrollEl[0].scrollHeight);
    }
  }

  clearLog() {
    this.logElement.text('');
  }

  showError(error, warning = false) {
    this.errors.push(error);
    let errorString = '';
    if (!(error instanceof Error) && error.message) {
      errorString = error.message;
    } else if (error instanceof ExtendedError) {
      errorString = `${error.type}: ${error.message}`;
    } else if (typeof error !== 'string') {
      errorString = error.toString();
    } else {
      errorString = `Error: ${error}`;
    }
    this.log(errorString, warning ? 'warning' : 'error');
    if (config.debug && error instanceof Error) {
      if (error instanceof ExtendedError) {
        console.groupCollapsed(`${error.type} Details`);
        console.log(error.stack);
        console.log({
          code: error.code,
          message: error.message,
          type: error.type,
          props: error.props,
        });
        console.groupEnd();
      } else {
        console.error(error);
      }
    }
  }
}

export const log = new Log();
