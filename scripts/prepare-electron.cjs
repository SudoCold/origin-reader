const path = require('node:path');
process.env.electron_config_cache ||= path.resolve(__dirname, '../.cache/electron');
require('electron/install.js');
