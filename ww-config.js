export default {
  editor: {
    label: { en: 'Admin Dev Pipeline' },
    icon: 'activity',
    categories: ['data'],
    deprecated: false,
  },
  properties: {
    supabaseUrl: {
      label: { en: 'Supabase URL' },
      type: 'Text',
      bindable: true,
      hidden: true,
      defaultValue: '',
    },
    supabaseAnonKey: {
      label: { en: 'Supabase Anon Key' },
      type: 'Text',
      bindable: true,
      hidden: true,
      defaultValue: '',
    },
    accessToken: {
      label: { en: 'Auth Token' },
      type: 'Text',
      bindable: true,
      hidden: true,
      defaultValue: '',
    },
    userId: {
      label: { en: 'User ID' },
      type: 'Text',
      bindable: true,
      hidden: true,
      defaultValue: '',
    },
    refreshInterval: {
      label: { en: 'Auto-refresh Interval (s)' },
      type: 'Number',
      bindable: true,
      defaultValue: 120,
      options: { min: 30, max: 600 },
    },
    refreshTrigger: {
      label: { en: 'Refresh Trigger' },
      type: 'Text',
      bindable: true,
      hidden: true,
      defaultValue: '',
    },
    portalTarget: {
      label: { en: 'Portal Target' },
      type: 'Text',
      bindable: true,
      hidden: true,
      defaultValue: '',
    },
    userRole: {
      label: { en: 'User Role' },
      type: 'Text',
      bindable: true,
      hidden: true,
      defaultValue: '',
    },
  },
  triggerEvents: [
    {
      name: 'devpipeline:forcedResync',
      label: { en: 'On Force Resync' },
      event: { datasetId: '', datasetName: '' },
    },
    {
      name: 'devpipeline:urlUpdated',
      label: { en: 'On Source URL Updated' },
      event: { datasetId: '', datasetName: '', newUrl: '' },
    },
    {
      name: 'devpipeline:error',
      label: { en: 'On Error' },
      event: { message: '' },
    },
  ],
};
