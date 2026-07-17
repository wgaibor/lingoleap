// Metro no sigue los symlinks de pnpm por defecto: se le enseña la raíz del monorepo,
// equivalente móvil del commonjsOptions.include de Vite en apps/web.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules')
];
module.exports = config;
