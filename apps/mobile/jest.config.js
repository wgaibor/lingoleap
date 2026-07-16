module.exports = {
  preset: 'jest-expo',
  setupFiles: ['<rootDir>/jest.setup.ts'],
  // pnpm anida los paquetes reales bajo node_modules/.pnpm: el patrón por defecto de
  // jest-expo no los alcanza, así que se amplía para transformar RN/Expo/Supabase.
  transformIgnorePatterns: [
    'node_modules/(?!(?:\\.pnpm/[^/]+/node_modules/)?((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|expo-router|expo-modules-core|react-navigation|@react-navigation/.*|react-native-svg|@supabase/.*))'
  ]
};
