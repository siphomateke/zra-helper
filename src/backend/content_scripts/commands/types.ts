import { Client } from '@/backend/constants';
import { ConfigState } from '@/store/modules/config';
import { IgnoreZraError } from '@/backend/utils';
import { ReceiptType } from '@/backend/client_actions/receipts';
import { GetDataFromReceiptResponses } from '../helpers/receipt_data';
import { LoadedImagesResponse } from '../helpers/images';

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
  type: ReceiptType;
}

export interface InjectHtmlMessage extends ContentScriptListenerMessage {
  command: 'inject_html';
  html: string;
}

export interface InjectFormMessage extends ContentScriptListenerMessage {
  command: 'inject_form';
  html: string;
}

export interface FindUnloadedImages extends ContentScriptListenerMessage {
  command: 'find_unloaded_images';
}

export interface ContentScriptMessages {
  check_login: CheckLoginMessage;
  click_element: ClickElementMessage;
  get_receipt_data: GetReceiptDataMessage;
  inject_html: InjectHtmlMessage;
  inject_form: InjectFormMessage;
  receive_config: ConfigMessage;
  find_unloaded_images: FindUnloadedImages;
}

export type ContentScriptCommand = keyof ContentScriptMessages;

export type ContentScriptMessageFromCommand<
  Command extends ContentScriptCommand
  > = ContentScriptMessages[Command];

export type FindUnloadedImagesResponse = LoadedImagesResponse;

export interface ContentScriptResponses<
  Command extends ContentScriptCommand,
  Message extends ContentScriptMessageFromCommand<Command>
  > {
  check_login: void;
  click_element: void;
  // FIXME: Choose response from `GetDataFromReceiptResponses` based on `Message.type`
  get_receipt_data: GetDataFromReceiptResponses[ReceiptType];
  inject_html: void;
  inject_form: void;
  receive_config: void;
  find_unloaded_images: FindUnloadedImagesResponse;
}

export type ContentScriptResponseFromCommand<
  Command extends ContentScriptCommand,
  M extends ContentScriptMessageFromCommand<Command>
  > = ContentScriptResponses<Command, M>[Command];
