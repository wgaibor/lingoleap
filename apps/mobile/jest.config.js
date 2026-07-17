module.exports = {
  preset: 'jest-expo',
  setupFiles: ['<rootDir>/jest.setup.ts'],
  // En CI (runner de 2 cores) el primer render de cada suite paga la transformación
  // babel de RN/Expo/Supabase en frío y supera los 5s por defecto de Jest.
  testTimeout: 20000,
  // pnpm anida los paquetes reales bajo node_modules/.pnpm: el patrón por defecto de
  // jest-expo no los alcanza, así que se amplía para transformar RN/Expo/Supabase.
  transformIgnorePatterns: [
    'node_modules/(?!(?:\\.pnpm/[^/]+/node_modules/)?((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|expo-router|expo-modules-core|react-navigation|@react-navigation/.*|react-native-svg|@supabase/.*))'
  ]
};
