const taxTypesRequiredStr = 'At least one tax type must be selected';

export default {
  en: {
    attributes: {
      // login tab
      login_details: 'login details',
      client_name: 'client name',
      client_username: 'username',
      client_password: 'password',

      // client action inputs
      tax_types: 'tax types',
      pending_liability_totals_tax_types: 'tax types',
      pending_liability_page_downloads_tax_types: 'tax types',
      from_date: 'from date',
      to_date: 'to date',

      // tasks viewer
      tasks_json: 'tasks JSON',
    },
    custom: {
      tax_types: {
        required: taxTypesRequiredStr,
      },
      pending_liability_totals_tax_types: {
        required: taxTypesRequiredStr,
      },
      pending_liability_page_downloads_tax_types: {
        required: taxTypesRequiredStr,
      },
    },
  },
};
