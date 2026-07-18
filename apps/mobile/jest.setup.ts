// AsyncStorage no existe en el entorno de test: mock oficial del paquete.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// React 19 + react-test-renderer no marcan el entorno como "act environment" por
// defecto: sin este flag, fireEvent/render no envuelven las actualizaciones de
// estado en act() de forma síncrona y las queries de `screen` (RNTL) pueden no
// ver el árbol recién montado o actualizado.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// expo-speech toca APIs nativas que no existen en el entorno jsdom/node de jest.
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn() }));
