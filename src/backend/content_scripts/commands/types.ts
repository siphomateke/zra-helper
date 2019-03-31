import { Client } from '@/backend/constants';
import { ConfigState } from '@/store/modules/config';
import { IgnoreZraError } from '@/backend/utils';

export interface ContentScriptListenerMessage {
  command: ContentScriptCommand;
}

export interface CheckLoginMessage extends ContentScriptListenerMessage {
  command: 'check_login';
  client: Client;
}

export interface ConfigMessage extends ContentScriptListenerMessage {
  command: 'receive_config';
  config: ConfigState;
}

export interface ClickElementMessage extends ContentScriptListenerMessage {
  command: 'click_element';
  /** Whether errors from the ZRA website should be ignored. */
  ignoreZraErrors: IgnoreZraError;
  /** The selector of the element. */
  selector: string;
  /**
   * A descriptive name of the element used when generating errors.
   * For example, "generate report button".
   */
  name: string;
}

export interface GetReceiptDataMessage extends ContentScriptListenerMessage {
  command: 'get_receipt_data';
  /** The type of receipt data to get. */
  // FIXME: Add typescript type for receipt data types.
  type: 'payment' | 'return';
}

export interface InjectFormMessage extends ContentScriptListenerMessage {
  command: 'inject_form';
  html: string;
}

export interface ContentScriptMessages {
  check_login: CheckLoginMessage;
  click_element: ClickElementMessage;
  get_receipt_data: GetReceiptDataMessage;
  inject_form: InjectFormMessage;
  receive_config: ConfigMessage;
}

export type ContentScriptCommand = keyof ContentScriptMessages;

export type ContentScriptMessageFromCommand<
  Command extends ContentScriptCommand
> = ContentScriptMessages[Command];
