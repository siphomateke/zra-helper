/** @typedef {import('../constants').Client} Client */

/**
 * @typedef {Object} ClientActionFunctionParam
 * @property {Client} client
 * @property {import('@/transitional/tasks').TaskObject} parentTask
 * @property {Object} clientActionConfig this client action's config
 */

/**
 * @callback ClientActionFunction
 * @param {ClientActionFunctionParam} param
 * @returns {Promise.<Object>}
 */

/**
 * @typedef {'csv'|'json'} ClientActionOutputFormat
 */

/**
 * @callback ClientActionOutputFormatter
 * @param {import('@/store/modules/client_actions/index').ClientActionOutput[]} outputs
 * @param {ClientActionOutputFormat} format
 * @returns {any}
 */

/**
 * @typedef ClientActionObject
 * @property {string} id A unique camelCase ID to identify this client action.
 * @property {string} name The human-readable name of this client action.
 * @property {ClientActionFunction} [func]
 * @property {boolean} hasOutput Whether this client action returns an output.
 * @property {boolean} usesProfilePage Whether this action needs to open a page on the user's profile.
 * If this is enabled, the page that is opened after logging in will not be closed until the user is
 * about to be logged out.
 * @property {ClientActionOutputFormat} defaultOutputFormat
 * @property {ClientActionOutputFormatter} outputFormatter
 * Function that formats the output into different formats such as CSV and JSON.
 */
